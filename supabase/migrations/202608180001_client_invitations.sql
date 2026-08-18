create table if not exists public.client_invitation_codes (
  code text primary key check (code ~ '^rich[0-9]{6}$'),
  created_by text not null references public.workspace_users(username) on delete cascade,
  recipient_name text not null default '',
  intake_id uuid not null unique,
  access_token text not null,
  login_count integer not null default 0 check (login_count >= 0),
  max_logins integer not null default 3 check (max_logins between 1 and 20),
  active boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (login_count <= max_logins)
);

create index if not exists client_invitation_codes_creator_created_idx
  on public.client_invitation_codes (created_by, created_at desc);

alter table public.client_invitation_codes enable row level security;
revoke all on public.client_invitation_codes from anon, authenticated;

create table if not exists public.workspace_customer_deletions (
  username text not null references public.workspace_users(username) on delete cascade,
  id uuid not null,
  source text not null check (source in ('advisor', 'self_service')),
  deleted_at timestamptz not null default now(),
  primary key (username, id)
);

create index if not exists workspace_customer_deletions_deleted_idx
  on public.workspace_customer_deletions (username, deleted_at desc);

alter table public.workspace_customer_deletions enable row level security;
revoke all on public.workspace_customer_deletions from anon, authenticated;

create or replace function public.workspace_create_client_invitation(
  p_username text,
  p_access_code text,
  p_recipient_name text default ''
)
returns table (
  code text,
  recipient_name text,
  intake_id uuid,
  login_count integer,
  max_logins integer,
  active boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  candidate text;
  random_bytes bytea;
  random_number bigint;
  created_record public.client_invitation_codes%rowtype;
begin
  if not public.workspace_username_allowed(p_username, p_access_code) then
    raise exception 'access_denied';
  end if;

  loop
    random_bytes := gen_random_bytes(4);
    random_number := (
      get_byte(random_bytes, 0)::bigint * 16777216
      + get_byte(random_bytes, 1)::bigint * 65536
      + get_byte(random_bytes, 2)::bigint * 256
      + get_byte(random_bytes, 3)::bigint
    ) % 1000000;
    candidate := 'rich' || lpad(random_number::text, 6, '0');

    begin
      insert into public.client_invitation_codes (
        code,
        created_by,
        recipient_name,
        intake_id,
        access_token
      ) values (
        candidate,
        lower(trim(p_username)),
        left(trim(coalesce(p_recipient_name, '')), 120),
        gen_random_uuid(),
        encode(gen_random_bytes(32), 'hex')
      ) returning * into created_record;
      exit;
    exception when unique_violation then
      -- A six-digit collision is rare; generate another code without overwriting.
      null;
    end;
  end loop;

  return query select
    created_record.code,
    created_record.recipient_name,
    created_record.intake_id,
    created_record.login_count,
    created_record.max_logins,
    created_record.active,
    created_record.created_at,
    created_record.updated_at;
end;
$$;

create or replace function public.workspace_list_client_invitations(
  p_username text,
  p_access_code text
)
returns table (
  code text,
  recipient_name text,
  intake_id uuid,
  login_count integer,
  max_logins integer,
  active boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.workspace_username_allowed(p_username, p_access_code) then
    raise exception 'access_denied';
  end if;

  return query
    select
      invitation.code,
      invitation.recipient_name,
      invitation.intake_id,
      invitation.login_count,
      invitation.max_logins,
      invitation.active,
      invitation.created_at,
      invitation.updated_at
    from public.client_invitation_codes invitation
    where invitation.created_by = lower(trim(p_username))
    order by invitation.created_at desc;
end;
$$;

create or replace function public.workspace_update_client_invitation(
  p_username text,
  p_access_code text,
  p_code text,
  p_recipient_name text
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.workspace_username_allowed(p_username, p_access_code) then
    raise exception 'access_denied';
  end if;

  update public.client_invitation_codes
  set recipient_name = left(trim(coalesce(p_recipient_name, '')), 120),
      updated_at = now()
  where code = lower(trim(p_code))
    and created_by = lower(trim(p_username));

  if not found then
    raise exception 'invitation_not_found';
  end if;
end;
$$;

create or replace function public.public_redeem_client_invitation(p_code text)
returns table (
  intake_id uuid,
  access_token text,
  login_count integer,
  max_logins integer
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  invitation public.client_invitation_codes%rowtype;
begin
  select record.* into invitation
  from public.client_invitation_codes record
  where record.code = lower(trim(p_code))
    and record.active = true
    and record.login_count < record.max_logins
  for update;

  if not found then
    raise exception 'invite_unavailable';
  end if;

  update public.client_invitation_codes
  set login_count = client_invitation_codes.login_count + 1,
      last_login_at = now(),
      updated_at = now()
  where code = invitation.code
  returning * into invitation;

  return query select
    invitation.intake_id,
    invitation.access_token,
    invitation.login_count,
    invitation.max_logins;
end;
$$;

create or replace function public.workspace_list_customer_deletions(p_username text, p_access_code text)
returns table (id uuid, source text, deleted_at timestamptz)
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.workspace_username_allowed(p_username, p_access_code) then
    raise exception 'access_denied';
  end if;

  return query
    select deletion.id, deletion.source, deletion.deleted_at
    from public.workspace_customer_deletions deletion
    where deletion.username = lower(trim(p_username))
    order by deletion.deleted_at desc;
end;
$$;

create or replace function public.workspace_upsert_customer(
  p_username text,
  p_access_code text,
  p_id uuid,
  p_document jsonb,
  p_client_updated_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.workspace_username_allowed(p_username, p_access_code) then
    raise exception 'access_denied';
  end if;
  if exists (
    select 1 from public.workspace_customer_deletions deletion
    where deletion.username = lower(trim(p_username)) and deletion.id = p_id
  ) then
    raise exception 'record_deleted';
  end if;

  insert into public.workspace_customer_records (username, id, document, client_updated_at)
  values (lower(trim(p_username)), p_id, p_document, p_client_updated_at)
  on conflict (username, id) do update
  set document = excluded.document,
      client_updated_at = excluded.client_updated_at,
      updated_at = now()
  where public.workspace_customer_records.client_updated_at <= excluded.client_updated_at;
end;
$$;

create or replace function public.workspace_delete_customer(p_username text, p_access_code text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.workspace_username_allowed(p_username, p_access_code) then
    raise exception 'access_denied';
  end if;

  insert into public.workspace_customer_deletions (username, id, source, deleted_at)
  values (lower(trim(p_username)), p_id, 'advisor', now())
  on conflict (username, id) do update
  set source = excluded.source,
      deleted_at = excluded.deleted_at;

  delete from public.workspace_customer_records
  where username = lower(trim(p_username)) and id = p_id;
end;
$$;

create or replace function public.public_upsert_intake(
  p_id uuid,
  p_access_token text,
  p_document jsonb,
  p_client_updated_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  expected_hash text := encode(digest(p_access_token, 'sha256'), 'hex');
  stored_hash text;
  safe_document jsonb;
begin
  if length(p_access_token) < 32
    or jsonb_typeof(p_document) <> 'object'
    or octet_length(p_document::text) > 1000000 then
    raise exception 'invalid_request';
  end if;
  if exists (
    select 1 from public.workspace_customer_deletions deletion
    where deletion.id = p_id and deletion.source = 'self_service'
  ) then
    raise exception 'record_deleted';
  end if;

  safe_document := jsonb_set(
    jsonb_set(p_document, '{id}', to_jsonb(p_id), true),
    '{source}',
    to_jsonb('self_service'::text),
    true
  );

  select record.access_hash into stored_hash
  from public.public_intake_records record
  where record.id = p_id;

  if stored_hash is null then
    insert into public.public_intake_records (id, access_hash, document, client_updated_at)
    values (p_id, expected_hash, safe_document, p_client_updated_at);
  elsif stored_hash <> expected_hash then
    raise exception 'access_denied';
  else
    update public.public_intake_records
    set document = safe_document,
        client_updated_at = p_client_updated_at,
        updated_at = now()
    where id = p_id and client_updated_at <= p_client_updated_at;
  end if;
end;
$$;

create or replace function public.workspace_upsert_public_intake(
  p_username text,
  p_access_code text,
  p_id uuid,
  p_document jsonb,
  p_client_updated_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.workspace_username_allowed(p_username, p_access_code) then raise exception 'access_denied'; end if;
  if exists (
    select 1 from public.workspace_customer_deletions deletion
    where deletion.id = p_id and deletion.source = 'self_service'
  ) then
    raise exception 'record_deleted';
  end if;

  update public.public_intake_records
  set document = jsonb_set(
        jsonb_set(p_document, '{id}', to_jsonb(p_id), true),
        '{source}',
        to_jsonb('self_service'::text),
        true
      ),
      client_updated_at = p_client_updated_at,
      updated_at = now()
  where id = p_id and client_updated_at <= p_client_updated_at;
end;
$$;

create or replace function public.workspace_delete_public_intake(p_username text, p_access_code text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.workspace_username_allowed(p_username, p_access_code) then raise exception 'access_denied'; end if;

  insert into public.workspace_customer_deletions (username, id, source, deleted_at)
  values (lower(trim(p_username)), p_id, 'self_service', now())
  on conflict (username, id) do update
  set source = excluded.source,
      deleted_at = excluded.deleted_at;

  delete from public.public_intake_records where id = p_id;
  update public.client_invitation_codes
  set active = false,
      updated_at = now()
  where intake_id = p_id
    and created_by = lower(trim(p_username));
end;
$$;

revoke all on function public.workspace_create_client_invitation(text, text, text) from public;
revoke all on function public.workspace_list_client_invitations(text, text) from public;
revoke all on function public.workspace_update_client_invitation(text, text, text, text) from public;
revoke all on function public.public_redeem_client_invitation(text) from public;
revoke all on function public.workspace_list_customer_deletions(text, text) from public;
revoke all on function public.workspace_upsert_customer(text, text, uuid, jsonb, timestamptz) from public;
revoke all on function public.workspace_delete_customer(text, text, uuid) from public;
revoke all on function public.public_upsert_intake(uuid, text, jsonb, timestamptz) from public;
revoke all on function public.workspace_upsert_public_intake(text, text, uuid, jsonb, timestamptz) from public;
revoke all on function public.workspace_delete_public_intake(text, text, uuid) from public;
grant execute on function public.workspace_create_client_invitation(text, text, text) to anon, authenticated;
grant execute on function public.workspace_list_client_invitations(text, text) to anon, authenticated;
grant execute on function public.workspace_update_client_invitation(text, text, text, text) to anon, authenticated;
grant execute on function public.public_redeem_client_invitation(text) to anon, authenticated;
grant execute on function public.workspace_list_customer_deletions(text, text) to anon, authenticated;
grant execute on function public.workspace_upsert_customer(text, text, uuid, jsonb, timestamptz) to anon, authenticated;
grant execute on function public.workspace_delete_customer(text, text, uuid) to anon, authenticated;
grant execute on function public.public_upsert_intake(uuid, text, jsonb, timestamptz) to anon, authenticated;
grant execute on function public.workspace_upsert_public_intake(text, text, uuid, jsonb, timestamptz) to anon, authenticated;
grant execute on function public.workspace_delete_public_intake(text, text, uuid) to anon, authenticated;

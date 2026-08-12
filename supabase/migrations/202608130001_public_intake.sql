create table if not exists public.public_intake_records (
  id uuid primary key,
  access_hash text not null,
  document jsonb not null,
  client_updated_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists public_intake_records_updated_idx
  on public.public_intake_records (client_updated_at desc);

alter table public.public_intake_records enable row level security;
revoke all on public.public_intake_records from anon, authenticated;

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

create or replace function public.public_get_intake(p_id uuid, p_access_token text)
returns table (id uuid, client_updated_at timestamptz, document jsonb)
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not exists (
    select 1 from public.public_intake_records record
    where record.id = p_id
      and record.access_hash = encode(digest(p_access_token, 'sha256'), 'hex')
  ) then
    raise exception 'record_not_found';
  end if;
  return query
    select record.id, record.client_updated_at, record.document
    from public.public_intake_records record
    where record.id = p_id;
end;
$$;

create or replace function public.workspace_list_public_intakes(p_username text, p_access_code text)
returns table (id uuid, client_updated_at timestamptz, document jsonb)
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.workspace_username_allowed(p_username, p_access_code) then raise exception 'access_denied'; end if;
  return query
    select record.id, record.client_updated_at, record.document
    from public.public_intake_records record
    order by record.client_updated_at desc;
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
  delete from public.public_intake_records where id = p_id;
end;
$$;

revoke all on function public.public_upsert_intake(uuid, text, jsonb, timestamptz) from public;
revoke all on function public.public_get_intake(uuid, text) from public;
revoke all on function public.workspace_list_public_intakes(text, text) from public;
revoke all on function public.workspace_upsert_public_intake(text, text, uuid, jsonb, timestamptz) from public;
revoke all on function public.workspace_delete_public_intake(text, text, uuid) from public;
grant execute on function public.public_upsert_intake(uuid, text, jsonb, timestamptz) to anon, authenticated;
grant execute on function public.public_get_intake(uuid, text) to anon, authenticated;
grant execute on function public.workspace_list_public_intakes(text, text) to anon, authenticated;
grant execute on function public.workspace_upsert_public_intake(text, text, uuid, jsonb, timestamptz) to anon, authenticated;
grant execute on function public.workspace_delete_public_intake(text, text, uuid) to anon, authenticated;

alter table public.workspace_users
  add column if not exists access_hash text;

drop function if exists public.workspace_username_allowed(text);
drop function if exists public.workspace_list_customers(text);
drop function if exists public.workspace_upsert_customer(text, uuid, jsonb, timestamptz);
drop function if exists public.workspace_delete_customer(text, uuid);

create or replace function public.workspace_username_allowed(p_username text, p_access_code text)
returns boolean
language sql
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1 from public.workspace_users
    where username = lower(trim(p_username))
      and active = true
      and access_hash is not null
      and access_hash = crypt(p_access_code, access_hash)
  );
$$;

create or replace function public.workspace_list_customers(p_username text, p_access_code text)
returns table (id uuid, client_updated_at timestamptz, document jsonb)
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.workspace_username_allowed(p_username, p_access_code) then
    raise exception 'access_denied';
  end if;
  return query
    select record.id, record.client_updated_at, record.document
    from public.workspace_customer_records record
    where record.username = lower(trim(p_username))
    order by record.client_updated_at desc;
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
  delete from public.workspace_customer_records
  where username = lower(trim(p_username)) and id = p_id;
end;
$$;

revoke all on function public.workspace_username_allowed(text, text) from public;
revoke all on function public.workspace_list_customers(text, text) from public;
revoke all on function public.workspace_upsert_customer(text, text, uuid, jsonb, timestamptz) from public;
revoke all on function public.workspace_delete_customer(text, text, uuid) from public;
grant execute on function public.workspace_username_allowed(text, text) to anon, authenticated;
grant execute on function public.workspace_list_customers(text, text) to anon, authenticated;
grant execute on function public.workspace_upsert_customer(text, text, uuid, jsonb, timestamptz) to anon, authenticated;
grant execute on function public.workspace_delete_customer(text, text, uuid) to anon, authenticated;

-- Set each user's password hash separately in the Supabase SQL Editor.
-- Never commit the plaintext password or its per-user hash to GitHub.

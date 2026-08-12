create table if not exists public.workspace_users (
  username text primary key check (username = lower(trim(username))),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.workspace_users (username, active)
values ('jojo', true)
on conflict (username) do update set active = excluded.active;

create table if not exists public.workspace_customer_records (
  username text not null references public.workspace_users(username) on delete cascade,
  id uuid not null,
  document jsonb not null,
  client_updated_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (username, id)
);

alter table public.workspace_users enable row level security;
alter table public.workspace_customer_records enable row level security;
revoke all on public.workspace_users from anon, authenticated;
revoke all on public.workspace_customer_records from anon, authenticated;

create or replace function public.workspace_username_allowed(p_username text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.workspace_users
    where username = lower(trim(p_username)) and active = true
  );
$$;

create or replace function public.workspace_list_customers(p_username text)
returns table (id uuid, client_updated_at timestamptz, document jsonb)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.workspace_username_allowed(p_username) then
    raise exception 'username_not_allowed';
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
  p_id uuid,
  p_document jsonb,
  p_client_updated_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.workspace_username_allowed(p_username) then
    raise exception 'username_not_allowed';
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

create or replace function public.workspace_delete_customer(p_username text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.workspace_username_allowed(p_username) then
    raise exception 'username_not_allowed';
  end if;
  delete from public.workspace_customer_records
  where username = lower(trim(p_username)) and id = p_id;
end;
$$;

revoke all on function public.workspace_username_allowed(text) from public;
revoke all on function public.workspace_list_customers(text) from public;
revoke all on function public.workspace_upsert_customer(text, uuid, jsonb, timestamptz) from public;
revoke all on function public.workspace_delete_customer(text, uuid) from public;
grant execute on function public.workspace_username_allowed(text) to anon, authenticated;
grant execute on function public.workspace_list_customers(text) to anon, authenticated;
grant execute on function public.workspace_upsert_customer(text, uuid, jsonb, timestamptz) to anon, authenticated;
grant execute on function public.workspace_delete_customer(text, uuid) to anon, authenticated;

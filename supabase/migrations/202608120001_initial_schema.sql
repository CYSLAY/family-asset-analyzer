create extension if not exists pgcrypto;

create table if not exists public.customer_records (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  document jsonb not null,
  client_updated_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customer_records_owner_updated_idx
  on public.customer_records (owner_id, client_updated_at desc);

alter table public.customer_records enable row level security;

create policy "Users can read their own customer records"
  on public.customer_records for select
  using (auth.uid() = owner_id);

create policy "Users can insert their own customer records"
  on public.customer_records for insert
  with check (auth.uid() = owner_id);

create policy "Users can update their own customer records"
  on public.customer_records for update
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy "Users can delete their own customer records"
  on public.customer_records for delete
  using (auth.uid() = owner_id);

create table if not exists public.analysis_snapshots (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  customer_id uuid not null,
  snapshot jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists analysis_snapshots_owner_customer_idx
  on public.analysis_snapshots (owner_id, customer_id, created_at desc);

alter table public.analysis_snapshots enable row level security;

create policy "Users can read their own analysis snapshots"
  on public.analysis_snapshots for select
  using (auth.uid() = owner_id);

create policy "Users can insert their own analysis snapshots"
  on public.analysis_snapshots for insert
  with check (auth.uid() = owner_id);

create policy "Users can delete their own analysis snapshots"
  on public.analysis_snapshots for delete
  using (auth.uid() = owner_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_customer_records_updated_at on public.customer_records;
create trigger set_customer_records_updated_at
before update on public.customer_records
for each row execute function public.set_updated_at();

revoke all on public.customer_records from anon;
revoke all on public.analysis_snapshots from anon;
grant select, insert, update, delete on public.customer_records to authenticated;
grant select, insert, delete on public.analysis_snapshots to authenticated;

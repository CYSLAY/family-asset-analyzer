-- Incremental authentication upgrade. No customer documents or password hashes change.
create table if not exists public.workspace_sessions (
  token_hash text primary key, username text not null references public.workspace_users(username),
  expires_at timestamptz not null, created_at timestamptz not null default now()
);
create table if not exists public.workspace_login_limits (
  bucket text primary key, starts_at timestamptz not null default now(), attempts integer not null default 0
);
alter table public.workspace_sessions enable row level security;
alter table public.workspace_login_limits enable row level security;
revoke all on public.workspace_sessions, public.workspace_login_limits from public, anon, authenticated;

create or replace function public.internal_take_login_slot(p_bucket text,p_max integer,p_seconds integer)
returns boolean language plpgsql security definer set search_path=public,extensions as $$
declare n integer;
begin
  insert into public.workspace_login_limits(bucket,starts_at,attempts) values(p_bucket,now(),1)
  on conflict(bucket) do update set
    attempts=case when workspace_login_limits.starts_at < now()-make_interval(secs=>p_seconds) then 1 else workspace_login_limits.attempts+1 end,
    starts_at=case when workspace_login_limits.starts_at < now()-make_interval(secs=>p_seconds) then now() else workspace_login_limits.starts_at end
  returning attempts into n;
  return n<=p_max;
end; $$;
revoke all on function public.internal_take_login_slot(text,integer,integer) from public,anon,authenticated;

create or replace function public.workspace_login(p_username text,p_password text)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare u text:=lower(trim(p_username)); token text; expiry timestamptz:=now()+interval '8 hours';
begin
  -- Counters must commit on failed authentication: return a result, never raise after incrementing.
  if p_username is null or length(p_username)>120 or p_password is null or octet_length(p_password)>72 then return jsonb_build_object('error','access_denied'); end if;
  if not public.internal_take_login_slot('login-global',120,60) then return jsonb_build_object('error','rate_limited'); end if;
  if not public.internal_take_login_slot('login:'||u,8,900) then return jsonb_build_object('error','rate_limited'); end if;
  if not exists(select 1 from public.workspace_users w where w.username=u and w.active and w.access_hash=crypt(p_password,w.access_hash)) then return jsonb_build_object('error','access_denied'); end if;
  delete from public.workspace_login_limits where bucket='login:'||u;
  delete from public.workspace_sessions where expires_at<now();
  token:='ws_'||encode(gen_random_bytes(32),'hex');
  insert into public.workspace_sessions(token_hash,username,expires_at) values(encode(digest(token,'sha256'),'hex'),u,expiry);
  return jsonb_build_object('token',token,'expiresAt',expiry,'username',u);
end; $$;

create or replace function public.workspace_username_allowed(p_username text,p_access_code text)
returns boolean language sql security definer set search_path=public,extensions as $$
  select coalesce(p_access_code like 'ws_%',false) and exists(
    select 1 from public.workspace_sessions s join public.workspace_users u on u.username=s.username
    where s.username=lower(trim(p_username)) and u.active and s.expires_at>now()
      and s.token_hash=encode(digest(p_access_code,'sha256'),'hex'));
$$;
create or replace function public.workspace_logout(p_access_code text)
returns void language sql security definer set search_path=public,extensions as $$
  delete from public.workspace_sessions where token_hash=encode(digest(p_access_code,'sha256'),'hex');
$$;

do $$ begin
  if to_regprocedure('public.internal_redeem_invitation_202608(text)') is null then
    alter function public.public_redeem_client_invitation(text) rename to internal_redeem_invitation_202608;
  end if;
end; $$;
revoke all on function public.internal_redeem_invitation_202608(text) from public,anon,authenticated;
create or replace function public.public_redeem_client_invitation(p_code text)
returns table(intake_id uuid,access_token text,login_count integer,max_logins integer)
language plpgsql security definer set search_path=public,extensions as $$
begin
  -- Global abuse limit (not an IP limit); valid users may need to retry after one minute.
  if not public.internal_take_login_slot('invitation-global',60,60) then return; end if;
  begin
    return query select * from public.internal_redeem_invitation_202608(p_code);
  exception when others then
    if sqlerrm <> 'invite_unavailable' then raise; end if;
    return;
  end;
end; $$;
revoke all on function public.workspace_login(text,text),public.workspace_logout(text),public.workspace_username_allowed(text,text),public.public_redeem_client_invitation(text) from public;
grant execute on function public.workspace_login(text,text),public.workspace_logout(text),public.workspace_username_allowed(text,text),public.public_redeem_client_invitation(text) to anon,authenticated;

-- Incremental guard layer. Customer documents and invitation counters are unchanged.
-- Retired implementations are private, so old RPC names cannot bypass the guards.
do $$
begin
  if to_regprocedure('public.internal_intake_upsert_202608(uuid,text,jsonb,timestamptz)') is null then
    alter function public.public_upsert_intake(uuid,text,jsonb,timestamptz) rename to internal_intake_upsert_202608;
    alter function public.public_get_intake(uuid,text) rename to internal_intake_get_202608;
    alter function public.workspace_upsert_public_intake(text,text,uuid,jsonb,timestamptz) rename to internal_advisor_intake_upsert_202608;
    alter function public.workspace_delete_public_intake(text,text,uuid) rename to internal_advisor_intake_delete_202608;
  end if;
end;
$$;
revoke all on function public.internal_intake_upsert_202608(uuid,text,jsonb,timestamptz) from public, anon, authenticated;
revoke all on function public.internal_intake_get_202608(uuid,text) from public, anon, authenticated;
revoke all on function public.internal_advisor_intake_upsert_202608(text,text,uuid,jsonb,timestamptz) from public, anon, authenticated;
revoke all on function public.internal_advisor_intake_delete_202608(text,text,uuid) from public, anon, authenticated;

create or replace function public.internal_require_intake_access(p_id uuid, p_token text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare invitation public.client_invitation_codes%rowtype; legacy_hash text;
begin
  if p_id is null or p_token is null or length(p_token) < 32 then raise exception 'access_denied'; end if;
  if exists (select 1 from public.workspace_customer_deletions d where d.id=p_id and d.source='self_service') then
    raise exception 'record_deleted';
  end if;
  -- Serialize revocation with in-flight reads/writes. A third valid redemption
  -- remains usable: max_logins restricts new redemptions, not its active token.
  select * into invitation from public.client_invitation_codes i where i.intake_id=p_id for share;
  if found then
    if not invitation.active or invitation.login_count < 1 or invitation.access_token <> p_token then
      raise exception 'access_denied';
    end if;
  else
    -- Legacy compatibility only permits access to an existing matching record.
    select r.access_hash into legacy_hash from public.public_intake_records r where r.id=p_id for share;
    if legacy_hash is null or legacy_hash<>encode(digest(p_token,'sha256'),'hex') then raise exception 'access_denied'; end if;
  end if;
end;
$$;
revoke all on function public.internal_require_intake_access(uuid,text) from public, anon, authenticated;

create or replace function public.internal_advisor_owns_intake(p_username text, p_id uuid)
returns boolean language sql security definer set search_path = public, extensions as $$
  select exists (select 1 from public.client_invitation_codes i where i.intake_id=p_id and i.created_by=lower(trim(p_username)))
    or (lower(trim(p_username))='jojo'
      and exists (select 1 from public.public_intake_records r where r.id=p_id)
      and not exists (select 1 from public.client_invitation_codes i where i.intake_id=p_id));
$$;
revoke all on function public.internal_advisor_owns_intake(text,uuid) from public, anon, authenticated;

create or replace function public.public_upsert_intake(p_id uuid,p_access_token text,p_document jsonb,p_client_updated_at timestamptz)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  perform public.internal_require_intake_access(p_id,p_access_token);
  if p_document is null or p_client_updated_at is null or jsonb_typeof(p_document)<>'object' or octet_length(p_document::text)>1000000 then
    raise exception 'invalid_request';
  end if;
  perform public.internal_intake_upsert_202608(p_id,p_access_token,p_document,p_client_updated_at);
end;
$$;

create or replace function public.public_get_intake(p_id uuid,p_access_token text)
returns table(id uuid,client_updated_at timestamptz,document jsonb)
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform public.internal_require_intake_access(p_id,p_access_token);
  return query select * from public.internal_intake_get_202608(p_id,p_access_token);
end;
$$;

create or replace function public.workspace_list_public_intakes(p_username text,p_access_code text)
returns table(id uuid,client_updated_at timestamptz,document jsonb)
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.workspace_username_allowed(p_username,p_access_code) then raise exception 'access_denied'; end if;
  return query select r.id,r.client_updated_at,r.document from public.public_intake_records r
    where public.internal_advisor_owns_intake(p_username,r.id) order by r.client_updated_at desc;
end;
$$;

create or replace function public.workspace_upsert_public_intake(p_username text,p_access_code text,p_id uuid,p_document jsonb,p_client_updated_at timestamptz)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.workspace_username_allowed(p_username,p_access_code) or not public.internal_advisor_owns_intake(p_username,p_id) then
    raise exception 'access_denied';
  end if;
  if p_document is null or p_client_updated_at is null or jsonb_typeof(p_document)<>'object' or octet_length(p_document::text)>1000000 then
    raise exception 'invalid_request';
  end if;
  perform public.internal_advisor_intake_upsert_202608(p_username,p_access_code,p_id,p_document,p_client_updated_at);
end;
$$;

create or replace function public.workspace_delete_public_intake(p_username text,p_access_code text,p_id uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.workspace_username_allowed(p_username,p_access_code) or not public.internal_advisor_owns_intake(p_username,p_id) then
    raise exception 'access_denied';
  end if;
  -- Lock invitation before deleting, matching the writer's lock order.
  perform 1 from public.client_invitation_codes i where i.intake_id=p_id for update;
  perform public.internal_advisor_intake_delete_202608(p_username,p_access_code,p_id);
end;
$$;

revoke all on function public.public_upsert_intake(uuid,text,jsonb,timestamptz) from public;
revoke all on function public.public_get_intake(uuid,text) from public;
revoke all on function public.workspace_list_public_intakes(text,text) from public;
revoke all on function public.workspace_upsert_public_intake(text,text,uuid,jsonb,timestamptz) from public;
revoke all on function public.workspace_delete_public_intake(text,text,uuid) from public;
grant execute on function public.public_upsert_intake(uuid,text,jsonb,timestamptz) to anon, authenticated;
grant execute on function public.public_get_intake(uuid,text) to anon, authenticated;
grant execute on function public.workspace_list_public_intakes(text,text) to anon, authenticated;
grant execute on function public.workspace_upsert_public_intake(text,text,uuid,jsonb,timestamptz) to anon, authenticated;
grant execute on function public.workspace_delete_public_intake(text,text,uuid) to anon, authenticated;

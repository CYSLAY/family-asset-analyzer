alter table public.workspace_customer_records add column if not exists revision bigint not null default 1;
alter table public.public_intake_records add column if not exists revision bigint not null default 1;

create or replace function public.sync_list_v2(p_username text,p_credential text,p_id uuid default null)
returns table(id uuid,source text,revision bigint,document jsonb)
language plpgsql security definer set search_path=public,extensions as $$
begin
  if coalesce(p_username,'')='' then
    perform public.internal_require_intake_access(p_id,p_credential);
    return query select r.id,'self_service'::text,r.revision,r.document from public.public_intake_records r where r.id=p_id;
  else
    if not public.workspace_username_allowed(p_username,p_credential) then raise exception 'access_denied'; end if;
    return query select r.id,'advisor'::text,r.revision,r.document from public.workspace_customer_records r where r.username=lower(trim(p_username));
    return query select r.id,'self_service'::text,r.revision,r.document from public.public_intake_records r where public.internal_advisor_owns_intake(p_username,r.id);
  end if;
end; $$;

create or replace function public.sync_write_v2(p_username text,p_credential text,p_id uuid,p_source text,p_expected_revision bigint,p_document jsonb)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare current_revision bigint; current_document jsonb; safe_document jsonb; u text:=lower(trim(coalesce(p_username,''))); token_hash text;
begin
  if p_id is null or p_source is null or p_source not in ('advisor','self_service') or p_expected_revision is null or p_expected_revision<0 or p_document is null or jsonb_typeof(p_document)<>'object' or octet_length(p_document::text)>1000000 then raise exception 'invalid_request'; end if;
  perform pg_advisory_xact_lock(hashtextextended('customer:'||p_id::text,0));
  if u='' then
    if p_source<>'self_service' then raise exception 'access_denied'; end if;
    perform public.internal_require_intake_access(p_id,p_credential);
  elsif not public.workspace_username_allowed(u,p_credential) or (p_source='self_service' and not public.internal_advisor_owns_intake(u,p_id)) then raise exception 'access_denied'; end if;
  if exists(select 1 from public.workspace_customer_deletions d where d.id=p_id and (d.username=u or d.source='self_service')) then raise exception 'record_deleted'; end if;
  if p_source='advisor' then
    select r.revision,r.document into current_revision,current_document from public.workspace_customer_records r where r.id=p_id and r.username=u for update;
  else
    select r.revision,r.document into current_revision,current_document from public.public_intake_records r where r.id=p_id for update;
    if u<>'' and current_revision is null then raise exception 'record_not_found'; end if;
  end if;
  safe_document:=jsonb_set(jsonb_set(p_document,'{id}',to_jsonb(p_id),true),'{source}',to_jsonb(p_source),true);
  -- Retried requests whose acknowledgement was lost must not become false conflicts.
  if current_document=safe_document then return jsonb_build_object('status','accepted','revision',current_revision,'document',current_document); end if;
  if coalesce(current_revision,0)<>p_expected_revision then return jsonb_build_object('status','conflict','revision',coalesce(current_revision,0),'document',current_document); end if;
  if p_source='advisor' then
    insert into public.workspace_customer_records(username,id,document,client_updated_at,revision) values(u,p_id,safe_document,now(),1)
    on conflict(username,id) do update set document=excluded.document,client_updated_at=now(),updated_at=now(),revision=workspace_customer_records.revision+1 returning revision into current_revision;
  else
    token_hash:=encode(digest(p_credential,'sha256'),'hex');
    insert into public.public_intake_records(id,access_hash,document,client_updated_at,revision) values(p_id,token_hash,safe_document,now(),1)
    on conflict(id) do update set document=excluded.document,client_updated_at=now(),updated_at=now(),revision=public_intake_records.revision+1 returning revision into current_revision;
  end if;
  return jsonb_build_object('status','accepted','revision',current_revision,'document',safe_document);
end; $$;

-- Retire timestamp-based writes. Old pages must refresh rather than bypass revision checks.
revoke all on function public.workspace_upsert_customer(text,text,uuid,jsonb,timestamptz),public.workspace_upsert_public_intake(text,text,uuid,jsonb,timestamptz),public.public_upsert_intake(uuid,text,jsonb,timestamptz) from public,anon,authenticated;

do $$ begin
  if to_regprocedure('public.internal_delete_customer_202608(text,text,uuid)') is null then
    alter function public.workspace_delete_customer(text,text,uuid) rename to internal_delete_customer_202608;
    alter function public.workspace_delete_public_intake(text,text,uuid) rename to internal_delete_intake_guard_202609;
  end if;
end; $$;
revoke all on function public.internal_delete_customer_202608(text,text,uuid),public.internal_delete_intake_guard_202609(text,text,uuid) from public,anon,authenticated;
create or replace function public.workspace_delete_customer(p_username text,p_access_code text,p_id uuid)
returns void language plpgsql security definer set search_path=public,extensions as $$ begin
  perform pg_advisory_xact_lock(hashtextextended('customer:'||p_id::text,0));
  perform public.internal_delete_customer_202608(p_username,p_access_code,p_id);
end; $$;
create or replace function public.workspace_delete_public_intake(p_username text,p_access_code text,p_id uuid)
returns void language plpgsql security definer set search_path=public,extensions as $$ begin
  perform pg_advisory_xact_lock(hashtextextended('customer:'||p_id::text,0));
  perform public.internal_delete_intake_guard_202609(p_username,p_access_code,p_id);
end; $$;
revoke all on function public.sync_list_v2(text,text,uuid),public.sync_write_v2(text,text,uuid,text,bigint,jsonb),public.workspace_delete_customer(text,text,uuid),public.workspace_delete_public_intake(text,text,uuid) from public;
grant execute on function public.sync_list_v2(text,text,uuid),public.sync_write_v2(text,text,uuid,text,bigint,jsonb),public.workspace_delete_customer(text,text,uuid),public.workspace_delete_public_intake(text,text,uuid) to anon,authenticated;

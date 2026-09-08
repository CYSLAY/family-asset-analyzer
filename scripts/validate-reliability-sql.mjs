// Emit an isolated, rollback-only test. Pipe into the SQL editor clipboard; no credentials/data are read.
import { readFileSync } from 'node:fs'
const schema = 'audit_reliability_20260908'
const files = ['202609080002_advisor_sessions.sql', '202609080003_revision_sync.sql']
const migrations = files.map(file => readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8').replaceAll('public.', `${schema}.`).replaceAll('search_path=public', `search_path=${schema}`)).join('\n')
process.stdout.write(`begin;
set local lock_timeout='3s';
set local statement_timeout='30s';
create schema ${schema};
set local check_function_bodies=false;
do $clone$ declare n text; r record; begin
  foreach n in array array['workspace_users','workspace_customer_records','public_intake_records','client_invitation_codes','workspace_customer_deletions'] loop
    execute format('create table ${schema}.%I (like public.%I including all)',n,n);
  end loop;
  for r in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f' and not exists(select 1 from pg_depend d where d.objid=p.oid and d.classid='pg_proc'::regclass and d.deptype='e') loop
    execute replace(replace(pg_get_functiondef(r.oid),'public.','${schema}.'),'search_path TO ''public''','search_path TO ''${schema}''');
  end loop;
end; $clone$;
${migrations}
${migrations}
set local check_function_bodies=true;
do $test$ declare token text; other_token text; a jsonb; c uuid:=gen_random_uuid(); d jsonb; i integer; begin
insert into ${schema}.workspace_users(username,active,access_hash) values('audit-a',true,crypt('isolated-test-only',gen_salt('bf',4))),('audit-b',true,crypt('isolated-test-only',gen_salt('bf',4)));
token:= ${schema}.workspace_login('audit-a','isolated-test-only')->>'token';
other_token:= ${schema}.workspace_login('audit-b','isolated-test-only')->>'token';
if token is null or not ${schema}.workspace_username_allowed('audit-a',token) or ${schema}.workspace_username_allowed('audit-b',token) or ${schema}.workspace_username_allowed('audit-a','isolated-test-only') then raise exception 'session isolation failed'; end if;
d:=jsonb_build_object('id',c,'source','advisor','primaryContactName','test','updatedAt','2000-01-01T00:00:00Z');
a:=${schema}.sync_write_v2('audit-a',token,c,'advisor',0,d);
if a->>'status'<>'accepted' or (a->>'revision')::int<>1 then raise exception 'first write failed'; end if;
a:=${schema}.sync_write_v2('audit-a',token,c,'advisor',0,d);
if a->>'status'<>'accepted' or (a->>'revision')::int<>1 then raise exception 'retry not idempotent'; end if;
a:=${schema}.sync_write_v2('audit-a',token,c,'advisor',0,d||'{"city":"stale"}'::jsonb);
if a->>'status'<>'conflict' then raise exception 'conflict missing'; end if;
a:=${schema}.sync_write_v2('audit-a',token,c,'advisor',1,d||'{"city":"current"}'::jsonb);
if (a->>'revision')::int<>2 then raise exception 'revision increment failed'; end if;
if exists(select 1 from ${schema}.sync_list_v2('audit-b',other_token,null)) then raise exception 'cross advisor read'; end if;
perform ${schema}.workspace_delete_customer('audit-a',token,c);
begin perform ${schema}.sync_write_v2('audit-a',token,c,'advisor',2,d); raise exception 'resurrected'; exception when others then if sqlerrm<>'record_deleted' then raise; end if; end;
for i in 1..8 loop a:=${schema}.workspace_login('audit-a','incorrect-test-value'); if a->>'error'<>'access_denied' then raise exception 'failure result incorrect'; end if; end loop;
a:=${schema}.workspace_login('audit-a','isolated-test-only'); if a->>'error'<>'rate_limited' then raise exception 'login not limited'; end if;
perform ${schema}.workspace_logout(token);
if ${schema}.workspace_username_allowed('audit-a',token) then raise exception 'logout failed'; end if;
if has_function_privilege('anon','${schema}.internal_take_login_slot(text,integer,integer)','execute') or has_function_privilege('anon','${schema}.workspace_upsert_customer(text,text,uuid,jsonb,timestamptz)','execute') then raise exception 'legacy bypass'; end if;
end; $test$;
rollback;
select 'Passed isolated session, throttling, revision, idempotency, ownership, deletion, ACL and repeat migration checks; test schema rolled back' as result;
`)

create or replace function public.workspace_delete_client_invitation(
  p_username text,
  p_access_code text,
  p_code text
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

  update public.client_invitation_codes invitation
  set active = false,
      updated_at = now()
  where invitation.code = lower(trim(p_code))
    and invitation.created_by = lower(trim(p_username))
    and invitation.active = true
    and not exists (
      select 1
      from public.public_intake_records intake
      where intake.id = invitation.intake_id
    );

  if not found then
    raise exception 'invitation_has_customer_or_not_found';
  end if;
end;
$$;

revoke all on function public.workspace_delete_client_invitation(text, text, text) from public;
grant execute on function public.workspace_delete_client_invitation(text, text, text) to anon, authenticated;

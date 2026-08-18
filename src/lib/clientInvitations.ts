import { supabase } from './supabase'

export interface ClientInvitation {
  code: string
  recipientName: string
  intakeId: string
  loginCount: number
  maxLogins: number
  active: boolean
  createdAt: string
  updatedAt: string
}

interface RemoteInvitation {
  code: string
  recipient_name: string
  intake_id: string
  login_count: number
  max_logins: number
  active: boolean
  created_at: string
  updated_at: string
}

function mapInvitation(record: RemoteInvitation): ClientInvitation {
  return {
    code: record.code,
    recipientName: record.recipient_name,
    intakeId: record.intake_id,
    loginCount: record.login_count,
    maxLogins: record.max_logins,
    active: record.active,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  }
}

export async function listClientInvitations(username: string, accessCode: string) {
  if (!supabase) throw new Error('cloud_unavailable')
  const { data, error } = await supabase.rpc('workspace_list_client_invitations', { p_username: username, p_access_code: accessCode })
  if (error) throw error
  return ((data ?? []) as RemoteInvitation[]).map(mapInvitation)
}

export async function createClientInvitation(username: string, accessCode: string, recipientName: string) {
  if (!supabase) throw new Error('cloud_unavailable')
  const { data, error } = await supabase.rpc('workspace_create_client_invitation', {
    p_username: username,
    p_access_code: accessCode,
    p_recipient_name: recipientName,
  })
  if (error) throw error
  const record = ((data ?? []) as RemoteInvitation[])[0]
  if (!record) throw new Error('invitation_not_created')
  return mapInvitation(record)
}

export async function updateClientInvitationRecipient(username: string, accessCode: string, code: string, recipientName: string) {
  if (!supabase) throw new Error('cloud_unavailable')
  const { error } = await supabase.rpc('workspace_update_client_invitation', {
    p_username: username,
    p_access_code: accessCode,
    p_code: code,
    p_recipient_name: recipientName,
  })
  if (error) throw error
}

export function invitationAccessState(invitation: Pick<ClientInvitation, 'active' | 'loginCount' | 'maxLogins'>) {
  if (!invitation.active) return '已停用'
  if (invitation.loginCount >= invitation.maxLogins) return '次数已用完'
  return '可使用'
}

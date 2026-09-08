import { type CustomerProfile } from '../types/domain'
import { sameDocument } from './documentEquality'
import { supabase } from './supabase'
import { migrateCustomerProfile } from './customerMigrations'
import { fetchVersionedCustomers, writeVersionedCustomer } from './revisionSync'
import { acknowledgeCustomer, getCustomers, getLocalWorkspace, getSyncMetadata, preserveConflict } from './localDb'

const SESSION_KEY = 'family-asset-self-service-session'

export interface PublicIntakeSession { id: string; token: string; uploaded?: boolean }

interface RedeemedInvitation {
  intake_id: string
  access_token: string
  login_count: number
  max_logins: number
}

interface RemoteRecord {
  id: string
  client_updated_at: string
  document: CustomerProfile
}

export function getPublicIntakeSession(): PublicIntakeSession | null {
  const raw = localStorage.getItem(SESSION_KEY)
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as PublicIntakeSession
    return value.id && value.token ? value : null
  } catch { return null }
}

export function savePublicIntakeSession(session: PublicIntakeSession) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
}

export function clearPublicIntakeSession() {
  localStorage.removeItem(SESSION_KEY)
}

function markSessionUploaded(session: PublicIntakeSession) {
  const current = getPublicIntakeSession()
  // A completed request must not restore credentials after logout or replace
  // a different invitation redeemed while the request was in flight.
  if (current?.id === session.id && current.token === session.token) savePublicIntakeSession({ ...current, uploaded: true })
}

export async function redeemClientInvitation(code: string) {
  if (!supabase) throw new Error('cloud_unavailable')
  const { data, error } = await supabase.rpc('public_redeem_client_invitation', { p_code: code.trim().toLowerCase() })
  if (error) throw error
  const record = ((data ?? []) as RedeemedInvitation[])[0]
  if (!record?.intake_id || !record.access_token) throw new Error('invite_unavailable')
  const session = { id: record.intake_id, token: record.access_token }
  savePublicIntakeSession(session)
  return { session, loginCount: record.login_count, maxLogins: record.max_logins }
}

export async function fetchPublicIntake(session: PublicIntakeSession) {
  if (!supabase) return null
  const workspace = getLocalWorkspace()
  const record = (await fetchVersionedCustomers('', session.token, session.id))[0]
  if (!record) return null
  if (workspace !== getLocalWorkspace()) throw Error('workspace_changed')
  const remote = { ...migrateCustomerProfile(record.document).customer, source: 'self_service' as const }
  const local = (await getCustomers()).find(customer => customer.id === session.id)
  const base = await getSyncMetadata(session.id, workspace)
  if (local && !sameDocument(local, base?.document) && !sameDocument(local, remote)) {
    if (!base || base.revision !== record.revision) await preserveConflict(local, remote, record.revision, workspace)
    markSessionUploaded(session)
    return local
  }
  await acknowledgeCustomer(remote, record.revision, workspace)
  markSessionUploaded(session)
  return remote
}

export async function pushPublicIntake(session: PublicIntakeSession, customer: CustomerProfile) {
  if (!supabase) throw new Error('cloud_unavailable')
  const document = { ...customer, source: 'self_service' as const }
  await writeVersionedCustomer('', session.token, document)
  markSessionUploaded(session)
}

export async function listPublicIntakesForAdvisor(username: string, accessCode: string) {
  if (!supabase) return []
  const { data, error } = await supabase.rpc('workspace_list_public_intakes', { p_username: username, p_access_code: accessCode })
  if (error) throw error
  return ((data ?? []) as RemoteRecord[])
    .map((record) => ({ ...migrateCustomerProfile(record.document).customer, source: 'self_service' as const }))
}

export async function pushPublicIntakeAsAdvisor(username: string, accessCode: string, customer: CustomerProfile) {
  await writeVersionedCustomer(username, accessCode, { ...customer, source: 'self_service' as const })
}

export async function deletePublicIntakeAsAdvisor(username: string, accessCode: string, id: string) {
  if (!supabase) throw new Error('cloud_unavailable')
  const { error } = await supabase.rpc('workspace_delete_public_intake', { p_username: username, p_access_code: accessCode, p_id: id })
  if (error) throw error
}

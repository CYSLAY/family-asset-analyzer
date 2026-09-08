import type { CustomerProfile } from '../types/domain'
import { acknowledgeCustomer, getLocalWorkspace, getSyncMetadata, preserveConflict } from './localDb'
import { supabase } from './supabase'

export interface VersionedCustomer { id: string; source: 'advisor' | 'self_service'; revision: number; document: CustomerProfile }
export async function fetchVersionedCustomers(username: string, credential: string, id: string | null = null): Promise<VersionedCustomer[]> {
  if (!supabase) throw Error('cloud_unavailable')
  const { data, error } = await supabase.rpc('sync_list_v2', { p_username: username, p_credential: credential, p_id: id })
  if (error) throw error
  return data ?? []
}
export async function writeVersionedCustomer(username: string, credential: string, customer: CustomerProfile) {
  if (!supabase) throw Error('cloud_unavailable')
  const workspace = getLocalWorkspace()
  const base = await getSyncMetadata(customer.id, workspace)
  const { data, error } = await supabase.rpc('sync_write_v2', { p_username: username, p_credential: credential, p_id: customer.id, p_source: customer.source ?? 'advisor', p_expected_revision: base?.revision ?? 0, p_document: customer })
  if (error) throw error
  if (data?.status === 'conflict') {
    if (data.document) await preserveConflict(customer, data.document, data.revision, workspace)
    throw Error('revision_conflict')
  }
  if (data?.status !== 'accepted' || !Number.isInteger(data.revision)) throw Error('invalid_sync_ack')
  await acknowledgeCustomer(customer, data.revision, workspace)
}

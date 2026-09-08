import type { CustomerProfile } from '../types/domain'
import { adoptRemote, deleteCustomerPermanently, getCustomers, getLocalWorkspace } from './localDb'
import { customerDeletionIds } from './customerDeletion'
import { supabase } from './supabase'
import { migrateCustomerProfile } from './customerMigrations'
import { fetchVersionedCustomers, writeVersionedCustomer } from './revisionSync'

interface RemoteDeletion {
  id: string
  source: 'advisor' | 'self_service'
  deleted_at: string
}

export async function confirmWorkspaceUsername(username: string, accessCode: string) {
  if (!supabase) return false
  const { data, error } = await supabase.rpc('workspace_username_allowed', { p_username: username, p_access_code: accessCode })
  if (error) throw error
  return data === true
}

export async function loginWorkspace(username: string, password: string) {
  if (!supabase) throw Error('cloud_unavailable')
  const { data, error } = await supabase.rpc('workspace_login', { p_username: username, p_password: password })
  if (error) throw error
  if (data?.error) throw Error(data.error)
  if (!data?.token || !data?.expiresAt) throw Error('access_denied')
  return data as { token: string; expiresAt: string }
}

export async function logoutWorkspace(token: string) {
  if (supabase) { const { error } = await supabase.rpc('workspace_logout', { p_access_code: token }); if (error) throw error }
}

export async function pushWorkspaceCustomer(username: string, accessCode: string, customer: CustomerProfile) {
  await writeVersionedCustomer(username, accessCode, customer)
}

export async function deleteWorkspaceCustomer(username: string, accessCode: string, id: string) {
  if (!supabase) throw new Error('cloud_unavailable')
  const { error } = await supabase.rpc('workspace_delete_customer', { p_username: username, p_access_code: accessCode, p_id: id })
  if (error) throw error
}

export async function synchronizeWorkspace(username: string, accessCode: string) {
  if (!supabase) return getCustomers()
  const workspace = getLocalWorkspace()
  const [records, deletionResponse] = await Promise.all([
    fetchVersionedCustomers(username, accessCode),
    supabase.rpc('workspace_list_customer_deletions', { p_username: username, p_access_code: accessCode }),
  ])
  if (deletionResponse.error) throw deletionResponse.error
  if (workspace !== getLocalWorkspace()) throw Error('workspace_changed')
  const deletedIds = customerDeletionIds((deletionResponse.data ?? []) as RemoteDeletion[])
  const storedLocal = await getCustomers()
  await Promise.all(storedLocal.filter((customer) => deletedIds.has(customer.id)).map((customer) => deleteCustomerPermanently(customer.id, true)))

  for (const record of records) {
    if (deletedIds.has(record.id)) continue
    if (workspace !== getLocalWorkspace()) throw Error('workspace_changed')
    const migration = migrateCustomerProfile({ ...record.document, source: record.source })
    await adoptRemote(migration.customer, record.revision, workspace)
  }
  return getCustomers()
}

import type { CustomerProfile } from '../types/domain'
import { getCustomers, putCustomer } from './localDb'
import { supabase } from './supabase'

interface RemoteRecord {
  id: string
  client_updated_at: string
  document: CustomerProfile
}

export async function confirmWorkspaceUsername(username: string, accessCode: string) {
  if (!supabase) return false
  const { data, error } = await supabase.rpc('workspace_username_allowed', { p_username: username, p_access_code: accessCode })
  if (error) throw error
  return data === true
}

export async function pushWorkspaceCustomer(username: string, accessCode: string, customer: CustomerProfile) {
  if (!supabase) return
  const { error } = await supabase.rpc('workspace_upsert_customer', {
    p_username: username,
    p_access_code: accessCode,
    p_id: customer.id,
    p_document: customer,
    p_client_updated_at: customer.updatedAt,
  })
  if (error) throw error
}

export async function deleteWorkspaceCustomer(username: string, accessCode: string, id: string) {
  if (!supabase) return
  const { error } = await supabase.rpc('workspace_delete_customer', { p_username: username, p_access_code: accessCode, p_id: id })
  if (error) throw error
}

export async function synchronizeWorkspace(username: string, accessCode: string) {
  if (!supabase) return getCustomers()
  const { data, error } = await supabase.rpc('workspace_list_customers', { p_username: username, p_access_code: accessCode })
  if (error) throw error
  const local = await getCustomers()
  const records = (data ?? []) as RemoteRecord[]
  const merged = new Map(local.map((customer) => [customer.id, customer]))

  for (const record of records) {
    const localCustomer = merged.get(record.id)
    if (!localCustomer || record.client_updated_at > localCustomer.updatedAt) {
      await putCustomer(record.document)
      merged.set(record.id, record.document)
    }
  }
  return getCustomers()
}

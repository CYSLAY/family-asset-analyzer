import type { CustomerProfile } from '../types/domain'
import { getCustomers, putCustomer } from './localDb'
import { supabase } from './supabase'
import { migrateCustomerProfile } from './customerMigrations'
import { listPublicIntakesForAdvisor, pushPublicIntakeAsAdvisor } from './publicIntake'

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
  const [{ data, error }, publicCustomers] = await Promise.all([
    supabase.rpc('workspace_list_customers', { p_username: username, p_access_code: accessCode }),
    listPublicIntakesForAdvisor(username, accessCode),
  ])
  if (error) throw error
  const local = await getCustomers()
  const records = (data ?? []) as RemoteRecord[]
  const merged = new Map(local.map((customer) => [customer.id, customer]))
  const remoteMigrationIds = new Set<string>()

  for (const record of records) {
    const migration = migrateCustomerProfile({ ...record.document, source: 'advisor' })
    if (migration.changed) remoteMigrationIds.add(record.id)
    const localCustomer = merged.get(record.id)
    if (!localCustomer || record.client_updated_at > localCustomer.updatedAt) {
      await putCustomer(migration.customer)
      merged.set(record.id, migration.customer)
    }
  }
  for (const publicCustomer of publicCustomers) {
    const localCustomer = merged.get(publicCustomer.id)
    if (!localCustomer || publicCustomer.updatedAt > localCustomer.updatedAt) {
      await putCustomer(publicCustomer)
      merged.set(publicCustomer.id, publicCustomer)
    }
  }
  for (const id of remoteMigrationIds) {
    const customer = merged.get(id)
    if (customer?.source === 'self_service') await pushPublicIntakeAsAdvisor(username, accessCode, customer)
    else if (customer) await pushWorkspaceCustomer(username, accessCode, customer)
  }
  return getCustomers()
}

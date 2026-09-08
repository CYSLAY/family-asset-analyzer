import { openDB } from 'idb'
import type { CustomerProfile } from '../types/domain'
import { sameDocument } from './documentEquality'

let scope = 'locked'
export const getLocalWorkspace = () => scope
export function setLocalWorkspace(next: string) { scope = next }
let connection: ReturnType<typeof openDB> | undefined
function database() {
  return connection ??= openDB('family-asset-analyzer', 3, { upgrade(db) {
    // Keep the original store for explicit recovery, never assign unknown data to a new user.
    if (!db.objectStoreNames.contains('customers')) db.createObjectStore('customers', { keyPath: 'id' })
    for (const name of ['workspaceCustomers', 'syncMetadata', 'outbox', 'conflicts', 'tombstones', 'recovery']) {
      if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: ['scope', 'id'] })
    }
  }, blocking() { void connection?.then(db => db.close()); connection = undefined } }).catch(error => { connection = undefined; throw error })
}
const key = (id: string, workspace = scope) => [workspace, id]
export async function getCustomers(): Promise<CustomerProfile[]> {
  if (scope === 'locked') return []
  const current = scope
  const rows = await (await database()).getAll('workspaceCustomers')
  return rows.filter(row => row.scope === current).map(row => row.document as CustomerProfile).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}
export async function getLegacyCustomers(): Promise<CustomerProfile[]> { return (await database()).getAll('customers') }
export async function putCustomer(customer: CustomerProfile, syncIntent = false): Promise<void> {
  const current = scope
  if (current === 'locked') throw Error('workspace_locked')
  const tx = (await database()).transaction(['workspaceCustomers', 'outbox'], 'readwrite')
  await tx.objectStore('workspaceCustomers').put({ scope: current, id: customer.id, document: customer })
  const queued = await tx.objectStore('outbox').get(key(customer.id, current))
  if (queued || syncIntent) await tx.objectStore('outbox').put({ scope: current, id: customer.id, document: customer })
  await tx.done
}
export async function putCustomers(customers: CustomerProfile[]) { for (const customer of customers) await putCustomer(customer) }
export async function deleteCustomerPermanently(id: string, preserveUnsynced = false) {
  const current = scope
  const tx = (await database()).transaction(['workspaceCustomers','outbox','syncMetadata','conflicts','tombstones','recovery'], 'readwrite')
  const existing = await tx.objectStore('workspaceCustomers').get(key(id, current))
  const base = await tx.objectStore('syncMetadata').get(key(id, current))
  if (preserveUnsynced && existing && !sameDocument(existing.document, base?.document)) await tx.objectStore('recovery').put({ scope: current, id: crypto.randomUUID(), document: existing.document })
  if (!preserveUnsynced) {
    for (const item of await tx.objectStore('recovery').getAll()) if (item.scope === current && item.document.id === id) await tx.objectStore('recovery').delete(key(item.id, current))
  }
  for (const store of ['workspaceCustomers','outbox','syncMetadata','conflicts']) await tx.objectStore(store).delete(key(id, current))
  await tx.objectStore('tombstones').put({ scope: current, id })
  await tx.done
}
export interface SyncMetadata { scope: string; id: string; revision: number; document: CustomerProfile }
export async function getSyncMetadata(id: string, workspace = scope): Promise<SyncMetadata | undefined> { return (await database()).get('syncMetadata', key(id, workspace)) }
export async function acknowledgeCustomer(customer: CustomerProfile, revision: number, workspace = scope) {
  const tx = (await database()).transaction(['syncMetadata','outbox','conflicts'], 'readwrite')
  const existing = await tx.objectStore('syncMetadata').get(key(customer.id, workspace))
  if (existing && existing.revision > revision) { await tx.done; return }
  await tx.objectStore('syncMetadata').put({ scope: workspace, id: customer.id, revision, document: customer })
  const queued = await tx.objectStore('outbox').get(key(customer.id, workspace))
  if (queued && sameDocument(queued.document, customer)) await tx.objectStore('outbox').delete(key(customer.id, workspace))
  await tx.objectStore('conflicts').delete(key(customer.id, workspace))
  await tx.done
}
export async function queueCustomer(customer: CustomerProfile) {
  const current = scope
  if (current === 'locked') throw Error('workspace_locked')
  await (await database()).put('outbox', { scope: current, id: customer.id, document: customer })
}
export async function getQueuedCustomers(): Promise<CustomerProfile[]> {
  const current = scope
  return (await (await database()).getAll('outbox')).filter(row => row.scope === current).map(row => row.document)
}
export async function preserveConflict(local: CustomerProfile, remote: CustomerProfile, revision: number, workspace = scope) {
  await (await database()).put('conflicts', { scope: workspace, id: local.id, local, remote, revision })
}
export interface CustomerConflict { scope: string; id: string; local: CustomerProfile; remote: CustomerProfile; revision: number }
export async function getConflicts(): Promise<CustomerConflict[]> {
  const current = scope
  return (await (await database()).getAll('conflicts')).filter(row => row.scope === current)
}
export async function isLocallyDeleted(id: string) { return Boolean(await (await database()).get('tombstones', key(id))) }

export async function getRecoveryCustomers(): Promise<CustomerProfile[]> {
  const current = scope
  return (await (await database()).getAll('recovery')).filter(row => row.scope === current).map(row => row.document)
}

// Compare and adopt in one transaction: a local edit cannot slip between the comparison and write.
export async function adoptRemote(customer: CustomerProfile, revision: number, workspace = scope) {
  const tx = (await database()).transaction(['workspaceCustomers','syncMetadata','conflicts','tombstones'], 'readwrite')
  if (await tx.objectStore('tombstones').get(key(customer.id, workspace))) { await tx.done; return }
  const local = await tx.objectStore('workspaceCustomers').get(key(customer.id, workspace))
  const base = await tx.objectStore('syncMetadata').get(key(customer.id, workspace))
  const same = sameDocument
  if (!local || same(local.document, base?.document) || same(local.document, customer)) {
    await tx.objectStore('workspaceCustomers').put({ scope: workspace, id: customer.id, document: customer })
    await tx.objectStore('syncMetadata').put({ scope: workspace, id: customer.id, document: customer, revision })
  } else if (!base || base.revision !== revision) {
    await tx.objectStore('conflicts').put({ scope: workspace, id: customer.id, local: local.document, remote: customer, revision })
  }
  await tx.done
}

export async function resolveConflict(conflict: CustomerConflict, choice: 'local' | 'remote') {
  if (scope !== conflict.scope) throw Error('workspace_changed')
  const workspace = conflict.scope
  const tx = (await database()).transaction(['workspaceCustomers','syncMetadata','conflicts','recovery','outbox'], 'readwrite')
  const latest = await tx.objectStore('conflicts').get(key(conflict.id, workspace))
  if (JSON.stringify(latest) !== JSON.stringify(conflict)) { tx.abort(); throw Error('冲突内容已更新，请重新选择') }
  const current = await tx.objectStore('workspaceCustomers').get(key(conflict.id, workspace))
  const local = current?.document ?? conflict.local
  for (const document of [local, conflict.remote]) await tx.objectStore('recovery').put({ scope: workspace, id: crypto.randomUUID(), document })
  const document = choice === 'local' ? local : conflict.remote
  await tx.objectStore('workspaceCustomers').put({ scope: workspace, id: conflict.id, document })
  await tx.objectStore('syncMetadata').put({ scope: workspace, id: conflict.id, document: conflict.remote, revision: conflict.revision })
  await tx.objectStore('conflicts').delete(key(conflict.id, workspace))
  if (choice === 'local') await tx.objectStore('outbox').put({ scope: workspace, id: conflict.id, document })
  else await tx.objectStore('outbox').delete(key(conflict.id, workspace))
  await tx.done
}

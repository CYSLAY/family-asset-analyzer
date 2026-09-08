import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { createCustomer } from '../types/domain'
import { acknowledgeCustomer, adoptRemote, deleteCustomerPermanently, getConflicts, getCustomers, getQueuedCustomers, getRecoveryCustomers, getSyncMetadata, putCustomer, queueCustomer, resolveConflict, setLocalWorkspace } from './localDb'

beforeEach(() => setLocalWorkspace(`test:${crypto.randomUUID()}`))
describe('durable workspace storage', () => {
  it('persists sync intent in the same transaction as an edit', async () => {
    const customer = createCustomer('甲'); await putCustomer(customer, true)
    expect(await getQueuedCustomers()).toEqual([customer])
  })
  it('does not treat JSONB key order as a conflict', async () => {
    const customer = createCustomer('甲'); await putCustomer(customer)
    const reordered = Object.fromEntries(Object.entries(customer).reverse()) as typeof customer
    await adoptRemote(reordered, 1)
    expect(await getConflicts()).toEqual([])
  })
  it('isolates accounts and blocks writes outside a workspace', async () => {
    const customer = createCustomer('甲'); await putCustomer(customer)
    setLocalWorkspace('test:another'); expect(await getCustomers()).toEqual([])
    setLocalWorkspace('locked'); await expect(putCustomer(customer)).rejects.toThrow('workspace_locked')
  })
  it('keeps a newer queued edit when an earlier write is acknowledged', async () => {
    const old = createCustomer('甲'), newer = { ...old, city: '深圳' }
    await putCustomer(old); await queueCustomer(old); await putCustomer(newer)
    await acknowledgeCustomer(old, 1)
    expect(await getQueuedCustomers()).toEqual([newer])
    await acknowledgeCustomer(newer, 2); expect(await getQueuedCustomers()).toEqual([])
  })
  it('preserves both versions on conflict and restores by explicit choice', async () => {
    const base = createCustomer('甲'), local = { ...base, city: '深圳' }, remote = { ...base, city: '上海' }
    await putCustomer(base); await acknowledgeCustomer(base, 1); await putCustomer(local)
    await adoptRemote(remote, 2)
    expect(await getCustomers()).toEqual([local])
    const [conflict] = await getConflicts(); expect(conflict.remote).toEqual(remote)
    await resolveConflict(conflict, 'local')
    expect((await getSyncMetadata(base.id))?.revision).toBe(2)
    expect(await getQueuedCustomers()).toEqual([local])
    expect(await getRecoveryCustomers()).toHaveLength(2)
  })
  it('retains recovery data but cannot resurrect a deleted record', async () => {
    const customer = createCustomer('甲'); await putCustomer(customer); await queueCustomer(customer)
    await deleteCustomerPermanently(customer.id, true); await adoptRemote(customer, 4)
    expect(await getCustomers()).toEqual([]); expect(await getQueuedCustomers()).toEqual([])
    expect(await getRecoveryCustomers()).toEqual([customer])
  })
})

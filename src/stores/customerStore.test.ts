// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/localDb', () => ({ getLocalWorkspace: () => 'advisor:qa', queueCustomer: vi.fn(async () => {}), getCustomers: vi.fn(async () => []), putCustomer: vi.fn(async () => {}), deleteCustomerPermanently: vi.fn(async () => {}) }))
vi.mock('../lib/access', () => ({ getAccessSession: () => ({ username: 'qa', accessCode: 'test-only' }) }))
vi.mock('../lib/usernameSync', () => ({ pushWorkspaceCustomer: vi.fn(), deleteWorkspaceCustomer: vi.fn() }))
vi.mock('../lib/publicIntake', () => ({ getPublicIntakeSession: () => null, pushPublicIntake: vi.fn(), clearPublicIntakeSession: vi.fn(), deletePublicIntakeAsAdvisor: vi.fn(), pushPublicIntakeAsAdvisor: vi.fn() }))

import { createCustomer } from '../types/domain'
import { pushWorkspaceCustomer } from '../lib/usernameSync'
import { useCustomerStore } from './customerStore'

beforeEach(() => { vi.clearAllMocks(); useCustomerStore.setState({ customers: [], selectedCustomerId: null, syncState: 'idle' }) })

describe('per-customer synchronization acknowledgement', () => {
  it('does not mark a newer local edit as synced when an older request completes', async () => {
    let finish!: () => void
    vi.mocked(pushWorkspaceCustomer).mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve }))
    const c = createCustomer('版本测试')
    useCustomerStore.setState({ customers: [c], selectedCustomerId: c.id })
    const request = useCustomerStore.getState().syncCustomer(c.id)
    await useCustomerStore.getState().updateCustomer(c.id, { city: '深圳' })
    finish(); await request
    expect(useCustomerStore.getState().syncState).toBe('dirty')
    expect(useCustomerStore.getState().customers[0].city).toBe('深圳')
  })

  it('does not change the selected customer status when another request finishes', async () => {
    let finish!: () => void
    vi.mocked(pushWorkspaceCustomer).mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve }))
    const a = createCustomer('甲'), b = createCustomer('乙')
    useCustomerStore.setState({ customers: [a, b], selectedCustomerId: a.id })
    const request = useCustomerStore.getState().syncCustomer(a.id)
    useCustomerStore.getState().selectCustomer(b.id)
    await useCustomerStore.getState().updateCustomer(b.id, { city: '深圳' })
    finish(); await request
    expect(useCustomerStore.getState().syncState).toBe('dirty')
    useCustomerStore.getState().selectCustomer(a.id)
    expect(useCustomerStore.getState().syncState).toBe('synced')
  })
})

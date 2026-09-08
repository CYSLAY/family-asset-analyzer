// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
vi.mock('./supabase', () => ({ supabase: { rpc: vi.fn() } }))
import { supabase } from './supabase'
import { clearPublicIntakeSession, getPublicIntakeSession, pushPublicIntake, savePublicIntakeSession } from './publicIntake'
import { createCustomer } from '../types/domain'

afterEach(() => { localStorage.clear(); vi.clearAllMocks() })
describe('intake upload session acknowledgement', () => {
  it.each(['logout', 'switch'] as const)('does not restore an old invitation after %s', async mode => {
    let finish!: (value: { error: null }) => void
    vi.mocked(supabase!.rpc).mockReturnValueOnce(new Promise(resolve => { finish = resolve }) as never)
    const customer = createCustomer('测试', 'self_service')
    const oldSession = { id: customer.id, token: 'test-token-old' }
    savePublicIntakeSession(oldSession)
    const request = pushPublicIntake(oldSession, customer)
    clearPublicIntakeSession()
    if (mode === 'switch') savePublicIntakeSession({ id: 'new', token: 'test-token-new' })
    finish({ error: null }); await request
    expect(getPublicIntakeSession()).toEqual(mode === 'logout' ? null : { id: 'new', token: 'test-token-new' })
  })
})

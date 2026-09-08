// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { getAccessSession, saveAccessSession, clearAccessUser } from './access'
afterEach(() => sessionStorage.clear())
describe('advisor short sessions', () => {
  it('removes legacy password-bearing sessions', () => {
    sessionStorage.setItem('family-asset-access-user', JSON.stringify({ username: 'jojo', accessCode: 'legacy-test-only' }))
    expect(getAccessSession()).toBeNull(); expect(sessionStorage.length).toBe(0)
  })
  it('accepts an unexpired token, never an expired one', () => {
    saveAccessSession('jojo', 'ws_' + 'a'.repeat(64), new Date(Date.now() + 60000).toISOString())
    expect(getAccessSession()?.username).toBe('jojo')
    saveAccessSession('jojo', 'ws_' + 'a'.repeat(64), new Date(Date.now() - 1).toISOString())
    expect(getAccessSession()).toBeNull()
  })
  it('clears the local token on logout', () => {
    saveAccessSession('jojo', 'ws_' + 'a'.repeat(64), new Date(Date.now() + 60000).toISOString())
    clearAccessUser(); expect(getAccessSession()).toBeNull()
  })
})

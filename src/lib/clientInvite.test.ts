import { describe, expect, it } from 'vitest'
import { getClientInviteCode, isClientInviteCodeValid } from './clientInvite'

describe('client invite code', () => {
  it('uses the requested rich + year convention', () => {
    expect(getClientInviteCode(2026)).toBe('rich2026')
    expect(getClientInviteCode(2027)).toBe('rich2027')
  })

  it('accepts harmless spaces and letter-case differences', () => {
    expect(isClientInviteCodeValid(' rich2026 ', 2026)).toBe(true)
    expect(isClientInviteCodeValid('RICH2026', 2026)).toBe(true)
  })

  it('rejects expired, future, or unrelated codes', () => {
    expect(isClientInviteCodeValid('rich2025', 2026)).toBe(false)
    expect(isClientInviteCodeValid('rich2027', 2026)).toBe(false)
    expect(isClientInviteCodeValid('wrong', 2026)).toBe(false)
  })
})

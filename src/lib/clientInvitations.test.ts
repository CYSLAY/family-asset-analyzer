import { describe, expect, it } from 'vitest'
import { invitationAccessState } from './clientInvitations'

describe('client invitation state', () => {
  it('shows an available invitation before the third login', () => {
    expect(invitationAccessState({ active: true, loginCount: 2, maxLogins: 3 })).toBe('可使用')
  })

  it('shows an exhausted invitation at the login limit', () => {
    expect(invitationAccessState({ active: true, loginCount: 3, maxLogins: 3 })).toBe('次数已用完')
  })

  it('prioritizes an explicitly disabled state', () => {
    expect(invitationAccessState({ active: false, loginCount: 1, maxLogins: 3 })).toBe('已停用')
  })
})

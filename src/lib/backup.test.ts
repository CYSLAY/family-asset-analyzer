import { describe, expect, it } from 'vitest'
import { createEncryptedBackup, readEncryptedBackup } from './backup'
import { createCustomer } from '../types/domain'

describe('encrypted backup', () => {
  it('round-trips customer data with the correct password', async () => {
    const customer = createCustomer('测试客户')
    const backup = await createEncryptedBackup([customer], 'correct-password')
    expect(backup).not.toContain('测试客户')
    const restored = await readEncryptedBackup(backup, 'correct-password')
    expect(restored[0].id).toBe(customer.id)
    expect(restored[0].primaryContactName).toBe('测试客户')
  })

  it('rejects an incorrect password', async () => {
    const backup = await createEncryptedBackup([createCustomer('测试客户')], 'correct-password')
    await expect(readEncryptedBackup(backup, 'wrong-password')).rejects.toThrow('密码不正确')
  })
})

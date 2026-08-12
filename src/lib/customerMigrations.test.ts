import { describe, expect, it } from 'vitest'
import { createCashFlow, createCustomer } from '../types/domain'
import { migrateCustomerProfile } from './customerMigrations'

describe('customer data migrations', () => {
  it('保留金额并将历史人情往来支出改为保险', () => {
    const customer = createCustomer('测试')
    customer.expenses = [{ ...createCashFlow('expense'), name: '人情往来', category: '可调整支出', amount: 12000, frequency: 'yearly' }]

    const result = migrateCustomerProfile(customer, '2026-08-13T00:00:00.000Z')

    expect(result.changed).toBe(true)
    expect(result.customer.expenses[0]).toMatchObject({ name: '保险', category: '保险保障', amount: 12000, frequency: 'yearly' })
    expect(result.customer.updatedAt).toBe('2026-08-13T00:00:00.000Z')
  })

  it('已经迁移的档案保持不变', () => {
    const customer = createCustomer('测试')
    customer.expenses = [{ ...createCashFlow('expense'), name: '保险', category: '保险保障', amount: 8000 }]

    const result = migrateCustomerProfile(customer)

    expect(result.changed).toBe(false)
    expect(result.customer).toBe(customer)
  })
})

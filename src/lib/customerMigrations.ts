import type { CustomerProfile } from '../types/domain'

export function migrateCustomerProfile(customer: CustomerProfile, now = new Date().toISOString()) {
  let changed = false
  const expenses = customer.expenses.map((expense) => {
    if (expense.name !== '人情往来') return expense
    changed = true
    return { ...expense, name: '保险', category: '保险保障' }
  })

  return {
    changed,
    customer: changed ? { ...customer, expenses, updatedAt: now } : customer,
  }
}

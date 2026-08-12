import { describe, expect, it } from 'vitest'
import { createCustomer } from '../types/domain'
import { buildCustomerDirectoryView } from './customerDirectory'

describe('customer directory grouping', () => {
  it('shows five advisor records per page and only two recent self-service records', () => {
    const advisorCustomers = Array.from({ length: 7 }, (_, index) => createCustomer(`顾问客户${index + 1}`))
    const selfServiceCustomers = Array.from({ length: 4 }, (_, index) => createCustomer(`自填客户${index + 1}`, 'self_service'))
    const customers = [...advisorCustomers, ...selfServiceCustomers]

    const firstPage = buildCustomerDirectoryView(customers, '', 1)
    expect(firstPage.displayedAdvisorCustomers).toHaveLength(5)
    expect(firstPage.advisorPageCount).toBe(2)
    expect(firstPage.displayedSelfServiceCustomers).toHaveLength(2)

    const secondPage = buildCustomerDirectoryView(customers, '', 2)
    expect(secondPage.displayedAdvisorCustomers).toHaveLength(2)
  })

  it('searches all records, including self-service records hidden from the default preview', () => {
    const customers = Array.from({ length: 4 }, (_, index) => createCustomer(`自填客户${index + 1}`, 'self_service'))
    const result = buildCustomerDirectoryView(customers, '自填客户4', 1)
    expect(result.displayedSelfServiceCustomers.map((customer) => customer.primaryContactName)).toEqual(['自填客户4'])
  })
})

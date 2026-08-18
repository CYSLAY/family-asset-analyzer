import { describe, expect, it } from 'vitest'
import { createCustomer } from '../types/domain'
import type { ClientInvitation } from './clientInvitations'
import { buildCustomerDirectoryView, buildSelfServiceDirectoryItems, paginateSelfServiceDirectoryItems } from './customerDirectory'

function invitation(overrides: Partial<ClientInvitation> = {}): ClientInvitation {
  return {
    code: 'rich123456',
    recipientName: '杨总',
    intakeId: 'invite-customer',
    loginCount: 1,
    maxLogins: 3,
    active: true,
    createdAt: '2026-08-18T02:00:00.000Z',
    updatedAt: '2026-08-18T02:00:00.000Z',
    ...overrides,
  }
}

describe('customer directory grouping', () => {
  it('shows five advisor records per page and keeps the two-record self-service page size', () => {
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

  it('paginates every self-service record and clamps pages after records change', () => {
    const entries = Array.from({ length: 5 }, (_, index) => ({
      customer: createCustomer(`自填客户${index + 1}`, 'self_service'),
    }))

    expect(paginateSelfServiceDirectoryItems(entries, 1)).toMatchObject({ page: 1, pageCount: 3 })
    expect(paginateSelfServiceDirectoryItems(entries, 2).displayedItems.map((entry) => entry.customer?.primaryContactName)).toEqual(['自填客户3', '自填客户4'])
    expect(paginateSelfServiceDirectoryItems(entries, 3).displayedItems.map((entry) => entry.customer?.primaryContactName)).toEqual(['自填客户5'])
    expect(paginateSelfServiceDirectoryItems(entries.slice(0, 2), 3).page).toBe(1)
  })

  it('searches all records, including self-service records hidden from the default preview', () => {
    const customers = Array.from({ length: 4 }, (_, index) => createCustomer(`自填客户${index + 1}`, 'self_service'))
    const result = buildCustomerDirectoryView(customers, '自填客户4', 1)
    expect(result.displayedSelfServiceCustomers.map((customer) => customer.primaryContactName)).toEqual(['自填客户4'])
  })

  it('merges invitations with submitted and legacy self-service records', () => {
    const submitted = { ...createCustomer('杨总', 'self_service'), id: 'invite-customer', updatedAt: '2026-08-18T03:00:00.000Z' }
    const legacy = { ...createCustomer('历史客户', 'self_service'), id: 'legacy-customer', updatedAt: '2026-08-18T01:00:00.000Z' }
    const entries = buildSelfServiceDirectoryItems([invitation()], [submitted, legacy], '')

    expect(entries).toHaveLength(2)
    expect(entries[0]).toMatchObject({ invitation: { code: 'rich123456' }, customer: { id: 'invite-customer' } })
    expect(entries[1]).toMatchObject({ customer: { id: 'legacy-customer' } })
  })

  it('hides deleted invitation records and searches invitation metadata', () => {
    const entries = buildSelfServiceDirectoryItems([
      invitation({ active: false }),
      invitation({ code: 'rich654321', intakeId: 'pending', recipientName: '陈女士' }),
    ], [], '654321')

    expect(entries.map((entry) => entry.invitation?.recipientName)).toEqual(['陈女士'])
  })
})

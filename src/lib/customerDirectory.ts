import type { CustomerProfile } from '../types/domain'
import type { ClientInvitation } from './clientInvitations'

export const advisorPageSize = 5
export const selfServicePageSize = 10

export interface SelfServiceDirectoryItem {
  invitation?: ClientInvitation
  customer?: CustomerProfile
}

export function paginateSelfServiceDirectoryItems(items: SelfServiceDirectoryItem[], requestedPage: number) {
  const pageCount = Math.max(1, Math.ceil(items.length / selfServicePageSize))
  const page = Math.min(Math.max(1, requestedPage), pageCount)
  return {
    page,
    pageCount,
    displayedItems: items.slice((page - 1) * selfServicePageSize, page * selfServicePageSize),
  }
}

export function buildSelfServiceDirectoryItems(invitations: ClientInvitation[], customers: CustomerProfile[], search: string) {
  const selfServiceCustomers = customers.filter((customer) => customer.source === 'self_service')
  const customersById = new Map(selfServiceCustomers.map((customer) => [customer.id, customer]))
  const linkedIds = new Set(invitations.map((invitation) => invitation.intakeId))
  const entries: SelfServiceDirectoryItem[] = [
    ...invitations.map((invitation) => ({ invitation, customer: customersById.get(invitation.intakeId) })),
    ...selfServiceCustomers.filter((customer) => !linkedIds.has(customer.id)).map((customer) => ({ invitation: undefined, customer })),
  ]
    .filter((entry) => entry.customer || entry.invitation?.active)
    .sort((a, b) => {
      const aTime = a.customer?.updatedAt ?? a.invitation?.updatedAt ?? ''
      const bTime = b.customer?.updatedAt ?? b.invitation?.updatedAt ?? ''
      return bTime.localeCompare(aTime)
    })

  const keyword = search.trim().toLocaleLowerCase('zh-CN')
  if (!keyword) return entries
  return entries.filter(({ invitation, customer }) => [
    invitation?.code,
    invitation?.recipientName,
    customer?.primaryContactName,
    customer?.householdName,
    customer?.city,
  ].some((value) => value?.toLocaleLowerCase('zh-CN').includes(keyword)))
}

export function buildCustomerDirectoryView(customers: CustomerProfile[], search: string, requestedAdvisorPage: number) {
  const keyword = search.trim().toLocaleLowerCase('zh-CN')
  const visibleCustomers = customers.filter((customer) => {
    if (!keyword) return true
    return [customer.primaryContactName, customer.householdName, customer.city]
      .some((value) => value.toLocaleLowerCase('zh-CN').includes(keyword))
  })
  const advisorCustomers = visibleCustomers.filter((customer) => customer.source !== 'self_service')
  const selfServiceCustomers = visibleCustomers.filter((customer) => customer.source === 'self_service')
  const advisorPageCount = Math.max(1, Math.ceil(advisorCustomers.length / advisorPageSize))
  const advisorPage = Math.min(Math.max(1, requestedAdvisorPage), advisorPageCount)
  const searchActive = Boolean(keyword)

  return {
    visibleCustomers,
    searchActive,
    advisorCustomers,
    selfServiceCustomers,
    advisorPage,
    advisorPageCount,
    displayedAdvisorCustomers: searchActive
      ? advisorCustomers
      : advisorCustomers.slice((advisorPage - 1) * advisorPageSize, advisorPage * advisorPageSize),
    displayedSelfServiceCustomers: searchActive
      ? selfServiceCustomers
      : selfServiceCustomers.slice(0, selfServicePageSize),
  }
}

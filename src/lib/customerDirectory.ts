import type { CustomerProfile } from '../types/domain'

export const advisorPageSize = 5
export const selfServicePreviewSize = 2

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
      : selfServiceCustomers.slice(0, selfServicePreviewSize),
  }
}

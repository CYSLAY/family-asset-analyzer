import { create } from 'zustand'
import { createCustomer, type CustomerProfile, type FamilyMember, type SaveState } from '../types/domain'
import { deleteCustomerPermanently, getCustomers, putCustomer } from '../lib/localDb'
import { getAccessSession } from '../lib/access'
import { deleteWorkspaceCustomer, pushWorkspaceCustomer } from '../lib/usernameSync'

interface CustomerStore {
  customers: CustomerProfile[]
  selectedCustomerId: string | null
  initialized: boolean
  saveState: SaveState
  syncState: 'idle' | 'dirty' | 'syncing' | 'synced' | 'error'
  initialize: () => Promise<void>
  selectCustomer: (id: string) => void
  addCustomer: (primaryContactName: string) => Promise<CustomerProfile>
  updateCustomer: (id: string, patch: Partial<CustomerProfile>) => Promise<void>
  addMember: (customerId: string, member: FamilyMember) => Promise<void>
  updateMember: (customerId: string, memberId: string, patch: Partial<FamilyMember>) => Promise<void>
  removeMember: (customerId: string, memberId: string) => Promise<void>
  archiveCustomer: (id: string, archived: boolean) => Promise<void>
  deleteCustomer: (id: string) => Promise<void>
  syncCustomer: (id: string) => Promise<void>
}

function replaceCustomer(customers: CustomerProfile[], customer: CustomerProfile) {
  return customers
    .map((item) => item.id === customer.id ? customer : item)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export const useCustomerStore = create<CustomerStore>((set, get) => ({
  customers: [],
  selectedCustomerId: null,
  initialized: false,
  saveState: 'idle',
  syncState: 'idle',

  initialize: async () => {
    const customers = await getCustomers()
    set({
      customers,
      selectedCustomerId: customers.find((item) => !item.archivedAt)?.id ?? null,
      initialized: true,
      saveState: 'saved',
    })
  },

  selectCustomer: (id) => set({ selectedCustomerId: id }),

  addCustomer: async (primaryContactName) => {
    const customer = createCustomer(primaryContactName)
    set((state) => ({ customers: [customer, ...state.customers], selectedCustomerId: customer.id, saveState: 'saving' }))
    try {
      await putCustomer(customer)
      set({ saveState: 'saved', syncState: 'dirty' })
      return customer
    } catch (error) {
      set({ saveState: 'error' })
      throw error
    }
  },

  updateCustomer: async (id, patch) => {
    const current = get().customers.find((item) => item.id === id)
    if (!current) return
    const customer = { ...current, ...patch, id, updatedAt: new Date().toISOString() }
    set((state) => ({ customers: replaceCustomer(state.customers, customer), saveState: 'saving' }))
    try {
      await putCustomer(customer)
      set({ saveState: 'saved', syncState: 'dirty' })
    } catch {
      set({ saveState: 'error' })
    }
  },

  addMember: async (customerId, member) => {
    const current = get().customers.find((item) => item.id === customerId)
    if (!current) return
    await get().updateCustomer(customerId, { members: [...current.members, member] })
  },

  updateMember: async (customerId, memberId, patch) => {
    const current = get().customers.find((item) => item.id === customerId)
    if (!current) return
    const members = current.members.map((member) => member.id === memberId ? { ...member, ...patch } : member)
    await get().updateCustomer(customerId, { members })
  },

  removeMember: async (customerId, memberId) => {
    const current = get().customers.find((item) => item.id === customerId)
    if (!current || current.members.length <= 1) return
    await get().updateCustomer(customerId, { members: current.members.filter((member) => member.id !== memberId) })
  },

  archiveCustomer: async (id, archived) => {
    await get().updateCustomer(id, { archivedAt: archived ? new Date().toISOString() : null })
    const next = get().customers.find((item) => !item.archivedAt && item.id !== id)
    if (archived && get().selectedCustomerId === id) set({ selectedCustomerId: next?.id ?? null })
  },

  deleteCustomer: async (id) => {
    await deleteCustomerPermanently(id)
    const session = getAccessSession()
    if (session) void deleteWorkspaceCustomer(session.username, session.accessCode, id).catch(() => undefined)
    set((state) => {
      const customers = state.customers.filter((item) => item.id !== id)
      return {
        customers,
        selectedCustomerId: state.selectedCustomerId === id ? customers.find((item) => !item.archivedAt)?.id ?? null : state.selectedCustomerId,
        saveState: 'saved',
      }
    })
  },

  syncCustomer: async (id) => {
    const session = getAccessSession()
    const customer = get().customers.find((item) => item.id === id)
    if (!session || !customer) return
    set({ syncState: 'syncing' })
    try {
      await pushWorkspaceCustomer(session.username, session.accessCode, customer)
      set({ syncState: 'synced' })
    } catch {
      set({ syncState: 'error' })
    }
  },
}))

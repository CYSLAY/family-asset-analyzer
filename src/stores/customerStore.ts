import { create } from 'zustand'
import { createCustomer, type CustomerProfile, type FamilyMember, type SaveState } from '../types/domain'
import { deleteCustomerPermanently, getCustomers, putCustomer } from '../lib/localDb'
import { getAccessSession } from '../lib/access'
import { deleteWorkspaceCustomer, pushWorkspaceCustomer } from '../lib/usernameSync'
import { migrateCustomerProfile } from '../lib/customerMigrations'
import { deletePublicIntakeAsAdvisor, getPublicIntakeSession, pushPublicIntake, pushPublicIntakeAsAdvisor } from '../lib/publicIntake'

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
  deleteCustomer: (id: string) => Promise<void>
  syncCustomer: (id: string) => Promise<void>
}

function replaceCustomer(customers: CustomerProfile[], customer: CustomerProfile) {
  return customers
    .map((item) => item.id === customer.id ? customer : item)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

let selfServiceSyncTimer: ReturnType<typeof setTimeout> | null = null

function scheduleSelfServiceSync(customerId: string) {
  if (selfServiceSyncTimer) clearTimeout(selfServiceSyncTimer)
  selfServiceSyncTimer = setTimeout(() => {
    const session = getPublicIntakeSession()
    const customer = useCustomerStore.getState().customers.find((item) => item.id === customerId)
    if (!session || session.id !== customerId || !customer || customer.source !== 'self_service') return
    useCustomerStore.setState({ syncState: 'syncing' })
    void pushPublicIntake(session, customer)
      .then(() => useCustomerStore.setState({ syncState: 'synced' }))
      .catch(() => useCustomerStore.setState({ syncState: 'error' }))
  }, 850)
}

export const useCustomerStore = create<CustomerStore>((set, get) => ({
  customers: [],
  selectedCustomerId: null,
  initialized: false,
  saveState: 'idle',
  syncState: 'idle',

  initialize: async () => {
    const storedCustomers = await getCustomers()
    const migrations = storedCustomers.map((customer) => migrateCustomerProfile(customer))
    await Promise.all(migrations.filter((result) => result.changed).map((result) => putCustomer(result.customer)))
    const customers = migrations.map((result) => result.customer).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    set({
      customers,
      selectedCustomerId: customers[0]?.id ?? null,
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
      if (customer.source === 'self_service') scheduleSelfServiceSync(customer.id)
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
      if (customer.source === 'self_service') scheduleSelfServiceSync(customer.id)
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

  deleteCustomer: async (id) => {
    const session = getAccessSession()
    const customer = get().customers.find((item) => item.id === id)
    if (session && customer?.source === 'self_service') await deletePublicIntakeAsAdvisor(session.username, session.accessCode, id)
    else if (session) await deleteWorkspaceCustomer(session.username, session.accessCode, id)
    await deleteCustomerPermanently(id)
    set((state) => {
      const customers = state.customers.filter((item) => item.id !== id)
      return {
        customers,
        selectedCustomerId: state.selectedCustomerId === id ? customers[0]?.id ?? null : state.selectedCustomerId,
        saveState: 'saved',
      }
    })
  },

  syncCustomer: async (id) => {
    const session = getAccessSession()
    const publicSession = getPublicIntakeSession()
    const customer = get().customers.find((item) => item.id === id)
    if (!customer) return
    set({ syncState: 'syncing' })
    try {
      if (customer.source === 'self_service' && session) await pushPublicIntakeAsAdvisor(session.username, session.accessCode, customer)
      else if (customer.source === 'self_service' && publicSession?.id === customer.id) await pushPublicIntake(publicSession, customer)
      else if (session) await pushWorkspaceCustomer(session.username, session.accessCode, customer)
      else return set({ syncState: 'error' })
      set({ syncState: 'synced' })
    } catch {
      set({ syncState: 'error' })
    }
  },
}))

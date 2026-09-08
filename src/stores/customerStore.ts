import { create } from 'zustand'
import { canSyncSelfServiceCustomer, createCustomer, detachMember, type CustomerProfile, type FamilyMember, type SaveState } from '../types/domain'
import { deleteCustomerPermanently, getCustomers, getLegacyCustomers, getLocalWorkspace, getConflicts, getQueuedCustomers, queueCustomer, putCustomer } from '../lib/localDb'
import { getAccessSession } from '../lib/access'
import { deleteWorkspaceCustomer, pushWorkspaceCustomer } from '../lib/usernameSync'
import { migrateCustomerProfile } from '../lib/customerMigrations'
import { isDeletedRecordError } from '../lib/customerDeletion'
import { clearPublicIntakeSession, deletePublicIntakeAsAdvisor, getPublicIntakeSession, pushPublicIntake, pushPublicIntakeAsAdvisor } from '../lib/publicIntake'

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

function automaticSyncEligible(customer: CustomerProfile) {
  const session = getPublicIntakeSession()
  return !getAccessSession() && customer.source === 'self_service' && session?.id === customer.id && Boolean(session.uploaded || canSyncSelfServiceCustomer(customer))
}

const selfServiceSyncTimers = new Map<string, ReturnType<typeof setTimeout>>()
const customerSyncStates = new Map<string, CustomerStore['syncState']>()
const customerSaveStates = new Map<string, SaveState>()
function setCustomerSaveState(id: string, state: SaveState) {
  customerSaveStates.set(`${getLocalWorkspace()}:${id}`, state)
  if (useCustomerStore.getState().selectedCustomerId === id) useCustomerStore.setState({ saveState: state })
}

function setCustomerSyncState(id: string, state: CustomerStore['syncState']) {
  customerSyncStates.set(`${getLocalWorkspace()}:${id}`, state)
  if (useCustomerStore.getState().selectedCustomerId === id) useCustomerStore.setState({ syncState: state })
}

function scheduleSelfServiceSync(customerId: string) {
  const workspace = getLocalWorkspace()
  clearTimeout(selfServiceSyncTimers.get(customerId))
  selfServiceSyncTimers.set(customerId, setTimeout(() => {
    selfServiceSyncTimers.delete(customerId)
    if (workspace !== getLocalWorkspace()) return
    if (getAccessSession()) return
    const session = getPublicIntakeSession()
    const customer = useCustomerStore.getState().customers.find((item) => item.id === customerId)
    if (!session || session.id !== customerId || !customer || customer.source !== 'self_service' || (!session.uploaded && !canSyncSelfServiceCustomer(customer))) return
    setCustomerSyncState(customerId, 'syncing')
    void queueCustomer(customer).then(() => pushPublicIntake(session, customer))
      .then(() => {
        if (workspace !== getLocalWorkspace()) return
        const current = useCustomerStore.getState().customers.find(item => item.id === customerId)
        setCustomerSyncState(customerId, current === customer ? 'synced' : 'dirty')
        if (current && current !== customer) scheduleSelfServiceSync(customerId)
      })
      .catch((error: unknown) => {
        if (workspace !== getLocalWorkspace()) return
        if (isDeletedRecordError(error)) {
          clearPublicIntakeSession()
          void deleteCustomerPermanently(customerId).finally(() => useCustomerStore.setState((state) => ({
            customers: state.customers.filter((item) => item.id !== customerId),
            selectedCustomerId: state.selectedCustomerId === customerId ? null : state.selectedCustomerId,
            syncState: 'error',
          })))
          return
        }
        setCustomerSyncState(customerId, 'error')
      })
  }, 850))
}

if (typeof window !== 'undefined') window.addEventListener('online', () => {
  void retryQueuedSync()
  const session = getPublicIntakeSession()
  if (session) scheduleSelfServiceSync(session.id)
})

let replaying = false
export async function retryQueuedSync() {
  if (replaying || getLocalWorkspace() === 'locked' || !navigator.onLine) return
  replaying = true
  const workspace = getLocalWorkspace()
  try {
    const conflicts = new Set((await getConflicts()).map(item => item.id))
    for (const customer of await getQueuedCustomers()) {
      if (workspace !== getLocalWorkspace()) break
      if (!conflicts.has(customer.id) && (getAccessSession() || getPublicIntakeSession()?.id === customer.id)) await useCustomerStore.getState().syncCustomer(customer.id)
    }
  } catch { /* Keep the durable queue for a later retry. */ }
  finally { replaying = false }
}

export const useCustomerStore = create<CustomerStore>((set, get) => ({
  customers: [],
  selectedCustomerId: null,
  initialized: false,
  saveState: 'idle',
  syncState: 'idle',

  initialize: async () => {
    const workspace = getLocalWorkspace()
    const storedCustomers = await getCustomers()
    const intake = getPublicIntakeSession()
    if (!storedCustomers.length && intake && workspace === `self:${intake.id}`) {
      const ownLegacy = (await getLegacyCustomers()).find(item => item.id === intake.id && item.source === 'self_service')
      if (ownLegacy && workspace === getLocalWorkspace()) { await putCustomer(ownLegacy, automaticSyncEligible(ownLegacy)); storedCustomers.push(ownLegacy) }
    }
    if (workspace !== getLocalWorkspace()) return
    const migrations = storedCustomers.map((customer) => migrateCustomerProfile(customer))
    await Promise.all(migrations.filter((result) => result.changed).map((result) => putCustomer(result.customer)))
    const customers = migrations.map((result) => result.customer).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    if (workspace !== getLocalWorkspace()) return
    set({
      customers,
      selectedCustomerId: customers[0]?.id ?? null,
      initialized: true,
      saveState: 'saved',
    })
  },

  selectCustomer: (id) => set({ selectedCustomerId: id, syncState: customerSyncStates.get(`${getLocalWorkspace()}:${id}`) ?? 'idle', saveState: customerSaveStates.get(`${getLocalWorkspace()}:${id}`) ?? 'saved' }),

  addCustomer: async (primaryContactName) => {
    const workspace = getLocalWorkspace()
    const customer = createCustomer(primaryContactName)
    set((state) => ({ customers: [customer, ...state.customers], selectedCustomerId: customer.id, saveState: 'saving' }))
    try {
      await putCustomer(customer, automaticSyncEligible(customer))
      if (workspace !== getLocalWorkspace()) return customer
      setCustomerSaveState(customer.id, 'saved')
      setCustomerSyncState(customer.id, 'dirty')
      if (customer.source === 'self_service') scheduleSelfServiceSync(customer.id)
      return customer
    } catch (error) {
      if (workspace === getLocalWorkspace()) setCustomerSaveState(customer.id, 'error')
      throw error
    }
  },

  updateCustomer: async (id, patch) => {
    const workspace = getLocalWorkspace()
    const current = get().customers.find((item) => item.id === id)
    if (!current) return
    const customer = { ...current, ...patch, id, updatedAt: new Date().toISOString() }
    set((state) => ({ customers: replaceCustomer(state.customers, customer) }))
    setCustomerSaveState(id, 'saving')
    try {
      await putCustomer(customer, automaticSyncEligible(customer))
      if (workspace !== getLocalWorkspace()) return
      if (get().customers.find(item => item.id === id) === customer) setCustomerSaveState(id, 'saved')
      setCustomerSyncState(customer.id, 'dirty')
      if (customer.source === 'self_service') scheduleSelfServiceSync(customer.id)
    } catch {
      if (workspace === getLocalWorkspace() && get().customers.find(item => item.id === id) === customer) setCustomerSaveState(id, 'error')
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
    await get().updateCustomer(customerId, detachMember(current, memberId))
  },

  deleteCustomer: async (id) => {
    const workspace = getLocalWorkspace()
    const session = getAccessSession()
    const customer = get().customers.find((item) => item.id === id)
    if (!session && getLocalWorkspace() !== 'preview') throw Error('access_denied')
    if (session && customer?.source === 'self_service') await deletePublicIntakeAsAdvisor(session.username, session.accessCode, id)
    else if (session) await deleteWorkspaceCustomer(session.username, session.accessCode, id)
    if (workspace !== getLocalWorkspace()) return
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
    const workspace = getLocalWorkspace()
    const session = getAccessSession()
    const publicSession = getPublicIntakeSession()
    const customer = get().customers.find((item) => item.id === id)
    if (!customer) return
    setCustomerSyncState(id, 'syncing')
    try {
      await queueCustomer(customer)
      if (customer.source === 'self_service' && session) await pushPublicIntakeAsAdvisor(session.username, session.accessCode, customer)
      else if (customer.source === 'self_service' && publicSession?.id === customer.id) await pushPublicIntake(publicSession, customer)
      else if (session) await pushWorkspaceCustomer(session.username, session.accessCode, customer)
      else return setCustomerSyncState(id, 'error')
      if (workspace === getLocalWorkspace()) setCustomerSyncState(id, get().customers.find(item => item.id === id) === customer ? 'synced' : 'dirty')
    } catch {
      if (workspace === getLocalWorkspace()) setCustomerSyncState(id, 'error')
    }
  },
}))

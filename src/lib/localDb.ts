import { openDB } from 'idb'
import type { CustomerProfile } from '../types/domain'

const DATABASE_NAME = 'family-asset-analyzer'
const DATABASE_VERSION = 1
const CUSTOMER_STORE = 'customers'

const database = openDB(DATABASE_NAME, DATABASE_VERSION, {
  upgrade(db) {
    if (!db.objectStoreNames.contains(CUSTOMER_STORE)) {
      const store = db.createObjectStore(CUSTOMER_STORE, { keyPath: 'id' })
      store.createIndex('updatedAt', 'updatedAt')
      store.createIndex('primaryContactName', 'primaryContactName')
    }
  },
})

export async function getCustomers(): Promise<CustomerProfile[]> {
  const db = await database
  const rows = await db.getAll(CUSTOMER_STORE) as CustomerProfile[]
  return rows.map((row) => ({
    ...row,
    assets: row.assets ?? [],
    liabilities: row.liabilities ?? [],
    incomes: row.incomes ?? [],
    expenses: row.expenses ?? [],
    educationGoals: row.educationGoals ?? [],
    intakeCompletedSteps: row.intakeCompletedSteps ?? [],
  })).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export async function putCustomer(customer: CustomerProfile): Promise<void> {
  const db = await database
  await db.put(CUSTOMER_STORE, customer)
}

export async function putCustomers(customers: CustomerProfile[]): Promise<void> {
  const db = await database
  const transaction = db.transaction(CUSTOMER_STORE, 'readwrite')
  for (const customer of customers) await transaction.store.put(customer)
  await transaction.done
}

export async function deleteCustomerPermanently(id: string): Promise<void> {
  const db = await database
  await db.delete(CUSTOMER_STORE, id)
}

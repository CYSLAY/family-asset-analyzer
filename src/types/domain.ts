export type IncomeStability = 'stable' | 'variable' | 'self_employed' | 'retired' | 'none'

export interface FamilyMember {
  id: string
  name: string
  relation: string
  birthDate: string
  jobType: string
  incomeStability: IncomeStability
  isPrimaryIncomeProvider: boolean
  phone: string
  healthNotes: string
  heightCm: number | null
  weightKg: number | null
}

export interface CustomerProfile {
  id: string
  householdName: string
  primaryContactName: string
  city: string
  notes: string
  members: FamilyMember[]
  assets: AssetEntry[]
  liabilities: LiabilityEntry[]
  incomes: CashFlowEntry[]
  expenses: CashFlowEntry[]
  educationGoals: EducationGoal[]
  intakeCompletedSteps?: IntakeStepKey[]
  createdAt: string
  updatedAt: string
  archivedAt: string | null
}

export type IntakeStepKey = 'profile' | 'members' | 'fixed_assets' | 'liquid_assets' | 'cashflow' | 'education'

export const intakeStepKeys: IntakeStepKey[] = ['profile', 'members', 'fixed_assets', 'liquid_assets', 'cashflow', 'education']

export function isIntakeComplete(customer: CustomerProfile) {
  const completed = new Set(customer.intakeCompletedSteps ?? [])
  return intakeStepKeys.every((step) => completed.has(step))
}

export function intakeCompletion(customer: CustomerProfile) {
  const completed = new Set(customer.intakeCompletedSteps ?? [])
  return Math.round((intakeStepKeys.filter((step) => completed.has(step)).length / intakeStepKeys.length) * 100)
}

export type AssetCategory = 'cash' | 'bank' | 'fund' | 'stock' | 'bond' | 'property' | 'vehicle' | 'pension' | 'receivable' | 'other'
export type LiquidityLevel = 'immediate' | 'within_month' | 'long_term'

export interface AssetEntry {
  id: string
  name: string
  category: AssetCategory
  currentValue: number
  ownerMemberId: string | null
  liquidity: LiquidityLevel
  availableForEmergency: boolean
  annualReturnRate: number | null
}

export type LiabilityCategory = 'mortgage' | 'car_loan' | 'consumer_loan' | 'credit_card' | 'private_loan' | 'other'

export interface LiabilityEntry {
  id: string
  name: string
  category: LiabilityCategory
  balance: number
  annualInterestRate: number | null
  monthlyPayment: number
  remainingMonths: number | null
  dueWithinOneYear: number
}

export type CashFlowFrequency = 'monthly' | 'quarterly' | 'yearly'

export interface CashFlowEntry {
  id: string
  name: string
  category: string
  amount: number
  frequency: CashFlowFrequency
  necessary: boolean
  memberId: string | null
}

export interface EducationGoal {
  id: string
  childMemberId: string | null
  currentStage: string
  targetRoute: string
  yearsUntilStart: number
  annualCostToday: number
  durationYears: number
  inflationRate: number
  preparedAmount: number
}

export type SaveState = 'idle' | 'saving' | 'saved' | 'error'

export function createMember(overrides: Partial<FamilyMember> = {}): FamilyMember {
  return {
    id: crypto.randomUUID(),
    name: '',
    relation: '本人',
    birthDate: '',
    jobType: '',
    incomeStability: 'stable',
    isPrimaryIncomeProvider: false,
    phone: '',
    healthNotes: '',
    heightCm: null,
    weightKg: null,
    ...overrides,
  }
}

export function createCustomer(primaryContactName: string): CustomerProfile {
  const now = new Date().toISOString()
  const cleanName = primaryContactName.trim()
  return {
    id: crypto.randomUUID(),
    householdName: `${cleanName}家庭`,
    primaryContactName: cleanName,
    city: '',
    notes: '',
    members: [createMember({ name: cleanName, relation: '本人', isPrimaryIncomeProvider: true })],
    assets: [],
    liabilities: [],
    incomes: [],
    expenses: [],
    educationGoals: [],
    intakeCompletedSteps: [],
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
  }
}

export function createAsset(): AssetEntry {
  return { id: crypto.randomUUID(), name: '', category: 'cash', currentValue: 0, ownerMemberId: null, liquidity: 'immediate', availableForEmergency: true, annualReturnRate: null }
}

export function createLiability(): LiabilityEntry {
  return { id: crypto.randomUUID(), name: '', category: 'mortgage', balance: 0, annualInterestRate: null, monthlyPayment: 0, remainingMonths: null, dueWithinOneYear: 0 }
}

export function createCashFlow(type: 'income' | 'expense'): CashFlowEntry {
  return { id: crypto.randomUUID(), name: '', category: type === 'income' ? '工作收入' : '基本生活', amount: 0, frequency: 'monthly', necessary: type === 'expense', memberId: null }
}

export function createEducationGoal(): EducationGoal {
  return { id: crypto.randomUUID(), childMemberId: null, currentStage: '未开始', targetRoute: '公立（本地）', yearsUntilStart: 0, annualCostToday: 0, durationYears: 3, inflationRate: 5, preparedAmount: 0 }
}

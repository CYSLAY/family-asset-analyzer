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
  source?: 'advisor' | 'self_service'
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
  cashFlowPlan?: CashFlowPlan
  intakeCompletedSteps?: IntakeStepKey[]
  createdAt: string
  updatedAt: string
  archivedAt: string | null
}

export interface CashFlowPlanMember {
  id: string
  name: string
  baseAge: number | null
}

export interface CashFlowPlanItem {
  id: string
  label: string
  annualAmount: number
  growthRate: number
  startYear: number
  endYear: number
  yearlyAmounts?: Record<string, number>
}

export interface CashFlowPlan {
  baseYear: number
  projectionYears: number
  annualReturnRate: number
  initialFunds: number
  savingsInsuranceAnnualPremium?: number
  savingsInsuranceProduct?: 'trst' | 'prmesp'
  savingsInsurancePaymentYears?: 1 | 5
  members: CashFlowPlanMember[]
  incomes: CashFlowPlanItem[]
  expenses: CashFlowPlanItem[]
}

export type IntakeStepKey = 'profile' | 'members' | 'fixed_assets' | 'liquid_assets' | 'cashflow' | 'education'

export const intakeStepKeys: IntakeStepKey[] = ['profile', 'members', 'fixed_assets', 'liquid_assets', 'cashflow', 'education']

export function hasIntakeStepData(customer: CustomerProfile, step: IntakeStepKey) {
  const meaningfulAsset = (asset: AssetEntry) => Boolean(asset.name.trim()) || asset.currentValue > 0 || asset.ownerMemberId !== null || asset.annualReturnRate !== null
  const meaningfulLiability = (liability: LiabilityEntry) => Boolean(liability.name.trim()) || liability.balance > 0 || liability.monthlyPayment > 0 || liability.dueWithinOneYear > 0 || liability.annualInterestRate !== null || liability.remainingMonths !== null
  const meaningfulFlow = (flow: CashFlowEntry) => Boolean(flow.name.trim()) || flow.amount > 0 || flow.memberId !== null
  const meaningfulEducation = (goal: EducationGoal) => Boolean(
    goal.childMemberId
    || goal.currentStage !== '未开始'
    || goal.yearsUntilStart > 0
    || goal.annualCostToday > 0
    || goal.preparedAmount > 0
    || (goal.extraTrainingCostAnnual ?? 0) > 0
    || goal.stagePlans?.some((plan) => Boolean(plan.route)),
  )

  if (step === 'profile') return Boolean(customer.primaryContactName.trim() || customer.city.trim() || customer.notes.trim())
  if (step === 'members') return customer.members.some((member) => Boolean(member.name.trim() || member.birthDate || member.jobType.trim() || member.phone.trim() || member.healthNotes.trim() || member.heightCm || member.weightKg))
  if (step === 'fixed_assets') return customer.assets.some((asset) => (asset.category === 'property' || asset.category === 'vehicle') && meaningfulAsset(asset))
  if (step === 'liquid_assets') return customer.assets.some((asset) => asset.category !== 'property' && asset.category !== 'vehicle' && meaningfulAsset(asset)) || customer.liabilities.some(meaningfulLiability)
  if (step === 'cashflow') return customer.incomes.some(meaningfulFlow) || customer.expenses.some(meaningfulFlow)
  return customer.educationGoals.some(meaningfulEducation)
}

export function isIntakeComplete(customer: CustomerProfile) {
  return intakeStepKeys.every((step) => hasIntakeStepData(customer, step))
}

export function intakeCompletion(customer: CustomerProfile) {
  return Math.round((intakeStepKeys.filter((step) => hasIntakeStepData(customer, step)).length / intakeStepKeys.length) * 100)
}

export function canSyncSelfServiceCustomer(customer: CustomerProfile) {
  return Boolean(customer.primaryContactName.trim()) && intakeCompletion(customer) > 10
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
  extraTrainingCostAnnual?: number
  stagePlans?: EducationStagePlan[]
}

export interface EducationStagePlan {
  stage: string
  durationYears: number
  route: string
  destination?: string
}

export const educationStageDefaults: EducationStagePlan[] = [
  { stage: '早教', durationYears: 3, route: '' },
  { stage: '幼儿园', durationYears: 3, route: '' },
  { stage: '小学', durationYears: 6, route: '' },
  { stage: '初中', durationYears: 3, route: '' },
  { stage: '高中', durationYears: 3, route: '' },
  { stage: '本科', durationYears: 4, route: '' },
  { stage: '研究生', durationYears: 2, route: '' },
]

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

export function createCustomer(primaryContactName: string, source: CustomerProfile['source'] = 'advisor'): CustomerProfile {
  const now = new Date().toISOString()
  const cleanName = primaryContactName.trim()
  return {
    id: crypto.randomUUID(),
    source,
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
  return {
    id: crypto.randomUUID(),
    childMemberId: null,
    currentStage: '未开始',
    targetRoute: '',
    yearsUntilStart: 0,
    annualCostToday: 0,
    durationYears: 3,
    inflationRate: 5,
    preparedAmount: 0,
    extraTrainingCostAnnual: 0,
    stagePlans: educationStageDefaults.map((plan) => ({ ...plan })),
  }
}

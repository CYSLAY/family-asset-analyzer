import { annualize } from './analysis'
import { insuranceSelection, savingsInsuranceYear } from './savingsInsurance'
import type { CashFlowPlan, CashFlowPlanItem, CustomerProfile } from '../types/domain'
import { isLiquidAsset } from '../types/domain'
import { insuranceScenarioRows } from './insuranceScenario'

export interface CashFlowProjectionRow {
  offset: number
  year: number
  memberAges: Array<number | null>
  incomeValues: number[]
  totalIncome: number
  expenseValues: number[]
  totalExpenses: number
  savingsInsurancePremium: number
  totalExpensesWithInsurance: number
  annualNet: number
  balanceWithoutReturn: number
  fundsExpenseCoverageRate: number | null
  savingsInsuranceBalance: number
  savingsInsuranceIrr: number | null
  insuranceScenarioLiquidBalance: number
  balanceWithSavingsInsurance: number
  savingsInsuranceCoverageRate: number | null
}

export type ExpenseCoverageBand = 'long_term' | 'adequate' | 'medium_term' | 'limited' | 'attention' | 'unavailable'

export function expenseCoverageBand(value: number | null): { band: ExpenseCoverageBand; label: string } {
  if (value === null || !Number.isFinite(value)) return { band: 'unavailable', label: '暂无法判断' }
  if (value <= 5) return { band: 'long_term', label: '长期充足' }
  if (value <= 10) return { band: 'adequate', label: '较充足' }
  if (value <= 20) return { band: 'medium_term', label: '中期覆盖' }
  if (value <= 50) return { band: 'limited', label: '缓冲有限' }
  return { band: 'attention', label: '需重点关注' }
}

const defaultIncomeLabels = ['主要收入', '配偶收入', '房租收入', '其他收入']
const defaultExpenseLabels = ['生活支出', '教育支出', '养老支出', '房贷支出', '旅游支出', '保费支出', '娱乐支出', '生意支出', '父母医疗']

export function createCashFlowPlanFromCustomer(customer: CustomerProfile, baseYear = new Date().getFullYear()): CashFlowPlan {
  const members = customer.members.slice(0, 3).map((member) => ({
    id: member.id,
    name: member.name || member.relation || '家庭成员',
    baseAge: ageAtYear(member.birthDate, baseYear),
  }))
  const oldestAge = Math.max(0, ...members.map((member) => member.baseAge ?? 0))
  const projectionYears = oldestAge > 0 ? clamp(91 - oldestAge, 10, 55) : 30
  const incomes = mergeWithDefaults(
    customer.incomes.map((item) => ({ label: item.name || item.category, amount: annualize(item) })),
    defaultIncomeLabels,
    baseYear,
    projectionYears,
  )
  const expenseEntries = customer.expenses.map((item) => ({ label: classifyExpense(item.name || item.category), amount: annualize(item) }))
  const mortgagePayments = customer.liabilities
    .filter((item) => item.monthlyPayment > 0)
  const expenses = mergeWithDefaults(expenseEntries, defaultExpenseLabels, baseYear, projectionYears)
  for (const debt of mortgagePayments) {
    const label = debt.category === 'mortgage' ? '房贷支出' : '贷款偿还'
    let item = expenses.find(e => e.label === label)
    if (!item) { item = createPlanItem(label, baseYear, projectionYears); expenses.push(item) }
    const base = item.annualAmount
    const previous = item.yearlyAmounts ?? {}
    item.yearlyAmounts = Object.fromEntries(Array.from({ length: 55 }, (_, offset) => {
      const months = debt.remainingMonths === null ? 12 : Math.max(0, Math.min(12, debt.remainingMonths - offset * 12))
      return [String(baseYear + offset), (previous[String(baseYear + offset)] ?? base) + debt.monthlyPayment * months]
    }))
  }

  return {
    baseYear,
    projectionYears,
    annualReturnRate: 3.5,
    initialFunds: customer.assets
      .filter(isLiquidAsset)
      .reduce((sum, asset) => sum + asset.currentValue, 0),
    savingsInsuranceAnnualPremium: 0,
    members,
    incomes,
    expenses,
  }
}

export function buildCashFlowProjection(plan: CashFlowPlan): CashFlowProjectionRow[] {
  const rows: CashFlowProjectionRow[] = []
  let balanceWithoutReturn = plan.initialFunds
  let insuranceScenarioLiquidBalance = plan.initialFunds
  const scenarioRows = plan.insuranceScenario ? insuranceScenarioRows(plan.insuranceScenario) : null

  for (let offset = 0; offset < plan.projectionYears; offset += 1) {
    const year = plan.baseYear + offset
    const incomeValues = plan.incomes.map((item) => projectedItemAmount(item, year, plan.baseYear))
    const expenseValues = plan.expenses.map((item) => projectedItemAmount(item, year, plan.baseYear))
    const totalIncome = sum(incomeValues)
    const totalExpenses = sum(expenseValues)
    const { product, paymentYears } = insuranceSelection(plan)
    const savingsInsurance = scenarioRows ? (scenarioRows[offset] ?? { premium: 0, balance: 0, irr: null, receipt: 0 }) : { ...savingsInsuranceYear(plan.savingsInsuranceAnnualPremium, offset, product, paymentYears), receipt: 0 }
    const totalExpensesWithInsurance = totalExpenses + savingsInsurance.premium
    const annualNet = totalIncome - totalExpenses
    const annualNetWithInsurance = totalIncome - totalExpensesWithInsurance
    balanceWithoutReturn += annualNet
    insuranceScenarioLiquidBalance += annualNetWithInsurance + savingsInsurance.receipt
    const balanceWithSavingsInsurance = insuranceScenarioLiquidBalance + savingsInsurance.balance
    rows.push({
      offset,
      year,
      memberAges: plan.members.map((member) => member.baseAge === null ? null : member.baseAge + offset),
      incomeValues,
      totalIncome,
      expenseValues,
      totalExpenses,
      savingsInsurancePremium: savingsInsurance.premium,
      totalExpensesWithInsurance,
      annualNet,
      balanceWithoutReturn,
      fundsExpenseCoverageRate: balanceWithoutReturn > 0 ? totalExpenses / balanceWithoutReturn * 100 : null,
      savingsInsuranceBalance: savingsInsurance.balance,
      savingsInsuranceIrr: savingsInsurance.irr,
      insuranceScenarioLiquidBalance,
      balanceWithSavingsInsurance,
      savingsInsuranceCoverageRate: balanceWithSavingsInsurance > 0 ? totalExpensesWithInsurance / balanceWithSavingsInsurance * 100 : null,
    })
  }
  return rows
}

export function createPlanItem(label: string, baseYear: number, projectionYears: number): CashFlowPlanItem {
  return { id: crypto.randomUUID(), label, annualAmount: 0, growthRate: 0, startYear: baseYear, endYear: baseYear + projectionYears - 1 }
}

export function fillYearlyAmountsBelow(current: Record<string, number> | undefined, sourceYear: number, baseYear: number, projectionYears: number, value: number) {
  const next = { ...current }
  const lastYear = baseYear + projectionYears - 1
  for (let year = Math.max(baseYear, sourceYear + 1); year <= lastYear; year += 1) next[String(year)] = value
  return next
}

export function fillYearlyAmountsRange(current: Record<string, number> | undefined, sourceYear: number, targetYear: number, value: number) {
  const next = { ...current }
  for (let year = sourceYear + 1; year <= targetYear; year += 1) next[String(year)] = value
  return next
}

export function mergeCustomerDataIntoPlan(plan: CashFlowPlan, customer: CustomerProfile): CashFlowPlan {
  const fresh = createCashFlowPlanFromCustomer(customer, plan.baseYear)
  return {
    ...plan,
    members: mergeMembers(plan, fresh),
    incomes: mergePlanItems(plan.incomes, fresh.incomes),
    expenses: mergePlanItems(plan.expenses, fresh.expenses),
    initialFunds: plan.initialFunds,
  }
}

function mergeMembers(plan: CashFlowPlan, fresh: CashFlowPlan) {
  const existingIds = new Set(plan.members.map((member) => member.id))
  return [...plan.members, ...fresh.members.filter((member) => !existingIds.has(member.id))].slice(0, 3)
}

function mergePlanItems(current: CashFlowPlanItem[], fresh: CashFlowPlanItem[]) {
  const labels = new Set(current.map((item) => normalizeLabel(item.label)))
  return [...current, ...fresh.filter((item) => (item.annualAmount > 0 || Object.values(item.yearlyAmounts ?? {}).some((value) => value > 0)) && !labels.has(normalizeLabel(item.label)))]
}

function mergeWithDefaults(entries: Array<{ label: string; amount: number }>, defaults: string[], baseYear: number, projectionYears: number) {
  const grouped = new Map<string, number>()
  entries.forEach((entry) => {
    if (!entry.label || entry.amount <= 0) return
    grouped.set(entry.label, (grouped.get(entry.label) ?? 0) + entry.amount)
  })
  const rows = [...grouped.entries()].map(([label, annualAmount]) => ({
    ...createPlanItem(label, baseYear, projectionYears),
    annualAmount,
  }))
  defaults.forEach((label) => {
    if (!rows.some((item) => normalizeLabel(item.label) === normalizeLabel(label))) rows.push(createPlanItem(label, baseYear, projectionYears))
  })
  return rows
}

function classifyExpense(value: string) {
  if (/教育|学费|培训/.test(value)) return '教育支出'
  if (/养老/.test(value)) return '养老支出'
  if (/房贷|按揭/.test(value)) return '房贷支出'
  if (/旅游|旅行/.test(value)) return '旅游支出'
  if (/保险|保费/.test(value)) return '保费支出'
  if (/娱乐/.test(value)) return '娱乐支出'
  if (/生意|经营/.test(value)) return '生意支出'
  if (/父母|医疗/.test(value)) return '父母医疗'
  return '生活支出'
}

function projectedItemAmount(item: CashFlowPlanItem, year: number, baseYear: number) {
  const override = item.yearlyAmounts?.[String(year)]
  if (override !== undefined && Number.isFinite(override)) return override
  if (year < item.startYear || year > item.endYear) return 0
  return item.annualAmount * Math.pow(1 + item.growthRate / 100, Math.max(0, year - baseYear))
}

function ageAtYear(birthDate: string, year: number) {
  if (!birthDate) return null
  const birthYear = Number(birthDate.slice(0, 4))
  return Number.isFinite(birthYear) && birthYear > 1900 ? Math.max(0, year - birthYear) : null
}

function normalizeLabel(value: string) { return value.replace(/\s+/g, '').toLowerCase() }
function sum(values: number[]) { return values.reduce((total, value) => total + value, 0) }
function clamp(value: number, minimum: number, maximum: number) { return Math.min(maximum, Math.max(minimum, value)) }

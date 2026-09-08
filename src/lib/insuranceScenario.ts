import { calculateInsurance, defaultInsuranceInputs } from './insuranceCalculator'
import { insuranceSelection } from './savingsInsurance'
import type { CashFlowPlan } from '../types/domain'

// Resolve legacy parameters without rewriting saved customer documents on page load.
export function resolveInsuranceScenario(plan: CashFlowPlan): CashFlowPlan['insuranceScenario'] {
  if (plan.insuranceScenario) return plan.insuranceScenario
  const premium = plan.savingsInsuranceAnnualPremium ?? 0
  if (premium <= 0) return undefined
  const selection = insuranceSelection(plan)
  const product = selection.product === 'trst' ? 'TRST' : 'PRMESP'
  const prepaid = product === 'TRST' && selection.paymentYears === 1
  const age = Math.max(1, plan.members[0]?.baseAge ?? 41)
  const inputs = { ...defaultInsuranceInputs(product), currency: 'RMB-U', amount: prepaid ? premium / 5 : premium, prepaid, age, surrenderAge: Math.min(201, age + 55), promotion: false }
  return { version: 1, model: 'workbook-2026-08-03-v1', name: '储蓄险方案', product, inputs, exchangeRateToRmb: 1 }
}

export function insuranceScenarioRows(scenario: NonNullable<CashFlowPlan['insuranceScenario']>) {
  if (scenario.version !== 1 || scenario.model !== 'workbook-2026-08-03-v1') throw Error('储蓄险模型版本不受支持，请重新选择方案')
  const fx = scenario.exchangeRateToRmb
  if (!Number.isFinite(fx) || fx <= 0) throw Error('请填写有效的人民币折算汇率')
  const result = calculateInsurance(scenario.product, scenario.inputs)
  return result.rows.map((row, index) => {
    const repaysLoan = row.age === result.loanRepaymentAge
    const loanOutstanding = result.loanRepaymentAge !== null && row.age < result.loanRepaymentAge ? result.loan : 0
    const surrendered = index === result.rows.length - 1
    return {
      premium: row.contribution * fx,
      receipt: (row.withdrawal + (surrendered ? row.balance : 0) - (repaysLoan ? result.loan : 0)) * fx,
      balance: (surrendered ? 0 : row.balance - loanOutstanding) * fx,
      irr: row.irr ? row.irr * 100 : null,
    }
  })
}

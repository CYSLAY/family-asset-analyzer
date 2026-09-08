import { describe, expect, it } from 'vitest'
import { calculateInsurance, defaultInsuranceInputs } from './insuranceCalculator'
import { insuranceScenarioRows } from './insuranceScenario'
import { createCashFlowPlanFromCustomer, buildCashFlowProjection } from './cashFlowPlan'
import { createCustomer, type CashFlowPlan } from '../types/domain'

function scenario(product: 'TRST' | 'PRMESP'): NonNullable<CashFlowPlan['insuranceScenario']> {
  return { version: 1, model: 'workbook-2026-08-03-v1', name: 'test', product, inputs: { ...defaultInsuranceInputs(product), currency: 'RMB-U', surrenderAge: 61 }, exchangeRateToRmb: 1 }
}
describe('unified insurance cash flow', () => {
  it.each(['TRST', 'PRMESP'] as const)('reuses %s workbook cash flows and settles surrender exactly once', product => {
    const saved = scenario(product), reference = calculateInsurance(product, saved.inputs)
    const rows = insuranceScenarioRows(saved)
    expect(rows.reduce((sum, row) => sum + row.premium, 0)).toBeCloseTo(reference.totalContribution, 2)
    expect(rows.reduce((sum, row) => sum + row.receipt, 0)).toBeCloseTo(reference.totalWithdrawal, 2)
    expect(rows.at(-1)!.balance).toBe(0)
    const plan = createCashFlowPlanFromCustomer(createCustomer('test'))
    const projected = buildCashFlowProjection({ ...plan, projectionYears: 30, initialFunds: 10000000, insuranceScenario: saved })
    expect(projected[29].insuranceScenarioLiquidBalance).toBeCloseTo(10000000 - reference.totalContribution + reference.totalWithdrawal, 2)
    expect(projected[29].balanceWithoutReturn).toBe(10000000)
  })
  it('deducts financing principal once and does not double count withdrawals', () => {
    const saved = scenario('PRMESP'); saved.inputs.financingRate = 3; saved.inputs.withdrawalAge = 51; saved.inputs.withdrawal = 1000; saved.inputs.withdrawalYears = 5
    const reference = calculateInsurance(saved.product, saved.inputs), rows = insuranceScenarioRows(saved)
    expect(rows.reduce((sum, row) => sum + row.receipt, 0)).toBeCloseTo(reference.totalWithdrawal, 2)
    expect(rows[0].balance).toBeCloseTo(reference.rows[0].balance - reference.loan, 2)
  })
  it('applies explicit display-currency conversion to every financial column', () => {
    const saved = scenario('TRST'), base = insuranceScenarioRows(saved), converted = insuranceScenarioRows({ ...saved, exchangeRateToRmb: 2 })
    expect(converted[4].balance).toBeCloseTo(base[4].balance * 2)
    expect(converted[0].premium).toBeCloseTo(base[0].premium * 2)
    expect(() => insuranceScenarioRows({ ...saved, exchangeRateToRmb: 0 })).toThrow()
  })
})

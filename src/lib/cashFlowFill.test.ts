import { describe, expect, it } from 'vitest'
import { createCustomer } from '../types/domain'
import { createCashFlowPlanFromCustomer } from './cashFlowPlan'
import { applyCashFlowFill, undoCashFlowFill } from './cashFlowFill'

function fixture() {
  const plan = createCashFlowPlanFromCustomer(createCustomer('测试'), 2026)
  plan.incomes = [{ id: 'salary', label: '收入', annualAmount: 100, growthRate: 0, startYear: 2026, endYear: 2080, yearlyAmounts: { '2028': 0 } }]
  return plan
}

describe('cash flow fill transactions', () => {
  it('changes only selected years and column, including explicit zero', () => {
    const plan = fixture()
    const result = applyCashFlowFill(plan, 'a', 'incomes', 'salary', 2026, 2028, 0)!
    expect(result.plan.incomes[0].yearlyAmounts).toEqual({ 2027: 0, 2028: 0 })
    expect(result.plan.expenses).toBe(plan.expenses)
    expect(undoCashFlowFill(result.plan, 'a', result.undo).incomes[0].yearlyAmounts).toEqual({ 2028: 0 })
  })
  it('undo preserves later independent parameters and cell changes', () => {
    const result = applyCashFlowFill(fixture(), 'a', 'incomes', 'salary', 2026, 2029, 500)!
    result.plan.initialFunds = 12345
    result.plan.incomes[0].yearlyAmounts![2027] = 777
    const undone = undoCashFlowFill(result.plan, 'a', result.undo)
    expect(undone.initialFunds).toBe(12345)
    expect(undone.incomes[0].yearlyAmounts).toEqual({ 2027: 777, 2028: 0 })
  })
  it('cannot undo another customer or a shifted timeline', () => {
    const result = applyCashFlowFill(fixture(), 'a', 'incomes', 'salary', 2026, 2027, 1)!
    expect(undoCashFlowFill(result.plan, 'b', result.undo)).toBe(result.plan)
    const shifted = { ...result.plan, baseYear: 2030 }
    expect(undoCashFlowFill(shifted, 'a', result.undo)).toBe(shifted)
  })
  it('rejects missing columns, out of range years and invalid values', () => {
    for (const [source, target, amount] of [[2026, 2026, 1], [2025, 2028, 1], [2026, 3000, 1], [2026, 2027, -1], [2026, 2027, NaN]]) expect(applyCashFlowFill(fixture(), 'a', 'incomes', 'salary', source, target, amount)).toBeNull()
    expect(applyCashFlowFill(fixture(), 'a', 'incomes', 'missing', 2026, 2027, 1)).toBeNull()
  })
})

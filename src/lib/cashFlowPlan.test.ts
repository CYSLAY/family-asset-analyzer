import { describe, expect, it } from 'vitest'
import { buildCashFlowProjection, createCashFlowPlanFromCustomer } from './cashFlowPlan'
import { createCustomer } from '../types/domain'

describe('cash flow plan', () => {
  it('pulls existing annualized income, expenses and liquid funds', () => {
    const customer = createCustomer('嘉玲')
    customer.assets = [{ id: 'cash', name: '现金', category: 'cash', currentValue: 3700000, ownerMemberId: null, liquidity: 'immediate', availableForEmergency: true, annualReturnRate: null }]
    customer.incomes = [{ id: 'salary', name: '主要收入', category: '工作收入', amount: 1000000, frequency: 'yearly', necessary: false, memberId: null }]
    customer.expenses = [{ id: 'living', name: '餐饮零食', category: '基本生活', amount: 700000, frequency: 'yearly', necessary: true, memberId: null }]
    const plan = createCashFlowPlanFromCustomer(customer, 2026)
    expect(plan.initialFunds).toBe(3700000)
    expect(plan.incomes.find((item) => item.label === '主要收入')?.annualAmount).toBe(1000000)
    expect(plan.expenses.find((item) => item.label === '生活支出')?.annualAmount).toBe(700000)
  })

  it('calculates the two balance scenarios using auditable yearly roll-forwards', () => {
    const customer = createCustomer('嘉玲')
    const plan = createCashFlowPlanFromCustomer(customer, 2026)
    plan.projectionYears = 2
    plan.initialFunds = 3700000
    plan.annualReturnRate = 3.5
    plan.incomes = [{ id: 'income', label: '主要收入', annualAmount: 1000000, growthRate: 0, startYear: 2026, endYear: 2027 }]
    plan.expenses = [{ id: 'expense', label: '生活支出', annualAmount: 1300000, growthRate: 0, startYear: 2026, endYear: 2027 }]
    const rows = buildCashFlowProjection(plan)
    expect(rows[0].annualNet).toBe(-300000)
    expect(rows[0].balanceWithoutReturn).toBe(3400000)
    expect(rows[0].balanceWithReturn).toBeCloseTo(3519000)
    expect(rows[1].balanceWithoutReturn).toBe(3100000)
    expect(rows[1].balanceWithReturn).toBeCloseTo(3331665)
  })

  it('uses a directly edited yearly amount without changing other years', () => {
    const customer = createCustomer('嘉玲')
    const plan = createCashFlowPlanFromCustomer(customer, 2026)
    plan.projectionYears = 2
    plan.incomes = [{ id: 'income', label: '主要收入', annualAmount: 1000000, growthRate: 0, startYear: 2026, endYear: 2027, yearlyAmounts: { '2027': 1200000 } }]
    plan.expenses = []
    const rows = buildCashFlowProjection(plan)
    expect(rows[0].totalIncome).toBe(1000000)
    expect(rows[1].totalIncome).toBe(1200000)
  })
})

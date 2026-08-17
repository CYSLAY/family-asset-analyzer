import { describe, expect, it } from 'vitest'
import { buildCashFlowProjection, createCashFlowPlanFromCustomer, expenseCoverageBand, fillYearlyAmountsBelow } from './cashFlowPlan'
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
    expect(rows[0].fundsExpenseCoverageRate).toBeCloseTo(1300000 / 3400000 * 100)
    expect(rows[0].expenseCoverageRate).toBeCloseTo(1300000 / 3519000 * 100)
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

  it('classifies expense coverage into planning bands', () => {
    expect(expenseCoverageBand(5).band).toBe('long_term')
    expect(expenseCoverageBand(8).band).toBe('adequate')
    expect(expenseCoverageBand(15).band).toBe('medium_term')
    expect(expenseCoverageBand(35).band).toBe('limited')
    expect(expenseCoverageBand(60).band).toBe('attention')
    expect(expenseCoverageBand(null).band).toBe('unavailable')
  })

  it('stops calculating expense coverage after scenario funds are depleted', () => {
    const customer = createCustomer('嘉玲')
    const plan = createCashFlowPlanFromCustomer(customer, 2026)
    plan.projectionYears = 1
    plan.initialFunds = 100000
    plan.annualReturnRate = 0
    plan.incomes = []
    plan.expenses = [{ id: 'expense', label: '生活支出', annualAmount: 200000, growthRate: 0, startYear: 2026, endYear: 2026 }]
    const [row] = buildCashFlowProjection(plan)
    expect(row.fundsExpenseCoverageRate).toBeNull()
    expect(row.balanceWithReturn).toBe(-100000)
    expect(row.expenseCoverageRate).toBeNull()
  })

  it('keeps funds coverage separate from return-scenario coverage', () => {
    const customer = createCustomer('嘉玲')
    const plan = createCashFlowPlanFromCustomer(customer, 2026)
    plan.projectionYears = 1
    plan.initialFunds = 1000000
    plan.annualReturnRate = 3.5
    plan.incomes = []
    plan.expenses = [{ id: 'expense', label: '生活支出', annualAmount: 100000, growthRate: 0, startYear: 2026, endYear: 2026 }]
    const [row] = buildCashFlowProjection(plan)
    expect(row.balanceWithoutReturn).toBe(900000)
    expect(row.balanceWithReturn).toBeCloseTo(931500)
    expect(row.fundsExpenseCoverageRate).toBeCloseTo(100000 / 900000 * 100)
    expect(row.expenseCoverageRate).toBeCloseTo(100000 / 931500 * 100)
    expect(row.fundsExpenseCoverageRate).not.toBe(row.expenseCoverageRate)
  })

  it('models five savings-insurance payments and the supplied reference balance schedule', () => {
    const customer = createCustomer('嘉玲')
    const plan = createCashFlowPlanFromCustomer(customer, 2026)
    plan.projectionYears = 6
    plan.initialFunds = 5000000
    plan.annualReturnRate = 0
    plan.savingsInsuranceAnnualPremium = 500000
    plan.incomes = []
    plan.expenses = []
    const rows = buildCashFlowProjection(plan)

    expect(rows.slice(0, 5).map((row) => row.savingsInsurancePremium)).toEqual([500000, 500000, 500000, 500000, 500000])
    expect(rows[5].savingsInsurancePremium).toBe(0)
    expect(rows[3].savingsInsuranceBalance).toBe(622290)
    expect(rows[4].savingsInsuranceBalance).toBe(964294)
    expect(rows[5].savingsInsuranceBalance).toBe(1283208)
    expect(rows[4].balanceWithReturn).toBe(2500000)
    expect(rows[4].balanceWithReturnAndInsurance).toBe(3464294)
    expect(rows[5].balanceWithReturnAndInsurance).toBe(3783208)
  })

  it('scales policy balances with the configured annual contribution', () => {
    const customer = createCustomer('嘉玲')
    const plan = createCashFlowPlanFromCustomer(customer, 2026)
    plan.projectionYears = 4
    plan.initialFunds = 3000000
    plan.annualReturnRate = 0
    plan.savingsInsuranceAnnualPremium = 250000
    plan.incomes = []
    plan.expenses = []
    const rows = buildCashFlowProjection(plan)
    expect(rows[3].savingsInsuranceBalance).toBe(311145)
    expect(rows[3].totalOutflows).toBe(250000)
  })

  it('applies an edited amount only to years below the source row', () => {
    const amounts = fillYearlyAmountsBelow({ '2026': 100, '2027': 200, '2028': 300 }, 2027, 2026, 4, 900)
    expect(amounts).toEqual({ '2026': 100, '2027': 200, '2028': 900, '2029': 900 })
  })
})

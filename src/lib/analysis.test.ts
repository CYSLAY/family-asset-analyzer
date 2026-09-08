import { describe, expect, it } from 'vitest'
import { analyzeCustomer } from './analysis'
import { createAsset, createCashFlow, createCustomer, createEducationGoal, createLiability } from '../types/domain'

describe('financial analysis', () => {
  it('does not report a zero savings rate when income is missing', () => {
    const result = analyzeCustomer(createCustomer('测试'))
    expect(result.metrics.find((item) => item.key === 'savings_rate')?.value).toBeNull()
  })

  it('does not treat an empty balance sheet as zero net worth', () => {
    const result = analyzeCustomer(createCustomer('空白资料'))
    expect(result.metrics.find((item) => item.key === 'net_worth')?.value).toBeNull()
    expect(result.score).toBeNull()
  })

  it('changes savings copy across deficit and healthy ranges', () => {
    const deficit = createCustomer('赤字')
    deficit.incomes = [{ ...createCashFlow('income'), amount: 10000 }]
    deficit.expenses = [{ ...createCashFlow('expense'), amount: 15000 }]
    const healthy = createCustomer('结余')
    healthy.incomes = [{ ...createCashFlow('income'), amount: 20000 }]
    healthy.expenses = [{ ...createCashFlow('expense'), amount: 10000 }]
    expect(analyzeCustomer(deficit).metrics.find((item) => item.key === 'savings_rate')?.title).toBe('家庭现金流持续赤字')
    expect(analyzeCustomer(healthy).metrics.find((item) => item.key === 'savings_rate')?.title).toBe('储蓄能力较强')
  })

  it('caps the overall score when net worth is negative', () => {
    const customer = createCustomer('负债')
    customer.assets = [{ ...createAsset(), currentValue: 100000 }]
    customer.liabilities = [{ ...createLiability(), balance: 300000 }]
    expect(analyzeCustomer(customer).score).toBeLessThanOrEqual(49)
  })

  it('uses a higher emergency target for a single variable income household', () => {
    const customer = createCustomer('收入波动')
    customer.members[0].incomeStability = 'self_employed'
    customer.assets = [{ ...createAsset(), currentValue: 60000 }]
    customer.expenses = [{ ...createCashFlow('expense'), amount: 10000, necessary: true }]
    const metric = analyzeCustomer(customer).metrics.find((item) => item.key === 'emergency_months')
    expect(metric?.value).toBe(6)
    expect(metric?.level).toBe('attention')
    expect(metric?.reference).toContain('10 个月')
  })

  it('includes all family expenses in emergency reserve months', () => {
    const customer = createCustomer('家庭总支出')
    customer.assets = [{ ...createAsset(), currentValue: 120_000, availableForEmergency: true }]
    customer.expenses = [
      { ...createCashFlow('expense'), name: '其他支出', category: '其他支出', amount: 60_000, frequency: 'yearly', necessary: false },
      { ...createCashFlow('expense'), name: '娱乐、旅游', category: '可调整支出', amount: 60_000, frequency: 'yearly', necessary: false },
    ]
    const result = analyzeCustomer(customer)
    expect(result.totals.necessaryMonthlyOutflow).toBe(10_000)
    expect(result.metrics.find((item) => item.key === 'emergency_months')?.value).toBe(12)
  })

  it('changes debt-service wording as monthly payments increase', () => {
    const light = createCustomer('轻负债')
    light.incomes = [{ ...createCashFlow('income'), amount: 20_000 }]
    light.liabilities = [{ ...createLiability(), balance: 100_000, monthlyPayment: 2_000 }]
    const heavy = createCustomer('重负债')
    heavy.incomes = [{ ...createCashFlow('income'), amount: 20_000 }]
    heavy.liabilities = [{ ...createLiability(), balance: 800_000, monthlyPayment: 11_000 }]
    expect(analyzeCustomer(light).metrics.find((item) => item.key === 'debt_service_ratio')?.title).toBe('月供对收入占用较轻')
    expect(analyzeCustomer(heavy).metrics.find((item) => item.key === 'debt_service_ratio')?.title).toBe('大部分收入用于偿债')
  })

  it('uses the screenshot reference line of three times for liquid debt coverage', () => {
    const customer = createCustomer('偿债覆盖')
    customer.assets = [{ ...createAsset(), currentValue: 300_000 }]
    customer.liabilities = [{ ...createLiability(), balance: 100_000, dueWithinOneYear: 100_000 }]
    const metric = analyzeCustomer(customer).metrics.find((item) => item.key === 'liquid_coverage')
    expect(metric?.value).toBe(3)
    expect(metric?.level).toBe('healthy')
  })

  it('infers one-year debt from monthly payments when the separate annual field is empty', () => {
    const customer = createCustomer('自动推算')
    customer.assets = [{ ...createAsset(), currentValue: 360_000 }]
    customer.liabilities = [{ ...createLiability(), balance: 200_000, monthlyPayment: 10_000, remainingMonths: 24, dueWithinOneYear: 0 }]
    const result = analyzeCustomer(customer)
    expect(result.totals.dueWithinOneYear).toBe(120_000)
    expect(result.metrics.find((item) => item.key === 'liquid_coverage')?.value).toBe(3)
  })

  it('shows no debt only after the household explicitly confirms it', () => {
    const customer = createCustomer('无负债')
    customer.assets = [{ ...createAsset(), currentValue: 200_000 }]
    expect(analyzeCustomer(customer).metrics.find((item) => item.key === 'liquid_coverage')?.value).toBeNull()
    customer.noLiabilitiesConfirmed = true
    const metric = analyzeCustomer(customer).metrics.find((item) => item.key === 'liquid_coverage')
    expect(metric?.title).toBe('当前没有短期偿债压力')
    expect(metric?.displayValue).toBe('无负债')
    expect(metric?.level).toBe('strong')
  })

  it('measures insurance spending without treating investments as premiums', () => {
    const none = createCustomer('未投保')
    none.incomes = [{ ...createCashFlow('income'), amount: 10_000 }]
    none.expenses = [{ ...createCashFlow('expense'), name: '家庭定投', category: '投资支出', amount: 3_000 }]
    const moderate = createCustomer('适中保费')
    moderate.incomes = [{ ...createCashFlow('income'), amount: 10_000 }]
    moderate.expenses = [{ ...createCashFlow('expense'), name: '保险', category: '保险保障', amount: 1_000 }]
    const high = createCustomer('较高保费')
    high.incomes = [{ ...createCashFlow('income'), amount: 10_000 }]
    high.expenses = [{ ...createCashFlow('expense'), name: '保险', category: '保险保障', amount: 2_100 }]

    expect(analyzeCustomer(none).metrics.find((item) => item.key === 'insurance_expense_ratio')).toMatchObject({ value: 0, level: 'neutral' })
    expect(analyzeCustomer(moderate).metrics.find((item) => item.key === 'insurance_expense_ratio')).toMatchObject({ value: 10, level: 'healthy' })
    expect(analyzeCustomer(high).metrics.find((item) => item.key === 'insurance_expense_ratio')).toMatchObject({ value: 21, level: 'warning' })
    expect(analyzeCustomer(high).metrics.find((item) => item.key === 'insurance_expense_ratio')?.reference).toBe('1. 0%：无保险投入\n2. 低于10%：有一定投入\n3. 10%–20%：较合理区间\n4. 高于20%：需确保现金流健康')
  })

  it.each([[9.99, 'healthy'], [10, 'healthy'], [20, 'healthy'], [20.01, 'warning']])('classifies insurance ratio %s at the correct boundary', (ratio, level) => {
    const customer = createCustomer('边界测试')
    customer.incomes = [{ ...createCashFlow('income'), amount: 100_000, frequency: 'yearly' }]
    customer.expenses = [{ ...createCashFlow('expense'), name: '年度保费', amount: Number(ratio) * 1_000, frequency: 'yearly' }]
    expect(analyzeCustomer(customer).metrics.find((item) => item.key === 'insurance_expense_ratio')?.level).toBe(level)
  })

  it('does not directly change the overall score when the same outflow is insurance', () => {
    const customer = createCustomer('评分测试')
    customer.incomes = [{ ...createCashFlow('income'), amount: 100_000, frequency: 'yearly' }]
    customer.expenses = [{ ...createCashFlow('expense'), name: '生活', category: '生活支出', amount: 25_000, frequency: 'yearly' }]
    const before = analyzeCustomer(customer)
    customer.expenses[0].name = '保险'
    const after = analyzeCustomer(customer)
    expect(after.score).toBe(before.score)
    expect(after.totals.annualExpenses).toBe(before.totals.annualExpenses)
  })

  it('uses the selected education route cash total without hidden inflation fields', () => {
    const customer = createCustomer('教育规划')
    const goal = createEducationGoal()
    goal.yearsUntilStart = 10
    goal.inflationRate = 20
    goal.annualCostToday = 999_999
    goal.stagePlans = [{ stage: '本科', durationYears: 4, route: '留学', destination: '美国' }]
    customer.educationGoals = [goal]
    expect(analyzeCustomer(customer).totals.educationFutureCost).toBe(1_453_942)
  })
})

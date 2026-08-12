import { describe, expect, it } from 'vitest'
import { analyzeCustomer } from './analysis'
import { createAsset, createCashFlow, createCustomer, createLiability } from '../types/domain'

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

  it('shows no debt instead of insufficient data when the household has no liabilities', () => {
    const customer = createCustomer('无负债')
    customer.assets = [{ ...createAsset(), currentValue: 200_000 }]
    const metric = analyzeCustomer(customer).metrics.find((item) => item.key === 'liquid_coverage')
    expect(metric?.title).toBe('当前没有短期偿债压力')
    expect(metric?.displayValue).toBe('无负债')
    expect(metric?.level).toBe('strong')
  })

  it('changes investment health copy with recognized long-term spending', () => {
    const none = createCustomer('未投入')
    none.incomes = [{ ...createCashFlow('income'), amount: 10_000 }]
    const prepared = createCustomer('有投入')
    prepared.incomes = [{ ...createCashFlow('income'), amount: 10_000 }]
    prepared.expenses = [{ ...createCashFlow('expense'), name: '家庭定投', category: '投资支出', amount: 3_000 }]
    expect(analyzeCustomer(none).metrics.find((item) => item.key === 'investment_rate')?.level).toBe('critical')
    expect(analyzeCustomer(prepared).metrics.find((item) => item.key === 'investment_rate')?.level).toBe('strong')
  })
})

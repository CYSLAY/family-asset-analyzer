import { describe, expect, it } from 'vitest'
import { analyzeCustomer } from './analysis'
import { createAsset, createCashFlow, createCustomer, createLiability } from '../types/domain'

describe('financial analysis', () => {
  it('does not report a zero savings rate when income is missing', () => {
    const result = analyzeCustomer(createCustomer('测试'))
    expect(result.metrics.find((item) => item.key === 'savings_rate')?.value).toBeNull()
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
})

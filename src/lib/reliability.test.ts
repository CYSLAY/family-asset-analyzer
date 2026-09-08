import { describe, expect, it } from 'vitest'
import { createAsset, createCustomer, createLiability, createCashFlow, canSyncSelfServiceCustomer, detachMember } from '../types/domain'
import { buildCustomerDirectoryView } from './customerDirectory'
import { buildCashFlowProjection, createCashFlowPlanFromCustomer, mergeCustomerDataIntoPlan } from './cashFlowPlan'
import { defaultInsuranceInputs, insuranceInputErrors } from './insuranceCalculator'
import { estimateEducationStage } from './educationCosts'

describe('audit regressions', () => {
  it('paginates advisor search results', () => {
    const customers = Array.from({ length: 12 }, () => createCustomer('搜索测试'))
    expect(buildCustomerDirectoryView(customers, '测试', 2).displayedAdvisorCustomers).toHaveLength(5)
    expect(buildCustomerDirectoryView(customers, '测试', 3).displayedAdvisorCustomers).toHaveLength(2)
  })
  it('keeps amounts when removing an associated member', () => {
    const c = createCustomer('关联测试')
    const id = c.members[0].id
    c.assets = [{ ...createAsset(), ownerMemberId: id, currentValue: 12345 }]
    c.incomes = [{ ...createCashFlow('income'), memberId: id, amount: 6789 }]
    const next = { ...c, ...detachMember(c, id) }
    expect(next.assets[0]).toMatchObject({ ownerMemberId: null, currentValue: 12345 })
    expect(next.incomes[0]).toMatchObject({ memberId: null, amount: 6789 })
  })
  it('does not upload a name-only household', () => {
    const c = createCustomer('客户', 'self_service')
    expect(canSyncSelfServiceCustomer(c)).toBe(false)
    c.assets = [{ ...createAsset(), currentValue: 10000 }]
    expect(canSyncSelfServiceCustomer(c)).toBe(true)
  })
  it('excludes locked funds and stops repayments at maturity', () => {
    const c = createCustomer('测试')
    c.assets = [{ ...createAsset(), currentValue: 10000 }, { ...createAsset(), currentValue: 90000, liquidity: 'long_term' }]
    c.liabilities = [{ ...createLiability(), monthlyPayment: 1000, remainingMonths: 15 }]
    const p = createCashFlowPlanFromCustomer(c, 2026)
    const rows = buildCashFlowProjection(p)
    expect(p.initialFunds).toBe(10000)
    expect(rows.slice(0, 3).map(r => r.totalExpenses)).toEqual([12000, 3000, 0])
    p.initialFunds = 0
    expect(mergeCustomerDataIntoPlan(p, c).initialFunds).toBe(0)
  })
  it('ignores disabled withdrawal age validation', () => {
    const p = { ...defaultInsuranceInputs('TRST'), age: 70 }
    expect(insuranceInputErrors('TRST', p)).toEqual([])
  })
  it('keeps reference training distinct from public tuition', () => {
    const e = estimateEducationStage({ stage: '小学', route: '公立', durationYears: 6 })
    expect(e.annualTuition).toBe(0)
    expect(e.annualLiving).toBe(6000)
    expect(e.annualTraining).toBe(140000)
    expect(e.cashTotal).toBe(876000)
  })
})

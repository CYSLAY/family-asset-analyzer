import { describe, expect, it } from 'vitest'
import { calculateInsurance, defaultInsuranceInputs, insuranceInputErrors, type InsuranceProduct } from './insuranceCalculator'

describe('advisor insurance calculator scenarios', () => {
  for (const product of ['TRST', 'PRMESP'] as InsuranceProduct[]) {
    it(`${product}: supports repeated plans, growing withdrawals and fulfillment assumptions`, () => {
      const p = { ...defaultInsuranceInputs(product), age: 35, surrenderAge: 85, repeats: 2, growth: 5, withdrawalAge: 60, withdrawal: 10000, inflation: 2, withdrawalYears: 10, fulfillment: 80 }
      const result = calculateInsurance(product, p)
      expect(result.rows).toHaveLength(51)
      expect(result.rows[0].contribution).toBeGreaterThan(0)
      expect(result.rows[25].withdrawal).toBeGreaterThan(0)
      expect(result.rows[26].withdrawal).toBeGreaterThan(result.rows[25].withdrawal)
      expect(result.rows[35].withdrawal).toBe(0)
      expect(result.rows.every(r => r.balance >= r.guaranteed - .01)).toBe(true)
    })
    it(`${product}: extra withdrawals reduce subsequent balances`, () => {
      const p = defaultInsuranceInputs(product)
      const baseline = calculateInsurance(product, p)
      const extra = calculateInsurance(product, { ...p, extras: { 20: 50000 } })
      expect(extra.rows[20].withdrawal).toBe(50000)
      expect(extra.rows[21].balance).toBeLessThan(baseline.rows[21].balance)
    })
  }
  for (const currency of ['HKD', 'USD', 'HKD-U', 'RMB-U', 'RMB', 'AUD', 'CAD', 'GBP']) {
    for (const term of [3, 5]) it(`TRST ${currency} ${term}-year lookup`, () => {
      const result = calculateInsurance('TRST', { ...defaultInsuranceInputs('TRST'), currency, term })
      expect(result.totalContribution).toBeGreaterThan(0)
      expect(result.rows[10].balance).toBeGreaterThan(0)
      expect(result.rows[term].contribution).toBe(0)
    })
  }
  it('prepayment is a single initial payment, separate from regular five-year payments', () => {
    const p = { ...defaultInsuranceInputs('TRST'), prepaid: true, promotion: false }
    const result = calculateInsurance('TRST', p)
    expect(result.rows[0].contribution).toBeCloseTo((127380 * 5 - 127380 * .41247399) * 7.8514, 4)
    expect(result.rows.slice(1).every(r => r.contribution === 0)).toBe(true)
  })
  it('financing uses source loan factor and editable yearly rates', () => {
    const p = { ...defaultInsuranceInputs('PRMESP'), financingRate: 4, rates: { 2: 5 } }
    const result = calculateInsurance('PRMESP', p)
    expect(result.loan).toBeCloseTo(127400 * 7.8514 * .85 * .9, 5)
    expect(result.rows[1].interest).toBeCloseTo(result.loan * .04, 5)
    expect(result.rows[2].interest).toBeCloseTo(result.loan * .05, 5)
    expect(result.rows[2].cumulativeInterest).toBeCloseTo(result.loan * .09, 5)
    expect(result.maxWithdrawal).toBeNull()
  })
  it('rejects incompatible offers and financing rather than silently ignoring inputs', () => {
    expect(insuranceInputErrors('TRST', { ...defaultInsuranceInputs('TRST'), maturity: true, bigCase: true }).length).toBeGreaterThan(0)
    expect(insuranceInputErrors('PRMESP', { ...defaultInsuranceInputs('PRMESP'), repeats: 1, financingRate: 4 }).length).toBeGreaterThan(0)
  })
})

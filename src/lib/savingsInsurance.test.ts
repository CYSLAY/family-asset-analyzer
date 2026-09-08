import { describe, expect, it } from 'vitest'
import { insuranceSelection, savingsInsuranceYear } from './savingsInsurance'

describe('savings insurance reference illustrations', () => {
  it('preserves legacy plans as TRST with five payments', () => {
    expect(insuranceSelection({})).toEqual({ product: 'trst', paymentYears: 5, name: '信守明天' })
    expect(savingsInsuranceYear(500000, 3).balance).toBe(622290)
  })

  it('limits PRMESP to one payment even if a saved plan contains five', () => {
    expect(insuranceSelection({ savingsInsuranceProduct: 'prmesp', savingsInsurancePaymentYears: 5 }).paymentYears).toBe(1)
    expect(Array.from({ length: 6 }, (_, year) => savingsInsuranceYear(1000000, year, 'prmesp').premium))
      .toEqual([1000000, 0, 0, 0, 0, 0])
  })

  it('reproduces PRMESP worksheet balance and IRR using its actual contribution', () => {
    // PRMESP C65, G66, G69/H69, G75/H75, G115/H115.
    const premium = 950254.942
    expect(savingsInsuranceYear(premium, 1, 'prmesp').balance).toBeCloseTo(850228.106, 5)
    expect(savingsInsuranceYear(premium, 1, 'prmesp').irr).toBeNull()
    for (const [year, balance, irr] of [
      [4, 1018473.244152, 1.748349209567923],
      [10, 1660245.423928, 5.738517106057195],
      [50, 23312754.53234, 6.60929443026903],
    ]) {
      const result = savingsInsuranceYear(premium, year, 'prmesp')
      expect(result.balance).toBeCloseTo(balance, 5)
      expect(result.irr).toBeCloseTo(irr, 7)
    }
  })

  it('continues the underlying policy balance after the worksheet surrender cutoff', () => {
    expect(savingsInsuranceYear(950254.942, 54, 'prmesp').balance).toBeCloseTo(29991146.264716, 5)
    expect(savingsInsuranceYear(950254.942, 55, 'prmesp').balance).toBeCloseTo(31940569.27152, 5)
  })

  it('scales balances proportionally and leaves IRR unchanged', () => {
    const full = savingsInsuranceYear(1000000, 10, 'prmesp')
    const half = savingsInsuranceYear(500000, 10, 'prmesp')
    expect(half.balance).toBe(full.balance / 2)
    expect(half.irr).toBe(full.irr)
    expect(savingsInsuranceYear(0, 10, 'prmesp')).toEqual({ premium: 0, balance: 0, irr: null })
  })

  it('uses the TRST prepayment cash flow instead of treating it as five annual payments', () => {
    // TRST AD64 with F13=Y and F12=N: (127380*5-127380*.41247399)*7.8514.
    const premium = (127380 * 5 - 127380 * .41247399) * 7.8514
    const result = savingsInsuranceYear(premium, 10, 'trst', 1)
    expect(savingsInsuranceYear(premium, 0, 'trst', 1).premium).toBe(premium)
    expect(savingsInsuranceYear(premium, 1, 'trst', 1).premium).toBe(0)
    expect(result.balance).toBeCloseTo(6392671.62969072, 5)
    expect(result.irr).toBeCloseTo((Math.pow(6392671.62969072 / premium, .1) - 1) * 100, 7)
    expect(result.irr).not.toBe(savingsInsuranceYear(premium / 5, 10, 'trst', 5).irr)
  })
})

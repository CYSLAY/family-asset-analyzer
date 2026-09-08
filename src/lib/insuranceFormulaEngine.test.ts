import { describe, expect, it } from 'vitest'
import workbook from './insuranceWorkbook.json'
import { InsuranceFormulaEngine, periodicIrr } from './insuranceFormulaEngine'

describe('source workbook reconciliation', () => {
  for (const sheet of ['TRST', 'PRMESP'] as const) {
    it(`${sheet}: reproduces every cached visible numeric cell and summary`, () => {
      const engine = new InsuranceFormulaEngine(workbook.sheets)
      const errors: string[] = []
      for (const [address, expected] of Object.entries(workbook.baseline[sheet])) {
        try {
          const actual = engine.number(sheet, address)
          if (Math.abs(actual - expected) > Math.max(.02, Math.abs(expected) * 1e-8)) errors.push(`${address}: ${actual} != ${expected}`)
        } catch (error) { errors.push(String(error).slice(0, 600)) }
      }
      expect(errors.slice(0, 12)).toEqual([])
    })
  }
  it('fails closed on unsupported formulas', () => {
    expect(() => new InsuranceFormulaEngine({ X: { A1: '=WEBSERVICE("https://example.com")' } }).cell('X', 'A1')).toThrow('不支持')
  })
  it('calculates periodic IRR', () => {
    expect(periodicIrr([-100, 0, 121])).toBeCloseTo(.1, 10)
  })
})

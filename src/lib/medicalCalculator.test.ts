import { describe, expect, it } from 'vitest'
import { calculateMedical, combineMedical, MEDICAL_PRODUCTS } from './medicalCalculator'
import { InsuranceFormulaEngine } from './insuranceFormulaEngine'
import workbook from './medicalWorkbook.json'
const profile = { age: 41, gender: 'M', smoker: 'N', region: 'A' } as const
describe('medical workbook without discounts', () => {
  it('supports the sparse table formula functions', () => {
    const engine = new InsuranceFormulaEngine({ S: { A1: false, A2: true, A3: '=IFERROR(MATCH(TRUE,A1:A2,0),0)', A4: '=IFERROR(1/0,8)' } })
    expect(engine.number('S', 'A3')).toBe(2)
    expect(engine.number('S', 'A4')).toBe(8)
  })
  for (const product of Object.keys(MEDICAL_PRODUCTS) as (keyof typeof MEDICAL_PRODUCTS)[]) {
    it(`${product} calculates every payment term and full detail`, () => {
      for (const term of MEDICAL_PRODUCTS[product].terms) {
        const result = calculateMedical(profile, { product, term, amount: 100000, currency: 'USD' })
        if (result.kind !== 'critical') throw Error('Expected critical illness result')
        expect(result.annual).toBeGreaterThan(0)
        expect(result.total).toBeCloseTo(result.annual * term, 6)
        const detail = result.detail()
        expect(detail.length).toBe(59)
        expect(detail[term].premium).toBe(0)
        expect(detail[term - 1].cumulative).toBeCloseTo(result.total, 6)
        expect(detail.every(r => Number.isFinite(r.cash) && r.cash >= 0)).toBe(true)
      }
    })
  }
  it('does not grant sum assured discounts', () => {
    const a = calculateMedical(profile, { product: 'CIM3', amount: 99999, term: 10, currency: 'USD' })
    const b = calculateMedical(profile, { product: 'CIM3', amount: 100001, term: 10, currency: 'USD' })
    expect(a.annual / 99999).toBeCloseTo(b.annual / 100001, 12)
  })
  it('combines currencies and ends payments per policy', () => {
    const a = calculateMedical(profile, { product: 'CIM3', amount: 100000, term: 5, currency: 'RMB-U' })
    const b = calculateMedical(profile, { product: 'CIP2', amount: 100000, term: 10, currency: 'HKD-U' })
    const combined = combineMedical([a, b])
    expect(combined.years[5].premium).toBeCloseTo(b.annualRmb)
    expect(combined.years.at(-1)?.cumulative).toBeCloseTo(combined.total)
  })
  it('rejects missing and invalid data', () => {
    for (const amount of [0, -1, NaN, Infinity]) expect(() => calculateMedical(profile, { product: 'CIM3', amount, term: 5, currency: 'USD' })).toThrow()
    expect(() => calculateMedical({ ...profile, age: 74 }, { product: 'CIM3', amount: 100000, term: 5, currency: 'USD' })).toThrow()
  })
  it('matches independently indexed undiscounted rate tables across demographics', () => {
    const colName = (n: number) => { let s = ''; while(n) { n--; s = String.fromCharCode(65 + n % 26) + s; n = Math.floor(n / 26) } return s }
    for (const product of Object.keys(MEDICAL_PRODUCTS) as (keyof typeof MEDICAL_PRODUCTS)[]) for (const age of [1, 21, 41]) for (const gender of ['M', 'F'] as const) for (const smoker of ['N', 'S'] as const) for (const region of ['A', 'B'] as const) {
      for (const [offset, term] of MEDICAL_PRODUCTS[product].terms.entries()) {
        const p = { age, gender, smoker, region }
        const col = 2 + offset + (gender === 'F' ? product === 'CIM3' ? 5 : product === 'CIE3' ? 4 : 20 : 0) + (smoker === 'S' ? product === 'CIE3' ? 8 : 10 : 0) + (region === 'B' && product !== 'CIE3' ? 40 : 0)
        const table = workbook.sheets[product === 'CIM3' ? 'dataCIM' : product === 'CIE3' ? 'dataCIE' : 'dataCIP'] as Record<string, number | string>
        const rate = table[`${colName(col)}${age + 3}`]
        const base = { product, amount: 100000, term, currency: 'USD' as const }
        if (typeof rate !== 'number' || !rate) expect(() => calculateMedical(p, base)).toThrow()
        else {
          expect(calculateMedical(p, base).annual).toBeCloseTo(rate * 100, 6)
          expect(calculateMedical(p, { ...base, currency: 'HKD' }).annual).toBeCloseTo(rate * 100, 6)
        }
      }
    }
  })
  it('matches native Excel recalculation of undiscounted representative benefits', () => {
    const expected = { CIM3: [4279, 5113.369619655092, 5785, 33222.1438696, 47087.4, 66134, 501669],
      CIE3: [4258, 5088.345424292846, 5423, 33059.16463038, 43576.6, 61203, 490889],
      CIP2: [2760, 3008.450457038392, 3279, 19540.8, 19486.7, 27369, 206299] }
    for (const product of Object.keys(expected) as (keyof typeof expected)[]) {
      const result = calculateMedical(profile, { product, amount: 100000, term: 20, currency: 'USD' })
      if (result.kind !== 'critical') throw Error('Expected critical illness result')
      const rows = result.detail()
      const actual = [result.annual, rows[9].guaranteedCash, rows[9].bonusCash, rows[19].guaranteedCash, rows[19].bonusCash, rows[19].bonusBenefit, rows[49].bonusCash]
      actual.forEach((n, i) => expect(n).toBeCloseTo(expected[product][i], 4))
    }
  })
  it('matches native Excel at an interpolated age, female smoker, region B', () => {
    const expected = { CIM3: [4867, 5372.107502350361, 5150.8, 34902.88324663, 38743.56, 62336.2, 421621.46],
      CIE3: [4351, 5214.65998757764, 4928.2, 33879.80468323, 38177.8, 61491.4, 413858.04],
      CIP2: [3138, 3287.649223529412, 2898.2, 21354.48150588, 16471, 26481.2, 167402.56] }
    for (const product of Object.keys(expected) as (keyof typeof expected)[]) {
      const result = calculateMedical({ age: 33, gender: 'F', smoker: 'S', region: 'B' }, { product, amount: 100000, term: 20, currency: 'USD' })
      if (result.kind !== 'critical') throw Error('Expected critical illness result')
      const rows = result.detail()
      const actual = [result.annual, rows[9].guaranteedCash, rows[9].bonusCash, rows[19].guaranteedCash, rows[19].bonusCash, rows[19].bonusBenefit, rows[49].bonusCash]
      actual.forEach((n, i) => expect(n).toBeCloseTo(expected[product][i], 4))
    }
  })
})

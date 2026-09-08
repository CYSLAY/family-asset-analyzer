import { expect, it } from 'vitest'
import { calculateHospital } from './hospitalCalculator'
import { calculateMedical, combineMedical, MEDICAL_FX } from './medicalCalculator'
import rates from './hospitalRates.json'
const options = { plan: 'asia', excess: 0, years: 10 }
it('imports every PDF rate and independently reconciles against the workbook', () => {
  expect(Object.keys(rates.vip)).toHaveLength(1936)
  expect(Object.keys(rates.mcvip)).toHaveLength(800)
  expect(rates.audit).toEqual({ excelCompared: 2736, mismatches: [] })
})
it('matches all eight VIP screenshot premiums to cents', () => {
  const expected = [[18764.06, 7154.98, 5799.83, 4359.88], [20639.76, 7869.46, 6378.48, 4795.64]]
  for (const [i, plan] of ['asia', 'world'].entries()) for (let excess = 0; excess < 4; excess++) {
    expect(calculateHospital(41, 'VIP', 'HKD-U', { ...options, plan, excess }, MEDICAL_FX).annual).toBe(expected[i][excess])
  }
})
it('matches all seven MCVIP screenshot premiums and adds outpatient exactly once', () => {
  for (const [plan, excess, expected] of [['1', 1, 7943.26], ['2', 0, 21903.84], ['2', 1, 8626.33], ['3', 0, 24958.03], ['3', 1, 9694.12], ['4', 0, 47703.54], ['4', 1, 22480.13]] as const) {
    const base = calculateHospital(41, 'MCVIP', 'HKD-U', { ...options, plan, excess }, MEDICAL_FX)
    const withOut = calculateHospital(41, 'MCVIP', 'HKD-U', { ...options, plan, excess, outpatient: true }, MEDICAL_FX)
    expect(base.annual).toBe(expected)
    expect(withOut.detail()[0].outpatientPremium).toBe(13812.97)
    expect(Math.abs(withOut.annual - base.annual - 13812.97)).toBeLessThanOrEqual(.011)
  }
  expect(calculateHospital(41, 'MCVIP', 'HKD-U', { ...options, plan: '2', outpatient: true }, MEDICAL_FX).annual).toBe(35716.8)
})
it('keeps policy currency separate from display FX', () => {
  expect(calculateHospital(41, 'VIP', 'USD', options, MEDICAL_FX).annual).toBe(2389.9)
  expect(calculateHospital(41, 'VIP', 'HKD', options, MEDICAL_FX).annual).toBe(19119.2)
  expect(calculateHospital(41, 'MCVIP', 'USD', { ...options, plan: '2' }, MEDICAL_FX).annual).toBe(2789.8)
  expect(calculateHospital(41, 'MCVIP', 'HKD', { ...options, plan: '2' }, MEDICAL_FX).annual).toBe(22318.4)
  expect(calculateHospital(41, 'VIP', 'USD', options, { ...MEDICAL_FX, hkdPerUsd: 8.5 }).annual).toBe(2389.9)
})
it('uses changing age rates and sums the actual yearly premiums in mixed combinations', () => {
  const hospital = calculateHospital(41, 'VIP', 'USD', options, MEDICAL_FX)
  expect(hospital.detail()[1].premium).toBe(2536.5)
  expect(hospital.total).not.toBe(hospital.annual * 10)
  const critical = calculateMedical({ age: 41, gender: 'M', smoker: 'N', region: 'A' }, { product: 'CIM3', amount: 100000, term: 5, currency: 'USD' })
  const combined = combineMedical([hospital, critical])
  expect(combined.years[5].premium).toBeCloseTo(hospital.premiumsRmb[5])
  expect(combined.years.at(-1)?.cumulative).toBeCloseTo(combined.total)
})
it('rejects invalid plans, missing years, and entry ages but permits verified renewal ages', () => {
  expect(() => calculateHospital(41, 'MCVIP', 'USD', { ...options, plan: '1' }, MEDICAL_FX)).toThrow()
  for (const years of [0, -1, NaN, 1.5, 82]) expect(() => calculateHospital(41, 'VIP', 'USD', { ...options, years }, MEDICAL_FX)).toThrow()
  expect(() => calculateHospital(82, 'VIP', 'USD', options, MEDICAL_FX)).toThrow()
  expect(() => calculateHospital(71, 'MCVIP', 'USD', { ...options, plan: '2' }, MEDICAL_FX)).toThrow()
  expect(calculateHospital(81, 'VIP', 'USD', { ...options, years: 41 }, MEDICAL_FX).detail().at(-1)?.age).toBe(121)
  expect(calculateHospital(70, 'MCVIP', 'USD', { ...options, plan: '2', years: 31 }, MEDICAL_FX).detail().at(-1)?.age).toBe(100)
  expect(() => calculateHospital(70, 'MCVIP', 'USD', { ...options, plan: '2', years: 32 }, MEDICAL_FX)).toThrow()
})

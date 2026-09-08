import rates from './hospitalRates.json'
import type { MedicalCurrency, MedicalFx } from './medicalCalculator'

export const HOSPITAL_PRODUCTS = {
  VIP: { name: '保诚自愿医保尚宾计划', maxEntry: 81, maxAge: 121 },
  MCVIP: { name: '高端医疗自由行计划', maxEntry: 70, maxAge: 100 },
} as const
export const HOSPITAL_SOURCES = rates.sources
export type HospitalProduct = keyof typeof HOSPITAL_PRODUCTS
export interface HospitalOptions { plan?: string; excess?: number; outpatient?: boolean; years?: number }
const cents = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

export function calculateHospital(age: number, product: HospitalProduct, currency: MedicalCurrency, options: HospitalOptions, fx: MedicalFx) {
  const meta = HOSPITAL_PRODUCTS[product]
  if (!Number.isInteger(age) || age < 1 || age > meta.maxEntry) throw Error(`${product} 首次投保翌年岁须为 1–${meta.maxEntry} 岁`)
  if (!['USD', 'HKD', 'HKD-U', 'RMB-U'].includes(currency)) throw Error('请选择币种')
  if (![fx.hkdPerUsd, fx.rmbPerUsd].every(n => Number.isFinite(n) && n > 0 && n < 1000)) throw Error('请填写有效折算汇率')
  const { plan, excess, outpatient = false, years } = options
  if (!Number.isInteger(years) || years! < 1 || years! > meta.maxAge - age + 1) throw Error(`测算年数须为 1–${meta.maxAge - age + 1} 年；超出原保费表范围不作推算`)
  if (product === 'VIP' && (!['asia', 'world'].includes(plan!) || ![0, 1, 2, 3].includes(excess!) || outpatient)) throw Error('请选择有效的 VIP 保障地区及自付额')
  if (product === 'MCVIP' && (!['1', '2', '3', '4'].includes(plan!) || ![0, 1].includes(excess!) || plan === '1' && excess === 0)) throw Error('请选择有效的 MCVIP 计划及自付额；计划 1 不支持零自付额')
  // The MCVIP PDF explicitly defines USD 1 = HKD 8 for the rate table.
  // Display FX is separate: it must not change the underlying policy premium.
  const factor = currency === 'HKD-U' ? fx.hkdPerUsd : currency === 'RMB-U' ? fx.rmbPerUsd : 1
  const toRmb = currency === 'RMB-U' ? 1 : currency === 'HKD' || currency === 'HKD-U' ? fx.rmbPerUsd / fx.hkdPerUsd : fx.rmbPerUsd
  let cumulative = 0
  const detail = Array.from({ length: years! }, (_, i) => {
    const anb = age + i
    const base = product === 'VIP'
      ? (rates.vip as Record<string, number>)[`${currency === 'HKD' ? 'HKD' : 'USD'}-${plan}-${excess}-${anb}`]
      : (rates.mcvip as Record<string, number>)[`${plan}-${excess}-${anb}`] / (currency === 'HKD' ? 1 : 8)
    const extra = product === 'MCVIP' && outpatient ? (rates.mcvip as Record<string, number>)[`outpatient-${anb}`] / (currency === 'HKD' ? 1 : 8) : 0
    if (!Number.isFinite(base) || base <= 0 || !Number.isFinite(extra)) throw Error(`${anb} 岁无有效费率，暂不能计算`)
    const basePremium = cents(base * factor), outpatientPremium = cents(extra * factor)
    // Convert the combined policy premium once, then round to cents. Rounding
    // each displayed component before adding would differ from the PDF/Excel.
    const premium = cents((base + extra) * factor)
    cumulative = cents(cumulative + premium)
    return { year: i + 1, age: anb, basePremium, outpatientPremium, premium, cumulative }
  })
  return { kind: 'hospital' as const, annual: detail[0].premium, total: cumulative, term: years!, annualRmb: detail[0].premium * toRmb, totalRmb: cumulative * toRmb,
    premiumsRmb: detail.map(r => r.premium * toRmb), detail: () => detail }
}

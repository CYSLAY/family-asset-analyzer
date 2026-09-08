import workbook from './medicalWorkbook.json'
import { InsuranceFormulaEngine, type SheetCells } from './insuranceFormulaEngine'
import { calculateHospital, type HospitalOptions, type HospitalProduct } from './hospitalCalculator'

export const MEDICAL_PRODUCTS = {
  CIM3: { name: '诚保一生危疾保', sheet: 'CIM3 BCIM3', terms: [5, 10, 15, 20, 25], discount: 'C20', premium: 'C25', first: 51, language: 'B154' },
  CIE3: { name: '危疾加护保 III', sheet: 'CIE3', terms: [10, 15, 20, 25], discount: 'C17', premium: 'C21', first: 47, language: 'B150' },
  CIP2: { name: '危疾首护保 II', sheet: 'CIP2', terms: [10, 15, 20, 25, 30], discount: 'C19', premium: 'C24', first: 50, language: 'B153' },
} as const
export type MedicalProduct = keyof typeof MEDICAL_PRODUCTS | HospitalProduct
export type MedicalCurrency = 'USD' | 'HKD' | 'HKD-U' | 'RMB-U'
export interface MedicalProfile { age: number; gender: 'M' | 'F'; smoker: 'N' | 'S'; region: 'A' | 'B' }
export interface MedicalPolicy extends HospitalOptions { product: MedicalProduct; amount: number; term: number; currency: MedicalCurrency }
export const MEDICAL_FX = { hkdPerUsd: workbook.sheets.Notes.B12, rmbPerUsd: workbook.sheets.Notes.B13 }
export type MedicalFx = typeof MEDICAL_FX
export const displayCurrency = (currency: MedicalCurrency) => currency === 'RMB-U' ? 'RMB' : currency.startsWith('HKD') ? 'HKD' : 'USD'
export const insuredCurrency = (currency: MedicalCurrency) => currency === 'HKD' ? 'HKD' : 'USD'
export interface MedicalYear { year: number; age: number; premium: number; cumulative: number; guaranteedCash: number; bonusCash: number; cash: number; guaranteedBenefit: number; bonusBenefit: number; benefit: number }

export function calculateMedical(profile: MedicalProfile, policy: MedicalPolicy, fx: MedicalFx = MEDICAL_FX) {
  if (policy.product === 'VIP' || policy.product === 'MCVIP') return calculateHospital(profile.age, policy.product, policy.currency, policy, fx)
  const product = MEDICAL_PRODUCTS[policy.product]
  if (!product) throw Error('请选择保险产品')
  if (!Number.isInteger(profile.age) || profile.age < 1 || profile.age > 75) throw Error('投保翌年岁须为 1–75 岁')
  if (!['M', 'F'].includes(profile.gender) || !['N', 'S'].includes(profile.smoker) || !['A', 'B'].includes(profile.region)) throw Error('请完善客户基础信息')
  if (!(product.terms as readonly number[]).includes(policy.term)) throw Error('请选择该产品支持的供款期')
  if (policy.product === 'CIM3' && profile.age + policy.term > 75) throw Error('此产品的投保翌年岁加供款期不能超过 75 年')
  if (!['USD', 'HKD', 'HKD-U', 'RMB-U'].includes(policy.currency)) throw Error('请选择币种')
  if (!Number.isFinite(policy.amount) || policy.amount <= 0 || policy.amount > 1e9) throw Error('请填写有效保额')
  if (insuredCurrency(policy.currency) === 'USD' && policy.amount < 15000) throw Error('美元保单保额不得低于 15,000 美元')
  if (![fx.hkdPerUsd, fx.rmbPerUsd].every(n => Number.isFinite(n) && n > 0 && n < 1000)) throw Error('请填写有效折算汇率')
  const overrides: SheetCells = { C3: profile.age, C4: profile.gender, C5: profile.smoker, C6: profile.region,
    F3: policy.amount, F4: policy.term, F5: policy.currency, F6: 'N', I3: 'N', I4: 'N', I5: 'N', L5: 'N',
    [product.discount]: 0, [product.language]: 'chi' }
  for (let r = product.first - 1; r <= product.first + 99; r++) overrides[`N${r}`] = 0
  const engine = new InsuranceFormulaEngine(workbook.sheets as Record<string, SheetCells>, {
    [product.sheet]: overrides, Notes: { B12: fx.hkdPerUsd, B13: fx.rmbPerUsd },
  })
  const factor = policy.currency === 'HKD-U' ? fx.hkdPerUsd : policy.currency === 'RMB-U' ? fx.rmbPerUsd : 1
  const annual = engine.number(product.sheet, product.premium) * factor
  if (!(annual > 0) || !Number.isFinite(annual)) throw Error('原表没有此年龄与供款期的有效费率，请调整选择')
  const years = Array.from({ length: policy.term }, (_, i) => engine.number(product.sheet, `C${product.first + i}`))
  if (years.some(n => !Number.isFinite(n) || Math.abs(n - annual) > .001)) throw Error('年度保费与费率核对不一致，暂不能计算')
  const total = years.reduce((sum, n) => sum + n, 0)
  const toRmb = displayCurrency(policy.currency) === 'RMB' ? 1 : displayCurrency(policy.currency) === 'HKD' ? fx.rmbPerUsd / fx.hkdPerUsd : fx.rmbPerUsd
  return { kind: 'critical' as const, annual, total, annualRmb: annual * toRmb, totalRmb: total * toRmb, term: policy.term, premiumsRmb: years.map(n => n * toRmb),
    detail(): MedicalYear[] {
      let cumulative = 0
      return Array.from({ length: Math.min(100, 100 - profile.age) }, (_, i) => {
        const r = product.first + i
        const n = (column: string) => engine.number(product.sheet, `${column}${r}`)
        const premium = n('C'); cumulative += premium
        return { year: i + 1, age: n('B'), premium, cumulative, guaranteedCash: n('D'), bonusCash: n('E'), cash: n('F'), guaranteedBenefit: n('H'), bonusBenefit: n('I'), benefit: n('J') }
      })
    },
  }
}

export function combineMedical(results: ReturnType<typeof calculateMedical>[]) {
  if (!results.length) throw Error('请先新增保险')
  const annual = results.reduce((s, r) => s + r.annualRmb, 0)
  const total = results.reduce((s, r) => s + r.totalRmb, 0)
  let cumulative = 0
  const years = Array.from({ length: Math.max(...results.map(r => r.term)) }, (_, i) => {
    const premium = results.reduce((s, r) => s + (r.premiumsRmb[i] ?? 0), 0)
    cumulative += premium
    return { year: i + 1, premium, cumulative }
  })
  return { annual, total, years }
}

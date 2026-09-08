import workbook from './insuranceWorkbook.json'
import { InsuranceFormulaEngine, type SheetCells } from './insuranceFormulaEngine'

export type InsuranceProduct = 'TRST' | 'PRMESP'
export interface InsuranceInputs {
  age: number; surrenderAge: number; amount: number; term: number; repeats: number; growth: number
  currency: string; fulfillment: number; withdrawalAge: number; withdrawal: number; inflation: number; withdrawalYears: number
  promotion: boolean; prepaid: boolean; maturity: boolean; eb: boolean; egs: boolean; bigCase: boolean; amd: boolean
  financingRatio: number; financingRate: number; hkdRate: number; rmbRate: number
  extras: Record<number, number>; rates: Record<number, number>
}
export const INSURANCE_NAMES = { TRST: '信守明天', PRMESP: '世誉财富' }
export const CURRENCIES: Record<string, string> = {
  USD: '美元', 'HKD-U': '美元保单 · 港币显示', 'RMB-U': '美元保单 · 人民币显示',
  HKD: '港币', RMB: '人民币', AUD: '澳元', CAD: '加元', GBP: '英镑',
}
export function defaultInsuranceInputs(product: InsuranceProduct): InsuranceInputs {
  return { age: 41, surrenderAge: 91, amount: 1000000, term: product === 'TRST' ? 5 : 1, repeats: 0, growth: 0,
    currency: 'HKD-U', fulfillment: 100, withdrawalAge: 66, withdrawal: 0, inflation: 0, withdrawalYears: 0,
    promotion: true, prepaid: false, maturity: false, eb: false, egs: false, bigCase: false, amd: false,
    financingRatio: 90, financingRate: 0, hkdRate: 7.8514, rmbRate: 6.78, extras: {}, rates: {} }
}
// Read the exchange assumption directly from the supplied source, not a live FX quote.
export const WORKBOOK_FX = { hkd: workbook.sheets.Notes.B12, rmb: workbook.sheets.Notes.B13 }
export function insuranceInputErrors(product: InsuranceProduct, p: InsuranceInputs): string[] {
  const errors: string[] = []
  const numeric = Object.values(p).filter(v => typeof v === 'number')
  if (numeric.some(v => !Number.isFinite(v))) return ['请填写有效数字。']
  if (!Number.isInteger(p.age) || p.age < 1 || p.age > (product === 'PRMESP' ? 75 : 100)) errors.push(`投保翌年岁须为 1–${product === 'PRMESP' ? 75 : 100} 岁。`)
  if (!Number.isInteger(p.surrenderAge) || p.surrenderAge <= p.age || p.surrenderAge > Math.min(p.age + 98, 201)) errors.push('退保翌年岁须晚于投保翌年岁，且在 98 个年度的测算范围内。')
  if (p.amount <= 0 || p.amount > 1e11) errors.push('请填写大于 0 的储蓄金额，最高支持 1,000 亿元。')
  if (!(product === 'TRST' ? [3, 5] : [1]).includes(p.term)) errors.push('该产品不支持此缴费年限。')
  if (!Number.isInteger(p.repeats) || p.repeats < 0 || p.repeats > 5) errors.push('重复储蓄计划可选择 0–5 次。')
  if (p.age + p.term * (p.repeats + 1) - 1 >= p.surrenderAge) errors.push('退保时间须晚于全部缴费年度。')
  if (!Object.keys(CURRENCIES).includes(p.currency) || product === 'PRMESP' && !['USD', 'HKD-U', 'RMB-U'].includes(p.currency)) errors.push('该产品不支持此币种。')
  if (p.prepaid && (product !== 'TRST' || p.term !== 5 || !['USD', 'HKD-U', 'RMB-U'].includes(p.currency))) errors.push('一笔过预缴仅适用于美元保单的 5 年缴费方案。')
  if (p.fulfillment < 0 || p.fulfillment > 200) errors.push('现金价值实现率须在 0%–200% 之间。')
  if (p.growth <= -100 || p.growth > 100 || p.inflation <= -100 || p.inflation > 100) errors.push('增长率和通胀率须大于 -100%，且不超过 100%。')
  if (p.withdrawal > 0 && (!Number.isInteger(p.withdrawalAge) || p.withdrawalAge < p.age || p.withdrawalAge > p.age + 98)) errors.push('提款开始翌年岁须在测算范围内。')
  if (p.withdrawal < 0 || p.withdrawalYears < 0 || !Number.isInteger(p.withdrawalYears)) errors.push('提款金额不得为负数，提取年期须为非负整数。')
  if (p.withdrawal > 0 && (p.withdrawalAge > p.surrenderAge || p.withdrawalYears > 0 && p.withdrawalAge + p.withdrawalYears - 1 > p.surrenderAge)) errors.push('提款期间不得超过退保年度。')
  if (p.maturity && p.bigCase && product === 'TRST') errors.push('期满优惠与大额保单优惠不可同时选择。')
  if (product === 'PRMESP' && p.financingRate > 0 && p.repeats > 0) errors.push('保费融资不能与重复储蓄计划同时启用。')
  if (p.financingRatio < 0 || p.financingRatio > 100 || p.financingRate < 0 || p.financingRate > 100) errors.push('融资比率与年利率须在 0%–100% 之间。')
  if (p.hkdRate <= 0 || p.rmbRate <= 0) errors.push('汇率须大于 0。')
  if (Object.values(p.extras).some(v => !Number.isFinite(v) || v < 0) || Object.values(p.rates).some(v => !Number.isFinite(v) || v < 0 || v > 100)) errors.push('请检查逐年提款金额和指定利率。')
  return errors
}
export function insuranceOverrides(product: InsuranceProduct, p: InsuranceInputs): Record<string, SheetCells> {
  const yn = (v: boolean) => v ? 'Y' : 'N'
  const cells: SheetCells = {
    C5: p.age, F5: p.surrenderAge, C7: p.amount, F7: p.withdrawalAge, F8: p.withdrawal,
    F9: p.inflation / 100, F10: p.withdrawalYears, F12: yn(p.promotion),
  }
  if (product === 'TRST') Object.assign(cells, {
    C8: p.term, C9: p.repeats, C10: p.growth / 100, C12: p.currency, C13: p.fulfillment / 100,
    C14: 'Y', F13: yn(p.prepaid), F14: yn(p.egs), H12: yn(p.maturity), H13: yn(p.eb), H14: yn(p.bigCase),
  })
  else Object.assign(cells, {
    C8: p.repeats, C9: p.growth / 100, C10: p.currency, C11: p.fulfillment / 100,
    C13: p.financingRatio / 100, C14: p.financingRate / 100, F14: 'Y', H12: yn(p.amd), C26: 1,
  })
  const start = product === 'TRST' ? 64 : 65
  for (const [year, amount] of Object.entries(p.extras)) if (+year >= (product === 'TRST' ? 0 : 1) && +year <= 98) cells[`D${start + +year}`] = amount
  if (product === 'PRMESP') for (const [year, rate] of Object.entries(p.rates)) if (+year > 0 && +year <= 98) cells[`K${start + +year}`] = rate / 100
  return { [product]: cells, Notes: { B12: p.hkdRate, B13: p.rmbRate } }
}
export interface InsuranceRow {
  year: number; age: number; contribution: number; extra: number; withdrawal: number; cumulative: number
  balance: number; guaranteed: number; nonGuaranteed: number; irr: number; yoy: number
  rate: number; interest: number; cumulativeInterest: number; loan: number
}
export function calculateInsurance(product: InsuranceProduct, p: InsuranceInputs) {
  const errors = insuranceInputErrors(product, p)
  if (errors.length) throw Error(errors.join(' '))
  const e = new InsuranceFormulaEngine(workbook.sheets, insuranceOverrides(product, p))
  const n = (a: string) => e.number(product, a)
  const first = product === 'TRST' ? 64 : 65
  const rows: InsuranceRow[] = Array.from({ length: p.surrenderAge - p.age + 1 }, (_, year) => {
    const r = first + year
    return { year, age: n(`B${r}`), contribution: n(`C${r}`), extra: n(`D${r}`), withdrawal: n(`E${r}`),
      cumulative: n(`F${r}`), balance: n(`G${r}`), guaranteed: n(`I${r}`), nonGuaranteed: n(`J${r}`),
      irr: n(`${product === 'TRST' ? 'P' : 'O'}${r}`), yoy: n(`${product === 'TRST' ? 'O' : 'N'}${r}`),
      rate: product === 'PRMESP' ? n(`K${r}`) : 0,
      interest: product === 'PRMESP' ? n(`U${r}`) : 0,
      cumulativeInterest: product === 'PRMESP' ? n(`L${r}`) : 0,
      loan: product === 'PRMESP' ? n(`S${r}`) : 0 }
  })
  let maxWithdrawal: number | null = null
  if (p.withdrawalAge < p.surrenderAge && !(product === 'PRMESP' && p.financingRate > 0) && (p.withdrawalYears === 0 || p.withdrawalAge + p.withdrawalYears - 1 <= p.surrenderAge)) {
    maxWithdrawal = n(product === 'TRST' ? 'C59' : 'C60')
  }
  return { rows, totalContribution: n('C16'), totalWithdrawal: n('C17'), irr: n(product === 'TRST' ? 'C18' : 'F18'),
    rebate: n('F16'), notional: n('F17'), maxWithdrawal,
    loan: product === 'PRMESP' && p.financingRate > 0 ? n('C22') : 0,
    loanRepaymentAge: product === 'PRMESP' && p.financingRate > 0 ? n('C24') : null,
    lowNotional: String(e.cell(product, 'D7')),
    currency: p.currency.startsWith('RMB') ? '人民币' : p.currency.startsWith('HKD') ? '港币' : CURRENCIES[p.currency],
  }
}

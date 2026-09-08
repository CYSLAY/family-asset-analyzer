import { defaultInsuranceInputs, insuranceInputErrors, type InsuranceInputs, type InsuranceProduct } from './insuranceCalculator'

export interface SavedInsurancePlan {
  version: 1
  model: 'workbook-2026-08-03-v1'
  id: string
  name: string
  createdAt: string
  product: InsuranceProduct
  inputs: InsuranceInputs
}
const prefix = (advisor: string) => `jojo-insurance-plan-v1:${encodeURIComponent(advisor.trim().toLowerCase())}:`

export function parseInsurancePlan(raw: string): SavedInsurancePlan {
  const data = JSON.parse(raw) as SavedInsurancePlan
  if (!data || data.version !== 1 || data.model !== 'workbook-2026-08-03-v1' || !['TRST', 'PRMESP'].includes(data.product) || typeof data.id !== 'string' || !data.id || typeof data.name !== 'string' || !data.name.trim() || data.name.length > 80 || !Number.isFinite(Date.parse(data.createdAt)) || !data.inputs) throw Error('方案格式或版本不受支持。')
  const defaults = defaultInsuranceInputs(data.product)
  for (const key of Object.keys(defaults) as (keyof InsuranceInputs)[]) {
    const value = data.inputs[key]
    if (key === 'extras' || key === 'rates') {
      if (!value || typeof value !== 'object' || Array.isArray(value) || Object.entries(value).some(([year, amount]) => !/^\d+$/.test(year) || +year > 98 || typeof amount !== 'number' || !Number.isFinite(amount))) throw Error('逐年参数格式异常。')
    } else if (typeof value !== typeof defaults[key]) throw Error('方案参数不完整。')
  }
  if (insuranceInputErrors(data.product, data.inputs).length) throw Error('方案参数未通过校验。')
  return data
}

export function listInsurancePlans(advisor: string): { plans: SavedInsurancePlan[]; unreadable: number } {
  const plans: SavedInsurancePlan[] = []
  let unreadable = 0
  const start = prefix(advisor)
  for (let index = 0; index < localStorage.length; index++) {
    const key = localStorage.key(index)
    if (!key?.startsWith(start)) continue
    try {
      const plan = parseInsurancePlan(localStorage.getItem(key) ?? '')
      if (key !== start + plan.id) throw Error('方案标识不匹配。')
      plans.push(plan)
    } catch { unreadable++ }
  }
  return { plans: plans.sort((a, b) => b.createdAt.localeCompare(a.createdAt)), unreadable }
}

export function saveInsurancePlan(advisor: string, name: string, product: InsuranceProduct, inputs: InsuranceInputs): SavedInsurancePlan {
  const plan = parseInsurancePlan(JSON.stringify({ version: 1, model: 'workbook-2026-08-03-v1', id: crypto.randomUUID(), name: name.trim(), createdAt: new Date().toISOString(), product, inputs }))
  // Independent snapshot keys prevent another tab's saved plan from being overwritten.
  localStorage.setItem(prefix(advisor) + plan.id, JSON.stringify(plan))
  return plan
}
export function deleteInsurancePlan(advisor: string, id: string) {
  localStorage.removeItem(prefix(advisor) + id)
}
export function exportInsurancePlan(plan: SavedInsurancePlan) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(plan, null, 2)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `insurance-plan-${plan.product}-${plan.createdAt.slice(0, 10)}.json`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

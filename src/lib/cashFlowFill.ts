import type { CashFlowPlan } from '../types/domain'
import { fillYearlyAmountsRange } from './cashFlowPlan'

export interface CashFlowFillUndo {
  customerId: string
  baseYear: number
  kind: 'incomes' | 'expenses'
  itemId: string
  value: number
  previous: Record<string, number | undefined>
}

export function applyCashFlowFill(plan: CashFlowPlan, customerId: string, kind: CashFlowFillUndo['kind'], itemId: string, sourceYear: number, targetYear: number, value: number) {
  const item = plan[kind].find(entry => entry.id === itemId)
  if (!item || !Number.isFinite(value) || value < 0 || !Number.isInteger(sourceYear) || !Number.isInteger(targetYear) || sourceYear < plan.baseYear || targetYear <= sourceYear || targetYear >= plan.baseYear + plan.projectionYears) return null
  const previous: CashFlowFillUndo['previous'] = {}
  for (let year = sourceYear + 1; year <= targetYear; year++) previous[year] = item.yearlyAmounts?.[year]
  return {
    plan: { ...plan, [kind]: plan[kind].map(entry => entry.id === itemId ? { ...entry, yearlyAmounts: fillYearlyAmountsRange(entry.yearlyAmounts, sourceYear, targetYear, value) } : entry) },
    undo: { customerId, baseYear: plan.baseYear, kind, itemId, value, previous },
  }
}

// Restore only affected overrides; removing an absent override restores its formula.
export function undoCashFlowFill(plan: CashFlowPlan, customerId: string, undo: CashFlowFillUndo) {
  if (customerId !== undo.customerId || plan.baseYear !== undo.baseYear) return plan
  return { ...plan, [undo.kind]: plan[undo.kind].map(item => {
    if (item.id !== undo.itemId) return item
    const yearlyAmounts = { ...item.yearlyAmounts }
    for (const [year, previous] of Object.entries(undo.previous)) {
      if (yearlyAmounts[year] !== undo.value) continue
      if (previous === undefined) delete yearlyAmounts[year]
      else yearlyAmounts[year] = previous
    }
    return { ...item, yearlyAmounts }
  }) }
}

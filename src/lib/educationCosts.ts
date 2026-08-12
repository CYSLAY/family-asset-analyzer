import type { EducationGoal, EducationStagePlan } from '../types/domain'

export interface EducationCostEstimate {
  annualTuition: number
  annualLiving: number
  oneTimeFees: number
  annualTotal: number
  cashTotal: number
  basis: string
}

const domesticPublicAnnual: Record<string, number> = {
  '早教': 24000,
  '幼儿园': 15000,
  '小学': 146000,
  '初中': 147000,
  '高中': 150868,
  '本科': 50000,
  '研究生': 65000,
}

const domesticPrivateAnnual: Record<string, number> = {
  '早教': 36000,
  '幼儿园': 26240,
  '小学': 200000,
  '初中': 210000,
  '高中': 230000,
  '本科': 100000,
  '研究生': 120000,
}

const destinationAnnual: Record<string, number> = {
  '香港': 280000,
  '英国': 350000,
  '美国': 365000,
  '新加坡': 230000,
  '加拿大': 270000,
  '澳大利亚': 300000,
  '新西兰': 250000,
  '日本': 180000,
  '韩国': 160000,
  '德国': 150000,
  '法国': 170000,
  '瑞士': 350000,
  '爱尔兰': 270000,
  '荷兰': 250000,
  '其他国家或地区': 250000,
}

const stageFactor: Record<string, number> = {
  '早教': 0.55,
  '幼儿园': 0.7,
  '小学': 0.85,
  '初中': 0.95,
  '高中': 1,
  '本科': 1,
  '研究生': 1.05,
}

export function estimateEducationStage(plan: EducationStagePlan): EducationCostEstimate {
  const years = Math.max(0, plan.durationYears)
  if (!plan.route || years === 0) return emptyEstimate()

  if (plan.route === '公立' || plan.route === '私立') {
    const annualTotal = (plan.route === '公立' ? domesticPublicAnnual : domesticPrivateAnnual)[plan.stage] ?? (plan.route === '公立' ? 50000 : 150000)
    return {
      annualTuition: Math.round(annualTotal * 0.72),
      annualLiving: Math.round(annualTotal * 0.28),
      oneTimeFees: 0,
      annualTotal,
      cashTotal: annualTotal * years,
      basis: plan.route === '公立' ? '参考图现价标准与国内公立教育常见支出' : '参考图现价标准与国内私立教育市场中位估算',
    }
  }

  const destination = plan.destination || '其他国家或地区'
  if (destination === '美国' && plan.stage === '本科') return exactReferenceEstimate(years, 215431.16, 125363.05, 90765, '参考图美国本科入学费、学费及食宿费标准')
  if (destination === '美国' && plan.stage === '研究生') return exactReferenceEstimate(years, 196668.9, 125363.05, 90765, '参考图美国研究生入学费、学费及食宿费标准')

  const annualTotal = Math.round((destinationAnnual[destination] ?? destinationAnnual['其他国家或地区']) * (stageFactor[plan.stage] ?? 1))
  const livingRatio = plan.stage === '本科' || plan.stage === '研究生' ? 0.36 : 0.28
  return {
    annualTuition: Math.round(annualTotal * (1 - livingRatio)),
    annualLiving: Math.round(annualTotal * livingRatio),
    oneTimeFees: 0,
    annualTotal,
    cashTotal: annualTotal * years,
    basis: marketBasis(destination),
  }
}

export function estimateEducationGoalCash(goal: EducationGoal) {
  const selectedPlans = (goal.stagePlans ?? []).filter((plan) => Boolean(plan.route))
  const routeCashTotal = selectedPlans.reduce((sum, plan) => sum + estimateEducationStage(plan).cashTotal, 0)
  const selectedYears = selectedPlans.reduce((sum, plan) => sum + Math.max(0, plan.durationYears), 0)
  const extraTrainingTotal = Math.max(0, goal.extraTrainingCostAnnual ?? 0) * selectedYears
  return { routeCashTotal, extraTrainingTotal, cashTotal: routeCashTotal + extraTrainingTotal, selectedYears }
}

function exactReferenceEstimate(years: number, annualTuition: number, annualLiving: number, oneTimeFees: number, basis: string): EducationCostEstimate {
  const annualTotal = Math.round(annualTuition + annualLiving)
  return { annualTuition: Math.round(annualTuition), annualLiving: Math.round(annualLiving), oneTimeFees, annualTotal, cashTotal: Math.round(annualTuition * years + annualLiving * years + oneTimeFees), basis }
}

function marketBasis(destination: string) {
  if (destination === '香港') return '参考香港大学非本地生学费、住宿及生活费公开标准'
  if (destination === '英国') return '参考 British Council 国际生学费及生活费区间'
  if (destination === '美国') return '参考 College Board 2025-26 学费、住宿及膳食标准'
  return `参考${destination}国际教育的学费及生活费市场中位估算`
}

function emptyEstimate(): EducationCostEstimate {
  return { annualTuition: 0, annualLiving: 0, oneTimeFees: 0, annualTotal: 0, cashTotal: 0, basis: '' }
}

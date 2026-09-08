import type { CashFlowEntry, CustomerProfile } from '../types/domain'
import { isLiquidAsset } from '../types/domain'
import { estimateEducationGoalCash } from './educationCosts'

export type HealthLevel = 'critical' | 'warning' | 'attention' | 'healthy' | 'strong' | 'neutral'

export interface MetricResult {
  key: string
  label: string
  value: number | null
  unit: 'currency' | 'percent' | 'months' | 'ratio'
  level: HealthLevel
  title: string
  explanation: string
  action: string
  formula: string
  reference: string
  displayValue?: string
}

export interface FinancialAnalysis {
  totals: {
    assets: number
    liabilities: number
    netWorth: number
    annualIncome: number
    annualExpenses: number
    annualSurplus: number
    emergencyFunds: number
    liquidAssets: number
    fixedAssets: number
    dueWithinOneYear: number
    necessaryMonthlyOutflow: number
    workIncome: number
    insuranceExpenses: number
    educationFutureCost: number
    educationGap: number
  }
  metrics: MetricResult[]
  score: number | null
  overallLevel: HealthLevel
  priorityKeys: string[]
}

export function annualize(entry: CashFlowEntry) {
  return entry.amount * (entry.frequency === 'monthly' ? 12 : entry.frequency === 'quarterly' ? 4 : 1)
}

export function analyzeCustomer(customer: CustomerProfile): FinancialAnalysis {
  const assets = customer.assets.reduce((sum, item) => sum + item.currentValue, 0)
  const liabilities = customer.liabilities.reduce((sum, item) => sum + item.balance, 0)
  const fixedAssets = customer.assets.filter((item) => item.category === 'property' || item.category === 'vehicle').reduce((sum, item) => sum + item.currentValue, 0)
  const liquidAssets = customer.assets.filter(isLiquidAsset).reduce((sum, item) => sum + item.currentValue, 0)
  const emergencyFunds = customer.assets.filter((item) => item.availableForEmergency && isLiquidAsset(item)).reduce((sum, item) => sum + item.currentValue, 0)
  const annualIncome = customer.incomes.reduce((sum, item) => sum + annualize(item), 0)
  const annualExpenses = customer.expenses.reduce((sum, item) => sum + annualize(item), 0)
  const annualDebtPayments = customer.liabilities.reduce((sum, item) => sum + item.monthlyPayment * 12, 0)
  const necessaryMonthlyOutflow = annualExpenses / 12 + annualDebtPayments / 12
  const hasLiabilityData = customer.liabilities.some((item) => item.balance > 0 || item.monthlyPayment > 0 || item.dueWithinOneYear > 0)
  const dueWithinOneYear = customer.liabilities.reduce((sum, item) => sum + estimateOneYearDebt(item), 0)
  const workIncome = customer.incomes.filter((item) => /工作|工资|经营|佣金|奖金/.test(`${item.category}${item.name}`)).reduce((sum, item) => sum + annualize(item), 0)
  const insuranceExpenses = customer.expenses.filter((item) => /保险|保费/.test(`${item.category}${item.name}`)).reduce((sum, item) => sum + annualize(item), 0)
  const annualSurplus = annualIncome - annualExpenses - annualDebtPayments
  const emergencyTarget = getEmergencyTarget(customer)
  const educationFutureCost = customer.educationGoals.reduce((sum, goal) => {
    const routeCashTotal = estimateEducationGoalCash(goal).cashTotal
    if (routeCashTotal > 0) return sum + routeCashTotal
    const legacyManualCost = goal.annualCostToday * goal.durationYears
    return sum + legacyManualCost * Math.pow(1 + goal.inflationRate / 100, goal.yearsUntilStart)
  }, 0)
  const educationPrepared = customer.educationGoals.reduce((sum, goal) => sum + goal.preparedAmount, 0)

  const metrics = [
    netWorthMetric(assets - liabilities, customer.assets.length > 0 || customer.liabilities.length > 0),
    debtRatioMetric(assets, liabilities, hasLiabilityData || customer.noLiabilitiesConfirmed === true),
    fixedAssetMetric(assets, fixedAssets),
    liquidCoverageMetric(liquidAssets, dueWithinOneYear, hasLiabilityData, customer.noLiabilitiesConfirmed === true),
    debtServiceMetric(annualIncome, annualDebtPayments, liabilities, hasLiabilityData || customer.noLiabilitiesConfirmed === true),
    emergencyMetric(emergencyFunds, necessaryMonthlyOutflow, emergencyTarget),
    savingsMetric(annualIncome, annualSurplus),
    incomeConcentrationMetric(annualIncome, workIncome),
    insuranceExpenseRatioMetric(annualIncome, insuranceExpenses),
    educationMetric(educationFutureCost, educationPrepared, customer.educationGoals.length),
  ]

  const scored = metrics.filter((metric) => metric.value !== null && !metric.displayValue && metric.key !== 'income_concentration' && metric.key !== 'insurance_expense_ratio')
  const rawScore = scored.length ? Math.round(scored.reduce((sum, metric) => sum + levelScore(metric.level), 0) / scored.length) : null
  const hasCritical = metrics.some((metric) => metric.level === 'critical')
  const score = rawScore === null ? null : hasCritical ? Math.min(rawScore, 49) : rawScore
  const priorityKeys = metrics
    .filter((metric) => metric.level === 'critical' || metric.level === 'warning' || metric.level === 'attention')
    .sort((a, b) => levelRank(a.level) - levelRank(b.level))
    .slice(0, 3)
    .map((metric) => metric.key)

  return {
    totals: { assets, liabilities, netWorth: assets - liabilities, annualIncome, annualExpenses: annualExpenses + annualDebtPayments, annualSurplus, emergencyFunds, liquidAssets, fixedAssets, dueWithinOneYear, necessaryMonthlyOutflow, workIncome, insuranceExpenses, educationFutureCost, educationGap: Math.max(0, educationFutureCost - educationPrepared) },
    metrics,
    score,
    overallLevel: score === null ? 'neutral' : score < 40 ? 'critical' : score < 60 ? 'warning' : score < 75 ? 'attention' : score < 90 ? 'healthy' : 'strong',
    priorityKeys,
  }
}

function getEmergencyTarget(customer: CustomerProfile) {
  let target = 6
  const incomeProviders = customer.members.filter((item) => item.isPrimaryIncomeProvider).length
  if (incomeProviders <= 1) target += 2
  if (customer.members.some((item) => item.incomeStability === 'variable' || item.incomeStability === 'self_employed')) target += 2
  if (customer.members.some((item) => item.relation === '子女' || item.relation === '父母')) target += 1
  return Math.min(12, target)
}

function netWorthMetric(value: number, hasBalanceData: boolean): MetricResult {
  if (!hasBalanceData) return metric('net_worth', '净资产', null, 'currency', 'neutral', '等待资产负债数据', '尚未录入资产或负债，不能把空白资料判断为净资产等于零。', '补充任意一项资产或负债后自动计算。', '总资产 - 总负债', '大于 0 是基础，仍需结合现金流判断')
  if (value < 0) return metric('net_worth', '净资产', value, 'currency', 'critical', '净资产为负', '现有资产不足以覆盖全部负债，家庭抗风险空间有限。', '先停止新增非必要负债，并制定高息和短期债务的偿还顺序。', '总资产 - 总负债', '大于 0 是基础，仍需结合现金流判断')
  if (value === 0) return metric('net_worth', '净资产', value, 'currency', 'warning', '资产刚好覆盖负债', '当前没有净资产缓冲，任何资产价格下降都可能使净资产转负。', '优先建立现金结余并逐步降低负债余额。', '总资产 - 总负债', '大于 0 是基础，仍需结合现金流判断')
  return metric('net_worth', '净资产', value, 'currency', 'healthy', '净资产为正', '家庭资产能够覆盖当前负债。', '继续观察净资产是否随时间稳定增长。', '总资产 - 总负债', '不设置统一金额门槛，关注方向与增长')
}

function debtRatioMetric(assets: number, liabilities: number, known: boolean): MetricResult {
  if (!known) return metric('debt_ratio', '资产负债率', null, 'percent', 'neutral', '负债资料待确认', '尚未填写负债，也未确认无负债。', '请补充负债或确认无负债。', '总负债 / 总资产', '资料齐全后评估')
  if (assets <= 0) return metric('debt_ratio', '资产负债率', liabilities > 0 ? 100 : null, 'percent', liabilities > 0 ? 'critical' : 'neutral', liabilities > 0 ? '缺少资产覆盖' : '等待资产数据', liabilities > 0 ? '已录入负债但没有可覆盖的资产。' : '录入资产和负债后才能计算总体杠杆。', liabilities > 0 ? '核对资产是否漏填，并优先处理短期债务。' : '先完成资产与负债录入。', '总负债 / 总资产', '0%-30%较低，30%-50%关注，超过50%压力上升')
  const ratio = liabilities / assets * 100
  if (ratio <= 30) return metric('debt_ratio', '资产负债率', ratio, 'percent', 'healthy', '总体杠杆较低', '负债占资产比例较低，资产缓冲相对充分。', '继续控制新增债务，并检查月供压力。', '总负债 / 总资产', '0%-30%较低，30%-50%关注，超过50%压力上升')
  if (ratio <= 50) return metric('debt_ratio', '资产负债率', ratio, 'percent', 'attention', '总体杠杆需要关注', '负债已占据较明显的资产比例，资产价格波动会影响安全边际。', '优先偿还高息负债，避免用短期债务配置长期资产。', '总负债 / 总资产', '0%-30%较低，30%-50%关注，超过50%压力上升')
  if (ratio <= 70) return metric('debt_ratio', '资产负债率', ratio, 'percent', 'warning', '总体杠杆偏高', '超过一半资产对应负债，家庭调整空间受到限制。', '制定明确降债计划，并保留充足现金储备。', '总负债 / 总资产', '0%-30%较低，30%-50%关注，超过50%压力上升')
  return metric('debt_ratio', '资产负债率', ratio, 'percent', 'critical', '总体杠杆很高', '负债接近或超过大部分资产价值，家庭对收入中断和资产下跌较敏感。', '停止新增非必要债务，尽快评估资产处置和债务重组方案。', '总负债 / 总资产', '0%-30%较低，30%-50%关注，超过50%压力上升')
}

function fixedAssetMetric(assets: number, fixed: number): MetricResult {
  if (assets <= 0) return metric('fixed_asset_ratio', '固定资产占比', null, 'percent', 'neutral', '等待资产数据', '没有足够数据判断资产集中度。', '先补充房产、车辆和金融资产。', '固定资产 / 总资产', '不以越低越好，需结合自住需求与流动性')
  const ratio = fixed / assets * 100
  if (ratio <= 50) return metric('fixed_asset_ratio', '固定资产占比', ratio, 'percent', 'healthy', '固定资产集中度较低', '可变现资产在整体资产中仍占有一定空间。', '结合住房需求确认配置是否符合家庭阶段。', '固定资产 / 总资产', '50%以下通常较灵活，70%以上需要关注流动性')
  if (ratio <= 70) return metric('fixed_asset_ratio', '固定资产占比', ratio, 'percent', 'attention', '固定资产占比较高', '较多资产集中在房产和车辆，临时变现能力会受到影响。', '在新增固定资产前先补足现金和金融资产。', '固定资产 / 总资产', '50%以下通常较灵活，70%以上需要关注流动性')
  return metric('fixed_asset_ratio', '固定资产占比', ratio, 'percent', 'warning', '固定资产高度集中', '大部分资产难以快速变现，家庭可能出现资产多但现金不足的情况。', '优先提高流动资产占比，并避免进一步集中。', '固定资产 / 总资产', '50%以下通常较灵活，70%以上需要关注流动性')
}

function estimateOneYearDebt(liability: CustomerProfile['liabilities'][number]) {
  if (liability.dueWithinOneYear > 0) return liability.dueWithinOneYear
  if (liability.monthlyPayment > 0) {
    const months = liability.remainingMonths === null ? 12 : Math.min(12, Math.max(0, liability.remainingMonths))
    const estimated = liability.monthlyPayment * months
    return liability.balance > 0 ? Math.min(liability.balance, estimated) : estimated
  }
  if (liability.balance > 0 && liability.remainingMonths !== null && liability.remainingMonths > 0 && liability.remainingMonths <= 12) return liability.balance
  return 0
}

function liquidCoverageMetric(liquid: number, due: number, hasLiabilityData: boolean, confirmed: boolean): MetricResult {
  if (!hasLiabilityData && !confirmed) return metric('liquid_coverage', '资产负债健康度', null, 'ratio', 'neutral', '负债资料待确认', '尚未填写负债，也未确认无负债。', '补充负债或确认当前无负债。', '流动资产 / 未来一年应还债务', '')
  if (!hasLiabilityData) return { ...metric('liquid_coverage', '资产负债健康度', 10, 'ratio', 'strong', '当前没有短期偿债压力', '当前没有录入需要偿还的负债，流动资产无需承担未来一年还款。', '', '当前无负债', ''), displayValue: '无负债' }
  if (due <= 0) return metric('liquid_coverage', '资产负债健康度', null, 'ratio', 'neutral', '还款计划待补充', '已录入负债余额，但月供、剩余期数和未来一年应还金额不足以推算短期还款。', '补充月供或未来一年应还金额。', '流动资产 / 未来一年应还债务', '低于1倍风险较高，1-3倍需关注，3倍及以上较健康')
  const ratio = liquid / due
  if (ratio < 1) return metric('liquid_coverage', '一年期偿债覆盖', ratio, 'ratio', 'critical', '流动资产不足以覆盖短期债务', '未来一年应还金额高于当前流动资产。', '优先提高现金储备或调整到期债务安排。', '流动资产 / 未来一年应还债务', '1倍是基础，2倍以上更有缓冲')
  if (ratio < 3) return metric('liquid_coverage', '资产负债健康度', ratio, 'ratio', 'attention', '短期偿债覆盖有限', '流动资产可以覆盖一年内债务，但距离3倍健康参考线仍有差距。', '保留还款专用资金，并逐步增加高流动性资产。', '流动资产 / 未来一年应还债务', '低于1倍风险较高，1-3倍需关注，3倍及以上较健康')
  return metric('liquid_coverage', '资产负债健康度', ratio, 'ratio', ratio >= 5 ? 'strong' : 'healthy', ratio >= 5 ? '短期偿债缓冲充足' : '短期偿债结构健康', '流动资产对一年内债务形成较充分覆盖。', '继续核对债务到期结构，并保持流动资金可随时使用。', '流动资产 / 未来一年应还债务', '低于1倍风险较高，1-3倍需关注，3倍及以上较健康')
}

function debtServiceMetric(income: number, payments: number, liabilities: number, known: boolean): MetricResult {
  const reference = '产品提醒线：20%以下较轻，20%-36%关注，超过36%压力上升；不是贷款审批标准'
  if (!known) return metric('debt_service_ratio', '债务偿付占收入', null, 'percent', 'neutral', '负债资料待确认', '尚未填写负债，也未确认无负债。', '请先核对家庭负债。', '年度债务还款 / 家庭年收入', reference)
  if (liabilities <= 0 && payments <= 0) return metric('debt_service_ratio', '债务偿付占收入', null, 'percent', 'healthy', '当前没有负债偿付压力', '已确认没有需要持续偿还的负债。', '如存在信用卡分期或其他月供，请补充录入。', '年度债务还款 / 家庭年收入', reference)
  if (payments <= 0) return metric('debt_service_ratio', '债务偿付占收入', null, 'percent', 'neutral', '等待月供数据', '已录入负债余额，但尚未填写每月还款金额。', '补充每笔负债月供，才能判断收入承压程度。', '年度债务还款 / 家庭年收入', reference)
  if (income <= 0) return metric('debt_service_ratio', '债务偿付占收入', 100, 'percent', 'critical', '缺少收入覆盖月供', '存在持续债务还款，但没有可用于覆盖的家庭收入。', '核对收入是否漏填，并立即评估必要支出与偿债安排。', '年度债务还款 / 家庭年收入', reference)
  const ratio = payments / income * 100
  if (ratio < 20) return metric('debt_service_ratio', '债务偿付占收入', ratio, 'percent', 'healthy', '月供对收入占用较轻', '债务还款占家庭收入的比例相对有限。', '仍需结合生活支出和收入稳定性保留缓冲。', '年度债务还款 / 家庭年收入', reference)
  if (ratio <= 36) return metric('debt_service_ratio', '债务偿付占收入', ratio, 'percent', 'attention', '月供开始压缩结余', '较明显的一部分家庭收入被债务还款占用。', '控制新增月供，并检查收入中断时的还款储备。', '年度债务还款 / 家庭年收入', reference)
  if (ratio <= 50) return metric('debt_service_ratio', '债务偿付占收入', ratio, 'percent', 'warning', '债务偿付压力偏高', '月供正在显著限制生活支出和储蓄空间。', '优先处理高息负债，并评估降低月供的可行方案。', '年度债务还款 / 家庭年收入', reference)
  return metric('debt_service_ratio', '债务偿付占收入', ratio, 'percent', 'critical', '大部分收入用于偿债', '持续还款占据过多收入，家庭对收入波动非常敏感。', '停止新增非必要负债，并尽快制定降债或重组计划。', '年度债务还款 / 家庭年收入', reference)
}

function emergencyMetric(funds: number, monthly: number, target: number): MetricResult {
  if (monthly <= 0) return metric('emergency_months', '现金储备月数', null, 'months', 'neutral', '等待家庭支出数据', '没有家庭支出和月供数据，无法计算储备可维持多久。', '完成家庭支出和债务月供录入。', '可用应急资金 /（家庭每月总支出 + 负债月供）', `当前家庭建议目标约 ${target} 个月`)
  const months = funds / monthly
  if (months < 1) return metric('emergency_months', '现金储备月数', months, 'months', 'critical', '现金储备严重不足', '现有应急资金不足以覆盖一个月家庭总支出和月供。', '暂停非必要投资与大额支出，先建立至少1个月缓冲。', '可用应急资金 /（家庭每月总支出 + 负债月供）', `当前家庭建议目标约 ${target} 个月`)
  if (months < target / 2) return metric('emergency_months', '现金储备月数', months, 'months', 'warning', '现金储备偏低', '储备能够应对短期波动，但距离个性化目标仍有明显差距。', `先提高到 ${Math.ceil(target / 2)} 个月，再逐步达到 ${target} 个月。`, '可用应急资金 /（家庭每月总支出 + 负债月供）', `当前家庭建议目标约 ${target} 个月`)
  if (months < target) return metric('emergency_months', '现金储备月数', months, 'months', 'attention', '现金储备接近目标', '家庭已有一定缓冲，但收入结构和家庭责任要求更高储备。', `继续补足到约 ${target} 个月家庭总支出与月供。`, '可用应急资金 /（家庭每月总支出 + 负债月供）', `当前家庭建议目标约 ${target} 个月`)
  if (months <= 12) return metric('emergency_months', '现金储备月数', months, 'months', 'healthy', '现金储备较充足', '应急资金达到当前家庭建议目标。', '保持资金安全和可随时使用，并定期随支出变化更新。', '可用应急资金 /（家庭每月总支出 + 负债月供）', `当前家庭建议目标约 ${target} 个月`)
  return metric('emergency_months', '现金储备月数', months, 'months', 'attention', '现金储备可能偏多', '现金缓冲很充分，但长期闲置可能降低资金效率。', '在保留目标储备后，再评估中长期目标配置。', '可用应急资金 /（家庭每月总支出 + 负债月供）', `当前家庭建议目标约 ${target} 个月`)
}

function savingsMetric(income: number, surplus: number): MetricResult {
  const reference = '低于0%为赤字，0%-30%偏低，30%-50%合理，50%以上较强'
  if (income <= 0) return metric('savings_rate', '年度结余率', null, 'percent', 'neutral', '等待收入数据', '收入为零时不能把结余率错误显示为0%。', '补充家庭收入后再计算。', '偿债后年度结余 / 家庭年收入', reference)
  const rate = surplus / income * 100
  if (rate < 0) return metric('savings_rate', '年度结余率', rate, 'percent', 'critical', '家庭现金流持续赤字', '年度支出和强制还款超过收入，正在消耗存量资产或增加负债。', '先削减可调整支出，并处理高额月供。', '偿债后年度结余 / 家庭年收入', reference)
  if (rate < 10) return metric('savings_rate', '年度结余率', rate, 'percent', 'warning', '年度结余缓冲较弱', '收入的大部分已被支出和偿债占用。', '先把结余率提升到10%，建立稳定正结余。', '偿债后年度结余 / 家庭年收入', reference)
  if (rate < 30) return metric('savings_rate', '年度结余率', rate, 'percent', 'attention', '家庭正在积累', '已有稳定正结余，但距离30%的合理参考线仍有差距。', '逐步压缩可调整支出，把结余率提升到30%。', '偿债后年度结余 / 家庭年收入', '低于0%为赤字，0%-30%偏低，30%-50%合理，50%以上较强')
  if (rate < 50) return metric('savings_rate', '年度结余率', rate, 'percent', 'healthy', '年度结余较合理', '家庭能够把较稳定的一部分收入用于未来目标。', '明确分配应急、教育和养老资金。', '偿债后年度结余 / 家庭年收入', '低于0%为赤字，0%-30%偏低，30%-50%合理，50%以上较强')
  return metric('savings_rate', '年度结余率', rate, 'percent', 'strong', '储蓄能力较强', '家庭当前具有较强的年度资金积累能力。', '检查高结余是否来自遗漏支出，并为结余设定明确目标。', '偿债后年度结余 / 家庭年收入', '低于0%为赤字，0%-30%偏低，30%-50%合理，50%以上较强')
}

function incomeConcentrationMetric(income: number, workIncome: number): MetricResult {
  if (income <= 0) return metric('income_concentration', '工作收入集中度', null, 'percent', 'neutral', '等待收入数据', '没有数据判断收入来源。', '补充每项收入并标明类别。', '工作及经营收入 / 家庭年收入', '这是集中度指标，不是越低越健康')
  const ratio = workIncome / income * 100
  if (ratio >= 90) return metric('income_concentration', '工作收入集中度', ratio, 'percent', 'attention', '收入来源较集中', '家庭收入主要依赖工作或经营，一旦中断会直接影响现金流。', '提高应急储备，并逐步培养可持续的其他收入来源。', '工作及经营收入 / 家庭年收入', '这是集中度指标，不是越低越健康')
  if (ratio >= 60) return metric('income_concentration', '工作收入集中度', ratio, 'percent', 'healthy', '收入结构以工作为主', '工作收入仍是核心，同时已有其他来源提供一定分散。', '继续核实其他收入是否稳定和可持续。', '工作及经营收入 / 家庭年收入', '这是集中度指标，不是越低越健康')
  return metric('income_concentration', '工作收入集中度', ratio, 'percent', 'neutral', '非工作收入占比较高', '收入来源较分散，但需要判断租金、投资或养老金是否稳定。', '逐项评估其他收入的波动和持续时间。', '工作及经营收入 / 家庭年收入', '这是集中度指标，不是越低越健康')
}

function insuranceExpenseRatioMetric(income: number, insuranceExpenses: number): MetricResult {
  const formula = '年度保险支出 / 家庭年收入'
  const reference = '1. 0%：无保险投入\n2. 低于10%：有一定投入\n3. 10%–20%：较合理区间\n4. 高于20%：需确保现金流健康'
  if (income <= 0) return metric('insurance_expense_ratio', '保险支出占比', null, 'percent', 'neutral', '等待收入数据', '没有家庭年收入，暂时无法评估保费负担。', '补充家庭收入后自动计算保险支出占比。', formula, reference)
  const rate = insuranceExpenses / income * 100
  if (rate === 0) return metric('insurance_expense_ratio', '保险支出占比', rate, 'percent', 'neutral', '未录入保险支出', '现有家庭支出中没有识别到保险或保费项目，不据此判断保障不足。', '如家庭已有保单，请补充年度保费；保障充足度需结合保额与家庭责任另行评估。', formula, reference)
  if (rate < 10) return metric('insurance_expense_ratio', '保险支出占比', rate, 'percent', 'healthy', '有一定投入', '当前年度保费占家庭收入比例低于10%。占比不代表保障是否充足。', '继续核对保障范围、保额和缴费年限。', formula, reference)
  if (rate <= 20) return metric('insurance_expense_ratio', '保险支出占比', rate, 'percent', 'healthy', '较合理区间', '当前占比位于本工具10%–20%的参考区间，仍需结合家庭结余与缴费期限核对。', '确认扣除保费后现金流仍为正，并核对未来各年的缴费安排。', formula, reference)
  return metric('insurance_expense_ratio', '保险支出占比', rate, 'percent', 'warning', '保费负担需重点关注', '年度保费超过家庭年收入20%，长期缴费可能明显挤压其他家庭目标。', '重点复核保单类型、缴费期限、退保损失和家庭现金流承受能力。', formula, reference)
}

function educationMetric(cost: number, prepared: number, count: number): MetricResult {
  if (!count) return metric('education_readiness', '教育目标准备度', null, 'percent', 'neutral', '尚未设置教育目标', '没有教育目标时不参与健康评分。', '如有子女教育计划，可建立独立目标。', '已准备教育资金 / 预计未来教育费用', '目标越临近，越需要提高准备度')
  if (cost <= 0) return metric('education_readiness', '教育目标准备度', null, 'percent', 'neutral', '教育费用待补充', '已有教育路线但没有完整费用数据。', '补充当前年费用、增长率和预计年限。', '已准备教育资金 / 预计未来教育费用', '目标越临近，越需要提高准备度')
  const ratio = prepared / cost * 100
  if (ratio < 25) return metric('education_readiness', '教育目标准备度', ratio, 'percent', 'warning', '教育资金缺口较大', '当前准备资金只覆盖预计需求的一小部分。', '结合开始时间计算每年需要新增的教育储备。', '已准备教育资金 / 预计未来教育费用', '目标越临近，越需要提高准备度')
  if (ratio < 70) return metric('education_readiness', '教育目标准备度', ratio, 'percent', 'attention', '教育资金正在积累', '已准备部分教育资金，但仍需要持续投入。', '将年度结余中的固定比例分配给教育目标。', '已准备教育资金 / 预计未来教育费用', '目标越临近，越需要提高准备度')
  return metric('education_readiness', '教育目标准备度', Math.min(100, ratio), 'percent', 'healthy', '教育资金准备较充分', '已准备资金覆盖大部分预计费用。', '定期更新学费假设并降低临近使用资金的波动风险。', '已准备教育资金 / 预计未来教育费用', '目标越临近，越需要提高准备度')
}

function metric(key: string, label: string, value: number | null, unit: MetricResult['unit'], level: HealthLevel, title: string, explanation: string, action: string, formula: string, reference: string): MetricResult {
  return { key, label, value, unit, level, title, explanation, action, formula, reference }
}
function levelScore(level: HealthLevel) { return ({ critical: 20, warning: 45, attention: 68, healthy: 85, strong: 96, neutral: 75 } as const)[level] }
function levelRank(level: HealthLevel) { return ({ critical: 0, warning: 1, attention: 2, healthy: 3, strong: 4, neutral: 5 } as const)[level] }

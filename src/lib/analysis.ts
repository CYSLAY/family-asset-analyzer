import type { CashFlowEntry, CustomerProfile } from '../types/domain'

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
    necessaryMonthlyOutflow: number
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
  const liquidAssets = customer.assets.filter((item) => item.liquidity !== 'long_term').reduce((sum, item) => sum + item.currentValue, 0)
  const emergencyFunds = customer.assets.filter((item) => item.availableForEmergency && item.liquidity !== 'long_term').reduce((sum, item) => sum + item.currentValue, 0)
  const annualIncome = customer.incomes.reduce((sum, item) => sum + annualize(item), 0)
  const annualExpenses = customer.expenses.reduce((sum, item) => sum + annualize(item), 0)
  const necessaryAnnualExpenses = customer.expenses.filter((item) => item.necessary).reduce((sum, item) => sum + annualize(item), 0)
  const annualDebtPayments = customer.liabilities.reduce((sum, item) => sum + item.monthlyPayment * 12, 0)
  const necessaryMonthlyOutflow = necessaryAnnualExpenses / 12 + annualDebtPayments / 12
  const dueWithinOneYear = customer.liabilities.reduce((sum, item) => sum + item.dueWithinOneYear, 0)
  const workIncome = customer.incomes.filter((item) => /工作|工资|经营|佣金|奖金/.test(`${item.category}${item.name}`)).reduce((sum, item) => sum + annualize(item), 0)
  const annualSurplus = annualIncome - annualExpenses - annualDebtPayments
  const emergencyTarget = getEmergencyTarget(customer)
  const educationFutureCost = customer.educationGoals.reduce((sum, goal) => sum + goal.annualCostToday * Math.pow(1 + goal.inflationRate / 100, goal.yearsUntilStart) * goal.durationYears, 0)
  const educationPrepared = customer.educationGoals.reduce((sum, goal) => sum + goal.preparedAmount, 0)

  const metrics = [
    netWorthMetric(assets - liabilities),
    debtRatioMetric(assets, liabilities),
    fixedAssetMetric(assets, fixedAssets),
    liquidCoverageMetric(liquidAssets, dueWithinOneYear),
    debtServiceMetric(annualIncome, annualDebtPayments, liabilities),
    emergencyMetric(emergencyFunds, necessaryMonthlyOutflow, emergencyTarget),
    savingsMetric(annualIncome, annualSurplus),
    incomeConcentrationMetric(annualIncome, workIncome),
    educationMetric(educationFutureCost, educationPrepared, customer.educationGoals.length),
  ]

  const scored = metrics.filter((metric) => metric.value !== null && metric.key !== 'income_concentration')
  const rawScore = scored.length ? Math.round(scored.reduce((sum, metric) => sum + levelScore(metric.level), 0) / scored.length) : null
  const hasCritical = metrics.some((metric) => metric.level === 'critical')
  const score = rawScore === null ? null : hasCritical ? Math.min(rawScore, 49) : rawScore
  const priorityKeys = metrics
    .filter((metric) => metric.level === 'critical' || metric.level === 'warning' || metric.level === 'attention')
    .sort((a, b) => levelRank(a.level) - levelRank(b.level))
    .slice(0, 3)
    .map((metric) => metric.key)

  return {
    totals: { assets, liabilities, netWorth: assets - liabilities, annualIncome, annualExpenses: annualExpenses + annualDebtPayments, annualSurplus, emergencyFunds, liquidAssets, necessaryMonthlyOutflow, educationFutureCost, educationGap: Math.max(0, educationFutureCost - educationPrepared) },
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

function netWorthMetric(value: number): MetricResult {
  if (value < 0) return metric('net_worth', '净资产', value, 'currency', 'critical', '净资产为负', '现有资产不足以覆盖全部负债，家庭抗风险空间有限。', '先停止新增非必要负债，并制定高息和短期债务的偿还顺序。', '总资产 - 总负债', '大于 0 是基础，仍需结合现金流判断')
  if (value === 0) return metric('net_worth', '净资产', value, 'currency', 'warning', '资产刚好覆盖负债', '当前没有净资产缓冲，任何资产价格下降都可能使净资产转负。', '优先建立现金结余并逐步降低负债余额。', '总资产 - 总负债', '大于 0 是基础，仍需结合现金流判断')
  return metric('net_worth', '净资产', value, 'currency', 'healthy', '净资产为正', '家庭资产能够覆盖当前负债。', '继续观察净资产是否随时间稳定增长。', '总资产 - 总负债', '不设置统一金额门槛，关注方向与增长')
}

function debtRatioMetric(assets: number, liabilities: number): MetricResult {
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

function liquidCoverageMetric(liquid: number, due: number): MetricResult {
  if (due <= 0) return metric('liquid_coverage', '一年期偿债覆盖', null, 'ratio', 'healthy', '没有录入一年内到期债务', '当前不存在需要用流动资产覆盖的明确短期到期金额。', '仍需核对月供是否完整。', '流动资产 / 未来一年应还债务', '1倍是基础，2倍以上更有缓冲')
  const ratio = liquid / due
  if (ratio < 1) return metric('liquid_coverage', '一年期偿债覆盖', ratio, 'ratio', 'critical', '流动资产不足以覆盖短期债务', '未来一年应还金额高于当前流动资产。', '优先提高现金储备或调整到期债务安排。', '流动资产 / 未来一年应还债务', '1倍是基础，2倍以上更有缓冲')
  if (ratio < 2) return metric('liquid_coverage', '一年期偿债覆盖', ratio, 'ratio', 'attention', '短期偿债覆盖有限', '流动资产能够覆盖已录入的一年期债务，但剩余缓冲不多。', '保留还款专用资金，避免投入高波动或长期资产。', '流动资产 / 未来一年应还债务', '1倍是基础，2倍以上更有缓冲')
  return metric('liquid_coverage', '一年期偿债覆盖', ratio, 'ratio', 'healthy', '短期偿债覆盖较充足', '流动资产对一年内债务有较好的覆盖。', '继续核对利率并优先处理高息负债。', '流动资产 / 未来一年应还债务', '1倍是基础，2倍以上更有缓冲')
}

function debtServiceMetric(income: number, payments: number, liabilities: number): MetricResult {
  const reference = '产品提醒线：20%以下较轻，20%-36%关注，超过36%压力上升；不是贷款审批标准'
  if (liabilities <= 0) return metric('debt_service_ratio', '债务偿付占收入', null, 'percent', 'healthy', '当前没有负债偿付压力', '没有录入需要持续偿还的负债。', '如存在信用卡分期或其他月供，请补充录入。', '年度债务还款 / 家庭年收入', reference)
  if (payments <= 0) return metric('debt_service_ratio', '债务偿付占收入', null, 'percent', 'neutral', '等待月供数据', '已录入负债余额，但尚未填写每月还款金额。', '补充每笔负债月供，才能判断收入承压程度。', '年度债务还款 / 家庭年收入', reference)
  if (income <= 0) return metric('debt_service_ratio', '债务偿付占收入', 100, 'percent', 'critical', '缺少收入覆盖月供', '存在持续债务还款，但没有可用于覆盖的家庭收入。', '核对收入是否漏填，并立即评估必要支出与偿债安排。', '年度债务还款 / 家庭年收入', reference)
  const ratio = payments / income * 100
  if (ratio < 20) return metric('debt_service_ratio', '债务偿付占收入', ratio, 'percent', 'healthy', '月供对收入占用较轻', '债务还款占家庭收入的比例相对有限。', '仍需结合生活支出和收入稳定性保留缓冲。', '年度债务还款 / 家庭年收入', reference)
  if (ratio <= 36) return metric('debt_service_ratio', '债务偿付占收入', ratio, 'percent', 'attention', '月供开始压缩结余', '较明显的一部分家庭收入被债务还款占用。', '控制新增月供，并检查收入中断时的还款储备。', '年度债务还款 / 家庭年收入', reference)
  if (ratio <= 50) return metric('debt_service_ratio', '债务偿付占收入', ratio, 'percent', 'warning', '债务偿付压力偏高', '月供正在显著限制生活支出和储蓄空间。', '优先处理高息负债，并评估降低月供的可行方案。', '年度债务还款 / 家庭年收入', reference)
  return metric('debt_service_ratio', '债务偿付占收入', ratio, 'percent', 'critical', '大部分收入用于偿债', '持续还款占据过多收入，家庭对收入波动非常敏感。', '停止新增非必要负债，并尽快制定降债或重组计划。', '年度债务还款 / 家庭年收入', reference)
}

function emergencyMetric(funds: number, monthly: number, target: number): MetricResult {
  if (monthly <= 0) return metric('emergency_months', '现金储备月数', null, 'months', 'neutral', '等待必要支出数据', '没有必要支出和月供数据，无法计算储备可维持多久。', '完成必要支出和债务月供录入。', '可用应急资金 / 每月必要支出与月供', `当前家庭建议目标约 ${target} 个月`)
  const months = funds / monthly
  if (months < 1) return metric('emergency_months', '现金储备月数', months, 'months', 'critical', '现金储备严重不足', '现有应急资金不足以覆盖一个月必要支出。', '暂停非必要投资与大额支出，先建立至少1个月缓冲。', '可用应急资金 / 每月必要支出与月供', `当前家庭建议目标约 ${target} 个月`)
  if (months < target / 2) return metric('emergency_months', '现金储备月数', months, 'months', 'warning', '现金储备偏低', '储备能够应对短期波动，但距离个性化目标仍有明显差距。', `先提高到 ${Math.ceil(target / 2)} 个月，再逐步达到 ${target} 个月。`, '可用应急资金 / 每月必要支出与月供', `当前家庭建议目标约 ${target} 个月`)
  if (months < target) return metric('emergency_months', '现金储备月数', months, 'months', 'attention', '现金储备接近目标', '家庭已有一定缓冲，但收入结构和家庭责任要求更高储备。', `继续补足到约 ${target} 个月必要支出。`, '可用应急资金 / 每月必要支出与月供', `当前家庭建议目标约 ${target} 个月`)
  if (months <= 12) return metric('emergency_months', '现金储备月数', months, 'months', 'healthy', '现金储备较充足', '应急资金达到当前家庭建议目标。', '保持资金安全和可随时使用，并定期随支出变化更新。', '可用应急资金 / 每月必要支出与月供', `当前家庭建议目标约 ${target} 个月`)
  return metric('emergency_months', '现金储备月数', months, 'months', 'attention', '现金储备可能偏多', '现金缓冲很充分，但长期闲置可能降低资金效率。', '在保留目标储备后，再评估中长期目标配置。', '可用应急资金 / 每月必要支出与月供', `当前家庭建议目标约 ${target} 个月`)
}

function savingsMetric(income: number, surplus: number): MetricResult {
  if (income <= 0) return metric('savings_rate', '年度储蓄率', null, 'percent', 'neutral', '等待收入数据', '收入为零时不能把储蓄率错误显示为0%。', '补充家庭收入后再计算。', '偿债后年度结余 / 家庭年收入', '低于0%为赤字，20%以上通常具备较好积累能力')
  const rate = surplus / income * 100
  if (rate < 0) return metric('savings_rate', '年度储蓄率', rate, 'percent', 'critical', '家庭现金流持续赤字', '年度支出和强制还款超过收入，正在消耗存量资产或增加负债。', '先削减可调整支出，并处理高额月供。', '偿债后年度结余 / 家庭年收入', '低于0%为赤字，20%以上通常具备较好积累能力')
  if (rate < 10) return metric('savings_rate', '年度储蓄率', rate, 'percent', 'warning', '年度结余缓冲较弱', '收入的大部分已被支出和偿债占用。', '先把储蓄率提升到10%，建立稳定正结余。', '偿债后年度结余 / 家庭年收入', '低于0%为赤字，20%以上通常具备较好积累能力')
  if (rate < 20) return metric('savings_rate', '年度储蓄率', rate, 'percent', 'attention', '家庭正在积累', '已有稳定正结余，但对多个长期目标的支持能力仍有限。', '逐步向20%或个性化目标靠近。', '偿债后年度结余 / 家庭年收入', '低于0%为赤字，20%以上通常具备较好积累能力')
  if (rate < 30) return metric('savings_rate', '年度储蓄率', rate, 'percent', 'healthy', '储蓄能力较好', '家庭能够把较稳定的一部分收入用于未来目标。', '明确分配应急、教育和养老资金。', '偿债后年度结余 / 家庭年收入', '低于0%为赤字，20%以上通常具备较好积累能力')
  return metric('savings_rate', '年度储蓄率', rate, 'percent', 'strong', '储蓄能力较强', '家庭当前具有较强的年度资金积累能力。', '检查高储蓄是否来自遗漏支出，并为结余设定明确目标。', '偿债后年度结余 / 家庭年收入', '低于0%为赤字，20%以上通常具备较好积累能力')
}

function incomeConcentrationMetric(income: number, workIncome: number): MetricResult {
  if (income <= 0) return metric('income_concentration', '工作收入集中度', null, 'percent', 'neutral', '等待收入数据', '没有数据判断收入来源。', '补充每项收入并标明类别。', '工作及经营收入 / 家庭年收入', '这是集中度指标，不是越低越健康')
  const ratio = workIncome / income * 100
  if (ratio >= 90) return metric('income_concentration', '工作收入集中度', ratio, 'percent', 'attention', '收入来源较集中', '家庭收入主要依赖工作或经营，一旦中断会直接影响现金流。', '提高应急储备，并逐步培养可持续的其他收入来源。', '工作及经营收入 / 家庭年收入', '这是集中度指标，不是越低越健康')
  if (ratio >= 60) return metric('income_concentration', '工作收入集中度', ratio, 'percent', 'healthy', '收入结构以工作为主', '工作收入仍是核心，同时已有其他来源提供一定分散。', '继续核实其他收入是否稳定和可持续。', '工作及经营收入 / 家庭年收入', '这是集中度指标，不是越低越健康')
  return metric('income_concentration', '工作收入集中度', ratio, 'percent', 'neutral', '非工作收入占比较高', '收入来源较分散，但需要判断租金、投资或养老金是否稳定。', '逐项评估其他收入的波动和持续时间。', '工作及经营收入 / 家庭年收入', '这是集中度指标，不是越低越健康')
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

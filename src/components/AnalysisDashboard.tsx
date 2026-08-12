import { useEffect, useMemo, useRef, useState } from 'react'
import * as echarts from 'echarts/core'
import { GaugeChart, PieChart } from 'echarts/charts'
import { AriaComponent, TooltipComponent } from 'echarts/components'
import { SVGRenderer } from 'echarts/renderers'
import type { ComposeOption } from 'echarts/core'
import type { GaugeSeriesOption, PieSeriesOption } from 'echarts/charts'
import type { TooltipComponentOption } from 'echarts/components'
import { ArrowRightIcon, CaretDownIcon, InfoIcon } from '@phosphor-icons/react'
import wechatQr from '../../assets/branding/jojo-wechat-qr-original.jpg'
import qrLogoBadge from '../../assets/branding/jojo-qr-logo-badge.png'
import { analyzeCustomer, annualize, type HealthLevel, type MetricResult } from '../lib/analysis'
import { useCustomerStore } from '../stores/customerStore'
import type { CustomerProfile } from '../types/domain'

interface Props { onChooseCustomer: () => void }
interface BreakdownSource { label: string; amount: number; frequency?: 'monthly' | 'quarterly' | 'yearly' }
interface BreakdownEntry { name: string; value: number; source: BreakdownSource }
interface BreakdownItem { name: string; value: number; color: string; sources: BreakdownSource[] }

const levelLabels: Record<HealthLevel, string> = { critical: '紧急', warning: '偏弱', attention: '需关注', healthy: '良好', strong: '较强', neutral: '资料不足' }
const liabilityLabels: Record<string, string> = { mortgage: '房贷', car_loan: '车贷', consumer_loan: '消费贷款', credit_card: '信用卡', private_loan: '私人借款', other: '其他负债' }
const palette = ['#c91d2a', '#e56a73', '#ef9ea5', '#f2c4c8', '#8d1720', '#b9a1a3', '#d7c9ca']

echarts.use([GaugeChart, PieChart, AriaComponent, TooltipComponent, SVGRenderer])
type ChartOption = ComposeOption<GaugeSeriesOption | PieSeriesOption | TooltipComponentOption>

export function AnalysisDashboard({ onChooseCustomer }: Props) {
  const { customers, selectedCustomerId } = useCustomerStore()
  const customer = customers.find((item) => item.id === selectedCustomerId) ?? null
  const analysis = useMemo(() => customer ? analyzeCustomer(customer) : null, [customer])

  if (!customer || !analysis) return <section className="empty-state financial-empty"><InfoIcon size={34} /><h2>请先选择客户</h2><p>分析报告只读取当前客户的原始资料。</p><button className="primary-action compact" type="button" onClick={onChooseCustomer}>选择客户 <ArrowRightIcon size={18} /></button></section>

  const metric = (key: string) => analysis.metrics.find((item) => item.key === key) as MetricResult
  const assetBreakdown = buildAssetBreakdown(customer)
  const liabilityBreakdown = groupEntries(customer.liabilities.map((item) => ({ name: liabilityLabels[item.category], value: item.balance, source: { label: item.name || liabilityLabels[item.category], amount: item.balance } })))
  const incomeBreakdown = groupEntries(customer.incomes.map((item) => ({ name: classifyIncome(`${item.category}${item.name}`), value: annualize(item), source: { label: flowSourceLabel(customer, item.memberId, item.name || item.category), amount: item.amount, frequency: item.frequency } })))
  const expenseRows: BreakdownEntry[] = customer.expenses.map((item) => ({ name: classifyExpense(`${item.category}${item.name}`), value: annualize(item), source: { label: flowSourceLabel(customer, item.memberId, item.name || item.category), amount: item.amount, frequency: item.frequency } }))
  customer.liabilities.filter((item) => item.monthlyPayment > 0).forEach((item) => {
    const fixed = item.category === 'mortgage' || item.category === 'car_loan'
    expenseRows.push({ name: fixed ? '固定资产按揭' : '流动负债偿还', value: item.monthlyPayment * 12, source: { label: `${item.name || liabilityLabels[item.category]}月供`, amount: item.monthlyPayment, frequency: 'monthly' } })
  })
  const expenseBreakdown = groupEntries(expenseRows)
  const flowDebt = flowVsDebtMetric(analysis.totals.liquidAssets, analysis.totals.liabilities)

  return <div className="analysis-page detailed-report">
    <section className="analysis-hero">
      <div>
        <span className="quiet-label">{customer.householdName}的财务分析报告</span>
        <h1>资产结构与现金流诊断</h1>
        <p>所有图表根据当前已录入资料实时计算；缺少数据的板块会明确标示，不使用固定结论代替判断。</p>
      </div>
    </section>

    <nav className="report-section-nav" aria-label="报告章节"><a href="#balance-report">资产负债</a><a href="#cashflow-report">收支储蓄</a><a href="#education-report">教育目标</a></nav>

    <ReportSection id="balance-report" index="01" title="资产负债分析" description="先看家庭净资产，再检查资产配置、债务结构和短期偿债能力。">
      <div className="report-grid two-columns">
        <ComparisonPanel title="净资产" leftLabel="总资产" leftValue={analysis.totals.assets} rightLabel="总负债" rightValue={analysis.totals.liabilities} resultLabel="净资产" resultValue={analysis.totals.netWorth} resultPercent={analysis.totals.assets > 0 ? analysis.totals.netWorth / analysis.totals.assets * 100 : null} metric={metric('net_worth')} />
        <ComparisonPanel title="流动资产 VS 负债" leftLabel="流动资产" leftValue={analysis.totals.liquidAssets} rightLabel="总负债" rightValue={analysis.totals.liabilities} resultLabel="差值" resultValue={analysis.totals.liquidAssets - analysis.totals.liabilities} resultPercent={analysis.totals.liquidAssets > 0 ? (analysis.totals.liquidAssets - analysis.totals.liabilities) / analysis.totals.liquidAssets * 100 : null} metric={flowDebt} />
      </div>

      <div className="report-grid two-columns report-distributions">
        <DistributionPanel title="资产分布图" totalLabel="总资产" items={assetBreakdown} />
        <DistributionPanel title="负债分布图" totalLabel="总负债" items={liabilityBreakdown} />
      </div>

      <div className="health-grid">
        <HealthPanel metric={metric('fixed_asset_ratio')} max={100} healthyRange="固定资产低于50%通常较灵活，超过70%需关注流动性" />
        <HealthPanel metric={metric('emergency_months')} max={12} healthyRange="3-6个月是基础参考，家庭责任和收入波动会提高目标" />
        <HealthPanel metric={metric('liquid_coverage')} max={10} healthyRange="流动资产达到一年内债务的3倍及以上较健康" />
        <HealthPanel metric={metric('debt_ratio')} max={100} healthyRange="0%-30%较低，30%-50%需关注，超过50%压力上升" />
      </div>
    </ReportSection>

    <ReportSection id="cashflow-report" index="02" title="收支储蓄分析" description="查看收入来源、支出去向、年度结余以及长期投入能力。">
      <div className="report-grid two-columns report-distributions">
        <DistributionPanel title="家庭年收入" totalLabel="年收入" items={incomeBreakdown} />
        <DistributionPanel title="家庭年支出" totalLabel="年支出" items={expenseBreakdown} />
      </div>

      <ComparisonPanel title="家庭年结余" leftLabel="家庭年收入" leftValue={analysis.totals.annualIncome} rightLabel="家庭年支出" rightValue={analysis.totals.annualExpenses} resultLabel="年度结余" resultValue={analysis.totals.annualSurplus} resultPercent={analysis.totals.annualIncome > 0 ? analysis.totals.annualSurplus / analysis.totals.annualIncome * 100 : null} metric={metric('savings_rate')} />

      <div className="health-grid three-up">
        <HealthPanel metric={metric('income_concentration')} max={100} healthyRange="工作收入越接近100%，家庭越依赖持续工作能力" />
        <HealthPanel metric={metric('savings_rate')} max={100} healthyRange="30%以上较合理，50%以上表示积累能力较强" />
        <HealthPanel metric={metric('investment_rate')} max={100} healthyRange="长期投入达到年收入30%以上较强，但应先确保现金流为正" />
      </div>
    </ReportSection>

    <ReportSection id="education-report" index="03" title="教育目标准备" description="教育路线已经纳入档案；资金准备度只在费用假设完整时计算。"><div className="health-grid one-up"><HealthPanel metric={metric('education_readiness')} max={100} healthyRange="目标越临近，已准备资金覆盖比例应越高" /></div></ReportSection>

    <section className="report-consult-panel" aria-labelledby="report-consult-title">
      <div className="report-consult-copy">
        <span className="quiet-label">报告专业解读</span>
        <h2 id="report-consult-title">让数字真正成为家庭决策的依据</h2>
        <p>这份报告呈现当前资料下的家庭财务结构。添加 Jojo 微信好友，可预约一对一报告解读，进一步讨论资产配置、现金流安排与家庭目标。</p>
        <div className="report-consult-note"><strong>添加时可备注</strong><span>“家庭财务报告”，便于更快为您安排解读。</span></div>
      </div>
      <div className="wechat-contact-card">
        <div className="wechat-qr-composite">
          <img className="wechat-qr-base" src={wechatQr} alt="Jojo 微信好友二维码" />
          <img className="wechat-qr-badge" src={qrLogoBadge} alt="" aria-hidden="true" />
        </div>
        <strong>扫码添加 Jojo</strong>
        <span>获取报告专业解读与咨询</span>
      </div>
    </section>
  </div>
}

function ReportSection({ id, index, title, description, children }: { id: string; index: string; title: string; description: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return <section className={open ? 'report-section is-open' : 'report-section is-collapsed'} id={id}>
    <header className="report-section-heading"><span>{index}</span><div><h2>{title}</h2><p>{description}</p></div><button className="report-section-toggle" type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>{open ? '收起' : '展开'}<CaretDownIcon className={open ? 'is-open' : ''} size={18} /></button></header>
    {open ? <div className="report-section-content">{children}</div> : null}
  </section>
}

function ComparisonPanel({ title, leftLabel, leftValue, rightLabel, rightValue, resultLabel, resultValue, resultPercent, metric }: { title: string; leftLabel: string; leftValue: number; rightLabel: string; rightValue: number; resultLabel: string; resultValue: number; resultPercent: number | null; metric: MetricResult }) {
  const hasData = leftValue > 0 || rightValue > 0
  const maximum = Math.max(leftValue, rightValue, 1)
  const option: ChartOption = {
    aria: { enabled: true },
    series: [
      { type: 'gauge', startAngle: 180, endAngle: 0, min: 0, max: maximum, center: ['50%', '72%'], radius: '88%', pointer: { show: false }, progress: { show: true, width: 18, roundCap: false, itemStyle: { color: '#c91d2a' } }, axisLine: { lineStyle: { width: 18, color: [[1, '#f3e8e9']] } }, splitLine: { show: false }, axisTick: { show: false }, axisLabel: { show: false }, detail: { show: false }, data: [{ value: leftValue }] },
      { type: 'gauge', startAngle: 180, endAngle: 0, min: 0, max: maximum, center: ['50%', '72%'], radius: '66%', pointer: { show: false }, progress: { show: true, width: 15, roundCap: false, itemStyle: { color: '#efadb2' } }, axisLine: { lineStyle: { width: 15, color: [[1, '#f3eeee']] } }, splitLine: { show: false }, axisTick: { show: false }, axisLabel: { show: false }, detail: { show: false }, data: [{ value: rightValue }] },
    ],
  }
  return <article className={`report-panel comparison-panel level-${metric.level}`}>
    <PanelHeader title={title} metric={metric} />
    <div className="comparison-visual"><EChart option={option} empty={!hasData} /><div className="comparison-result"><span>{resultLabel}</span><strong className={resultValue < 0 ? 'negative-value' : ''}>{hasData ? formatMoney(resultValue) : '—'}</strong>{resultPercent !== null ? <small>{formatPercent(resultPercent)}</small> : null}</div></div>
    <div className="comparison-legend"><span><i className="legend-primary" />{leftLabel}<strong>{formatMoney(leftValue)}</strong></span><span><i className="legend-secondary" />{rightLabel}<strong>{formatMoney(rightValue)}</strong></span></div>
    <MetricNarrative metric={metric} />
  </article>
}

function DistributionPanel({ title, totalLabel, items }: { title: string; totalLabel: string; items: BreakdownItem[] }) {
  const total = items.reduce((sum, item) => sum + item.value, 0)
  const option: ChartOption = { aria: { enabled: true }, tooltip: { trigger: 'item', formatter: (params: unknown) => sourceTooltip(items, params) }, color: items.map((item) => item.color), series: [{ type: 'pie', radius: ['58%', '79%'], center: ['50%', '48%'], itemStyle: { borderColor: '#fff', borderWidth: 3 }, label: { show: false }, data: items }] }
  return <article className="report-panel distribution-panel"><PanelHeader title={title} /><div className="donut-wrap"><EChart option={option} empty={!items.length} /><div className="donut-total"><span>{totalLabel}</span><strong>{items.length ? formatMoney(total) : '—'}</strong></div></div><BreakdownTable items={items} total={total} /></article>
}

function HealthPanel({ metric, max, healthyRange }: { metric: MetricResult; max: number; healthyRange: string }) {
  const value = metric.value === null ? null : Math.max(0, Math.min(max, metric.value))
  const color = levelColor(metric.level)
  const rangeCopy = metric.displayValue === '无负债' ? '当前没有需要覆盖的短期债务' : healthyRange
  const option: ChartOption = { aria: { enabled: true }, series: [{ type: 'gauge', startAngle: 210, endAngle: -30, min: 0, max, splitNumber: 10, radius: '86%', pointer: { show: false }, progress: { show: true, width: 16, itemStyle: { color } }, axisLine: { lineStyle: { width: 16, color: [[1, '#f0eded']] } }, axisTick: { show: false }, splitLine: { distance: -20, length: 8, lineStyle: { width: 2, color: '#fff' } }, axisLabel: { distance: 7, color: '#8c8283', fontSize: 9, formatter: (raw: number) => max === 100 ? `${raw}%` : String(raw) }, detail: { valueAnimation: false, offsetCenter: [0, '8%'], fontSize: 27, fontWeight: 750, color, formatter: () => formatMetric(metric) }, title: { show: false }, data: value === null ? [] : [{ value }] }] }
  return <article className={`report-panel health-panel level-${metric.level}`}><PanelHeader title={metric.label} metric={metric} /><EChart option={option} empty={value === null} compact /><div className="health-result"><strong>{metric.title}</strong><span>{rangeCopy}</span></div><MetricNarrative metric={metric} /></article>
}

function PanelHeader({ title, metric }: { title: string; metric?: MetricResult }) { return <header className="panel-heading"><h3>{title}</h3>{metric ? <span className="level-badge">{levelLabels[metric.level]}</span> : null}</header> }

function MetricNarrative({ metric }: { metric: MetricResult }) {
  const showReference = hasMeaningfulReference(metric.reference)
  return <div className="metric-narrative"><p>{metric.explanation}</p><dl className={showReference ? '' : 'single-column'}><div><dt>公式</dt><dd>{metric.formula}</dd></div>{showReference ? <div><dt>参考区间</dt><dd>{metric.reference}</dd></div> : null}</dl></div>
}

function BreakdownTable({ items, total }: { items: BreakdownItem[]; total: number }) {
  if (!items.length) return <div className="breakdown-empty">暂无可展示的明细</div>
  return <div className="breakdown-table"><div className="breakdown-head"><span>类别</span><span>金额</span><span>占比</span></div>{items.map((item) => <div className="breakdown-row" key={item.name}><span><i style={{ background: item.color }} />{item.name}</span><strong>{formatMoney(item.value)}</strong><span>{total > 0 ? formatPercent(item.value / total * 100) : '暂无'}</span></div>)}</div>
}

function EChart({ option, empty, compact = false }: { option: ChartOption; empty: boolean; compact?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!ref.current || empty) return
    const chart = echarts.init(ref.current, undefined, { renderer: 'svg' })
    chart.setOption(option)
    const observer = new ResizeObserver(() => chart.resize())
    observer.observe(ref.current)
    return () => { observer.disconnect(); chart.dispose() }
  }, [empty, option])
  if (empty) return <div className={compact ? 'chart-empty compact' : 'chart-empty'}><span aria-hidden="true">—</span><small>录入数据后显示图表</small></div>
  return <div className={compact ? 'chart-canvas compact' : 'chart-canvas'} ref={ref} role="img" aria-label="家庭财务分析图表" />
}

function buildAssetBreakdown(customer: CustomerProfile): BreakdownItem[] {
  return groupEntries(customer.assets.map((item) => ({ name: classifyAsset(item.category), value: item.currentValue, source: { label: ownerSourceLabel(customer, item.ownerMemberId, item.name || classifyAsset(item.category)), amount: item.currentValue } })))
}

function groupEntries(entries: BreakdownEntry[]): BreakdownItem[] {
  const grouped = new Map<string, { value: number; sources: BreakdownSource[] }>()
  entries.forEach((entry) => {
    if (entry.value <= 0) return
    const group = grouped.get(entry.name) ?? { value: 0, sources: [] }
    group.value += entry.value
    group.sources.push(entry.source)
    grouped.set(entry.name, group)
  })
  return [...grouped.entries()].sort((a, b) => b[1].value - a[1].value).map(([name, group], index) => ({ name, value: group.value, sources: group.sources, color: palette[index % palette.length] }))
}

function flowSourceLabel(customer: CustomerProfile, memberId: string | null, label: string) {
  const member = memberId ? customer.members.find((item) => item.id === memberId) : null
  return member?.name ? `${member.name} · ${label}` : label
}

function ownerSourceLabel(customer: CustomerProfile, memberId: string | null, label: string) {
  const member = memberId ? customer.members.find((item) => item.id === memberId) : null
  return member?.name ? `${member.name} · ${label}` : label
}

function sourceTooltip(items: BreakdownItem[], params: unknown) {
  const dataIndex = typeof params === 'object' && params && 'dataIndex' in params ? Number((params as { dataIndex: unknown }).dataIndex) : -1
  const item = items[dataIndex]
  if (!item) return ''
  const sources = item.sources.map((source) => `<div class="chart-source-row"><span>${escapeHtml(source.label)}</span><strong>${escapeHtml(formatSourceAmount(source))}</strong></div>`).join('')
  return `<div class="chart-source-tooltip"><div class="chart-source-total"><span><i style="background:${item.color}"></i>${escapeHtml(item.name)}</span><strong>${escapeHtml(formatMoney(item.value))}</strong></div><div class="chart-source-divider"></div><div class="chart-source-caption">原始数据来源</div>${sources}</div>`
}

function formatSourceAmount(source: BreakdownSource) {
  const suffix = source.frequency === 'monthly' ? '/月' : source.frequency === 'quarterly' ? '/季度' : source.frequency === 'yearly' ? '/年' : ''
  return `${formatMoney(source.amount)}${suffix}`
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character] ?? character)
}

function classifyAsset(category: string) { if (category === 'cash') return '现金'; if (category === 'property' || category === 'vehicle') return '固定资产'; if (['bank', 'fund', 'stock', 'bond', 'pension'].includes(category)) return '金融资产'; return '其他资产' }
function classifyIncome(value: string) { if (/工作|工资|经营|佣金|奖金/.test(value)) return '工作收入'; if (/投资|理财|利息|股息|分红/.test(value)) return '理财收入'; return '其他资产收入' }
function classifyExpense(value: string) { if (/投资|储蓄|保险|基金|股票|定投|理财/.test(value)) return '投资支出'; return '生活支出' }

function flowVsDebtMetric(liquid: number, liabilities: number): MetricResult {
  const difference = liquid - liabilities
  if (liquid <= 0 && liabilities <= 0) return customMetric('flow_debt_gap', '流动资产 VS 负债', null, 'neutral', '等待资产负债数据', '尚未录入流动资产或负债。', '补充流动资产与负债余额。', '流动资产 - 总负债', '差值为正表示流动资产可覆盖全部负债')
  if (difference < 0) return customMetric('flow_debt_gap', '流动资产 VS 负债', difference, 'critical', '流动资产低于负债', '若短期需要偿债，家庭可能需要依赖收入或处置长期资产。', '优先增加可变现资金并降低高成本负债。', '流动资产 - 总负债', '差值为正表示流动资产可覆盖全部负债')
  return customMetric('flow_debt_gap', '流动资产 VS 负债', difference, difference >= liabilities ? 'strong' : 'healthy', '流动资产能够覆盖负债', '家庭可变现资产对当前负债形成覆盖。', '继续检查一年内到期债务和现金储备。', '流动资产 - 总负债', '差值为正表示流动资产可覆盖全部负债')
}

function customMetric(key: string, label: string, value: number | null, level: HealthLevel, title: string, explanation: string, action: string, formula: string, reference: string): MetricResult { return { key, label, value, unit: 'currency', level, title, explanation, action, formula, reference } }
function hasMeaningfulReference(reference: string) { return Boolean(reference) && !/不设置统一|不以越低越好|这是集中度指标/.test(reference) }
function levelColor(level: HealthLevel) { return level === 'critical' ? '#a51d27' : level === 'warning' ? '#cf4a52' : level === 'attention' ? '#d98235' : level === 'healthy' ? '#a72a34' : level === 'strong' ? '#7f1119' : '#b9afb0' }
function formatMetric(metric: MetricResult) { if (metric.displayValue) return metric.displayValue; if (metric.value === null) return '资料不足'; if (metric.unit === 'currency') return compactMoney(metric.value); if (metric.unit === 'percent') return `${metric.value.toFixed(1)}%`; if (metric.unit === 'months') return `${metric.value.toFixed(1)}月`; return `${metric.value.toFixed(2)}倍` }
function formatMoney(value: number) { return new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY', maximumFractionDigits: 0 }).format(value) }
function formatPercent(value: number) { return `${value.toFixed(1)}%` }
function compactMoney(value: number) { const abs = Math.abs(value); if (abs >= 10000) return `${value < 0 ? '-' : ''}${(abs / 10000).toFixed(abs >= 100000 ? 0 : 1)}万`; return String(Math.round(value)) }

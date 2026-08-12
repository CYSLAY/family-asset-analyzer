import { useEffect, useMemo, useRef, useState } from 'react'
import * as echarts from 'echarts/core'
import { BarChart, PieChart } from 'echarts/charts'
import { AriaComponent, GridComponent, TooltipComponent } from 'echarts/components'
import { SVGRenderer } from 'echarts/renderers'
import type { ComposeOption } from 'echarts/core'
import type { BarSeriesOption, PieSeriesOption } from 'echarts/charts'
import type { GridComponentOption, TooltipComponentOption } from 'echarts/components'
import { ArrowRightIcon, CaretDownIcon, CheckCircleIcon, InfoIcon, PrinterIcon, WarningCircleIcon } from '@phosphor-icons/react'
import { analyzeCustomer, type HealthLevel, type MetricResult } from '../lib/analysis'
import { useCustomerStore } from '../stores/customerStore'
import type { CustomerProfile } from '../types/domain'

interface Props { onChooseCustomer: () => void }

const levelLabels: Record<HealthLevel, string> = { critical: '紧急', warning: '偏弱', attention: '需关注', healthy: '良好', strong: '较强', neutral: '待判断' }
echarts.use([BarChart, PieChart, AriaComponent, GridComponent, TooltipComponent, SVGRenderer])
type ChartOption = ComposeOption<BarSeriesOption | PieSeriesOption | GridComponentOption | TooltipComponentOption>

export function AnalysisDashboard({ onChooseCustomer }: Props) {
  const { customers, selectedCustomerId } = useCustomerStore()
  const customer = customers.find((item) => item.id === selectedCustomerId) ?? null
  const [topic, setTopic] = useState<'all' | 'balance' | 'cashflow' | 'goals'>('all')
  const analysis = useMemo(() => customer ? analyzeCustomer(customer) : null, [customer])

  if (!customer || !analysis) return <section className="empty-state financial-empty"><InfoIcon size={34} /><h2>请先选择客户</h2><p>分析报告只读取当前客户的原始资料。</p><button className="primary-action compact" type="button" onClick={onChooseCustomer}>选择客户 <ArrowRightIcon size={18} /></button></section>

  const priorityMetrics = analysis.priorityKeys.map((key) => analysis.metrics.find((item) => item.key === key)).filter(Boolean) as MetricResult[]
  const filteredMetrics = analysis.metrics.filter((metric) => topic === 'all' || topic === 'balance' && ['net_worth','debt_ratio','fixed_asset_ratio','liquid_coverage','debt_service_ratio','emergency_months'].includes(metric.key) || topic === 'cashflow' && ['savings_rate','income_concentration'].includes(metric.key) || topic === 'goals' && metric.key === 'education_readiness')

  return <div className="analysis-page">
    <section className="analysis-hero">
      <div>
        <span className="quiet-label">{customer.householdName}的财务诊断</span>
        <h1>结论、原因和行动放在同一页</h1>
        <p>结果由当前原始数据实时计算。参考区间用于识别风险，不代表投资或贷款审批建议。</p>
        <button className="report-print-button" type="button" onClick={() => window.print()}><PrinterIcon size={17} /> 打印或保存 PDF</button>
      </div>
      <div className={`score-block level-${analysis.overallLevel}`}><span>结构健康度</span><strong>{analysis.score ?? '资料不足'}</strong><small>{analysis.score === null ? '已展示当前可计算项目' : '内部启发式，满分 100'}</small></div>
    </section>

    {analysis.score === null ? <section className="positive-banner data-gap-banner"><InfoIcon size={22} weight="fill" /><div><strong>报告已按现有资料生成</strong><p>暂时无法计算的指标会标为“资料不足”，继续录入后会自动更新。</p></div></section> : priorityMetrics.length ? <section className="priority-section"><div className="section-heading plain"><div><h2>优先处理</h2><p>严重问题不会被其他高分项目抵消。</p></div></div><div className="priority-list">{priorityMetrics.map((metric, index) => <article key={metric.key}><span>{index + 1}</span><div><strong>{metric.title}</strong><p>{metric.action}</p></div></article>)}</div></section> : <section className="positive-banner"><CheckCircleIcon size={22} weight="fill" /><div><strong>暂未发现紧急问题</strong><p>仍建议定期更新原始数据，并逐项查看指标依据。</p></div></section>}

    <section className="analysis-charts">
      <ChartPanel title="资产与负债结构"><AssetChart customer={customer} /></ChartPanel>
      <ChartPanel title="年度现金流"><CashFlowChart income={analysis.totals.annualIncome} expenses={analysis.totals.annualExpenses} surplus={analysis.totals.annualSurplus} /></ChartPanel>
    </section>

    <section className="metric-report">
      <div className="report-toolbar"><div><h2>指标解释</h2><p>点击指标查看公式、参考区间和建议。</p></div><div className="topic-tabs" role="tablist">{([['all','全部'],['balance','资产负债'],['cashflow','收支储蓄'],['goals','教育目标']] as const).map(([value,label]) => <button role="tab" aria-selected={topic === value} className={topic === value ? 'is-active' : ''} type="button" key={value} onClick={() => setTopic(value)}>{label}</button>)}</div></div>
      <div className="metric-grid">{filteredMetrics.map((metric) => <MetricCard metric={metric} key={metric.key} />)}</div>
    </section>
  </div>
}

function MetricCard({ metric }: { metric: MetricResult }) {
  const [open, setOpen] = useState(false)
  return <article className={`metric-card level-${metric.level}`}>
    <button className="metric-card-main" type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
      <span className="metric-topline"><span>{metric.label}</span><span className="level-badge">{levelLabels[metric.level]}</span></span>
      <strong>{formatMetric(metric)}</strong>
      <span className="metric-title">{metric.title}</span>
      <p>{metric.explanation}</p>
      <CaretDownIcon className={open ? 'disclosure-icon is-open' : 'disclosure-icon'} size={18} />
    </button>
    {open ? <div className="metric-details"><div><span>计算公式</span><strong>{metric.formula}</strong></div><div><span>参考区间</span><strong>{metric.reference}</strong></div><div className="metric-action"><WarningCircleIcon size={18} /><p>{metric.action}</p></div></div> : null}
  </article>
}

function ChartPanel({ title, children }: { title: string; children: React.ReactNode }) { return <article className="chart-panel"><h2>{title}</h2>{children}</article> }

function AssetChart({ customer }: { customer: CustomerProfile }) {
  const data = [
    { name: '现金与银行', value: customer.assets.filter((a) => a.category === 'cash' || a.category === 'bank').reduce((s,a) => s+a.currentValue,0) },
    { name: '金融资产', value: customer.assets.filter((a) => ['fund','stock','bond','pension'].includes(a.category)).reduce((s,a) => s+a.currentValue,0) },
    { name: '固定资产', value: customer.assets.filter((a) => a.category === 'property' || a.category === 'vehicle').reduce((s,a) => s+a.currentValue,0) },
    { name: '其他资产', value: customer.assets.filter((a) => a.category === 'other' || a.category === 'receivable').reduce((s,a) => s+a.currentValue,0) },
  ].filter((item) => item.value > 0)
  return <EChart option={{ aria: { enabled: true }, tooltip: { trigger: 'item', valueFormatter: (value: unknown) => formatMoney(Number(value)) }, color: ['#cf1f2c','#e36a72','#f0a4aa','#d8d8d8'], series: [{ type:'pie', radius:['54%','78%'], center:['50%','48%'], avoidLabelOverlap:true, itemStyle:{borderColor:'#fff',borderWidth:3}, label:{show:false}, data }] }} empty={!data.length} />
}

function CashFlowChart({ income, expenses, surplus }: { income: number; expenses: number; surplus: number }) {
  return <EChart option={{ aria:{enabled:true}, tooltip:{trigger:'axis',valueFormatter:(value:unknown)=>formatMoney(Number(value))}, grid:{left:8,right:8,top:18,bottom:28,containLabel:true}, xAxis:{type:'category',data:['年收入','年支出','年结余'],axisLine:{show:false},axisTick:{show:false}}, yAxis:{type:'value',show:false}, color:['#cf1f2c'], series:[{type:'bar',barWidth:34,data:[{value:income,itemStyle:{color:'#cf1f2c'}},{value:expenses,itemStyle:{color:'#ef9ca2'}},{value:surplus,itemStyle:{color:surplus<0?'#8f111b':'#b94049'}}],label:{show:true,position:'top',formatter:(item)=>compactMoney(Number(item.value ?? 0))}}] }} empty={income === 0 && expenses === 0} />
}

function EChart({ option, empty }: { option: ChartOption; empty: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!ref.current || empty) return
    const chart = echarts.init(ref.current, undefined, { renderer: 'svg' })
    chart.setOption(option)
    const observer = new ResizeObserver(() => chart.resize())
    observer.observe(ref.current)
    return () => { observer.disconnect(); chart.dispose() }
  }, [empty, option])
  if (empty) return <div className="chart-empty">当前数据不足以绘制图表</div>
  return <div className="chart-canvas" ref={ref} role="img" aria-label="财务分析图表" />
}

function formatMetric(metric: MetricResult) {
  if (metric.value === null) return '资料不足'
  if (metric.unit === 'currency') return formatMoney(metric.value)
  if (metric.unit === 'percent') return `${metric.value.toFixed(1)}%`
  if (metric.unit === 'months') return `${metric.value.toFixed(1)} 个月`
  return `${metric.value.toFixed(2)} 倍`
}
function formatMoney(value: number) { return new Intl.NumberFormat('zh-CN',{style:'currency',currency:'CNY',maximumFractionDigits:0}).format(value) }
function compactMoney(value: number) { const abs=Math.abs(value); if(abs>=10000)return `${value<0?'-':''}${(abs/10000).toFixed(abs>=100000?0:1)}万`; return String(Math.round(value)) }

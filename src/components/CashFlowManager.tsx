import { useMemo, useState, type CSSProperties } from 'react'
import {
  ArrowClockwiseIcon,
  CalculatorIcon,
  UsersThreeIcon,
} from '@phosphor-icons/react'
import {
  buildCashFlowProjection,
  createCashFlowPlanFromCustomer,
  expenseCoverageBand,
  mergeCustomerDataIntoPlan,
} from '../lib/cashFlowPlan'
import { useCustomerStore } from '../stores/customerStore'
import type { CashFlowPlan } from '../types/domain'

interface Props {
  onOpenCustomer: () => void
}

export function CashFlowManager({ onOpenCustomer }: Props) {
  const { customers, selectedCustomerId, selectCustomer, updateCustomer } = useCustomerStore()
  const customer = customers.find((item) => item.id === selectedCustomerId) ?? null
  const plan = useMemo(() => customer ? customer.cashFlowPlan ?? createCashFlowPlanFromCustomer(customer) : null, [customer])
  const rows = useMemo(() => plan ? buildCashFlowProjection(plan) : [], [plan])
  const [displayYears, setDisplayYears] = useState(5)

  function savePlan(next: CashFlowPlan) {
    if (customer) void updateCustomer(customer.id, { cashFlowPlan: next })
  }

  function updatePlan(patch: Partial<CashFlowPlan>) {
    if (!plan) return
    savePlan({ ...plan, ...patch })
  }

  function updateBaseYear(baseYear: number) {
    if (!plan || !Number.isFinite(baseYear)) return
    const shift = baseYear - plan.baseYear
    savePlan({
      ...plan,
      baseYear,
      incomes: plan.incomes.map((item) => ({ ...item, startYear: item.startYear + shift, endYear: item.endYear + shift, yearlyAmounts: shiftYearlyAmounts(item.yearlyAmounts, shift) })),
      expenses: plan.expenses.map((item) => ({ ...item, startYear: item.startYear + shift, endYear: item.endYear + shift, yearlyAmounts: shiftYearlyAmounts(item.yearlyAmounts, shift) })),
    })
  }

  function updateYearAmount(kind: 'incomes' | 'expenses', itemId: string, year: number, value: number) {
    if (!plan) return
    savePlan({
      ...plan,
      [kind]: plan[kind].map((item) => item.id === itemId
        ? { ...item, yearlyAmounts: { ...item.yearlyAmounts, [String(year)]: value } }
        : item),
    })
  }

  if (!customer || !plan) {
    return <div className="cashflow-manager-page">
      <ManagerHeading customers={customers} selectedCustomerId="" onSelect={selectCustomer} />
      <section className="empty-state cashflow-manager-empty">
        <UsersThreeIcon size={34} />
        <h2>选择客户后开始梳理</h2>
        <p>系统会先读取客户已填写的收入、支出、负债和流动资产，缺少的项目可继续手动补充。</p>
        <button className="primary-action compact" type="button" onClick={onOpenCustomer}>前往客户管理</button>
      </section>
    </div>
  }

  const firstRow = rows[0]
  const lastRow = rows[Math.min(displayYears, rows.length) - 1]

  return <div className="cashflow-manager-page">
    <ManagerHeading customers={customers} selectedCustomerId={customer.id} onSelect={selectCustomer} />

    <section className="cashflow-plan-summary" aria-label="现金流梳理摘要">
      <article><span>当前可用资金</span><strong>{formatMoney(plan.initialFunds)}</strong><small>默认读取非房产、非车辆资产</small></article>
      <article><span>首年净现金流</span><strong className={(firstRow?.annualNet ?? 0) < 0 ? 'negative-value' : ''}>{formatMoney(firstRow?.annualNet ?? 0)}</strong><small>总收入减总支出</small></article>
      <article><span>{displayYears} 年后资金</span><strong className={(lastRow?.balanceWithReturn ?? 0) < 0 ? 'negative-value' : ''}>{formatMoney(lastRow?.balanceWithReturn ?? 0)}</strong><small>按年化 {plan.annualReturnRate}% 情景计算</small></article>
    </section>

    <section className="cashflow-settings-panel">
      <div className="cashflow-section-heading">
        <div><CalculatorIcon size={22} /><div><h2>预测基础</h2><p>金额均按年度口径录入，系统自动生成长期现金流时间轴。</p></div></div>
        <button className="subtle-button" type="button" onClick={() => savePlan(mergeCustomerDataIntoPlan(plan, customer))}><ArrowClockwiseIcon size={17} /> 补充档案新增项目</button>
      </div>
      <div className="cashflow-settings-grid">
        <Field label="起始年份"><input type="number" min="2000" max="2100" value={plan.baseYear} onChange={(event) => updateBaseYear(numberValue(event.target.value, plan.baseYear))} /></Field>
        <Field label="当下存量资金"><MoneyInput unit="元" value={plan.initialFunds} onChange={(value) => updatePlan({ initialFunds: value })} /></Field>
      </div>
      <div className="cashflow-member-grid">
        {plan.members.length ? plan.members.map((member, index) => <div className="cashflow-member-field" key={member.id}><span>{member.name || `家庭成员 ${index + 1}`}</span><label><input type="number" min="0" max="110" value={member.baseAge ?? ''} placeholder="年龄" onChange={(event) => updatePlan({ members: plan.members.map((item) => item.id === member.id ? { ...item, baseAge: nullableNumber(event.target.value) } : item) })} /><em>岁</em></label></div>) : <p className="cashflow-inline-note">家庭成员尚未填写出生日期，可先在客户资料中补充，也可直接使用下面的现金流表。</p>}
      </div>
    </section>

    <section className="cashflow-projection-panel">
      <div className="cashflow-section-heading">
        <div><CalculatorIcon size={22} /><div><h2>家庭现金流长期预测</h2><p>收入和支出可在表格中逐年直接修改，调整后自动保存并重新计算。</p></div></div>
        <div className="cashflow-range-controls" aria-label="预测显示区间">
          <button className={displayYears === 5 ? 'is-active' : ''} type="button" onClick={() => setDisplayYears(5)}>5 年</button>
          <button className={displayYears === 10 ? 'is-active' : ''} type="button" onClick={() => setDisplayYears(10)}>10 年</button>
          <details className="cashflow-range-more">
            <summary className={displayYears > 10 ? 'is-active' : ''}>展开长期周期</summary>
            <div>{[20, 30, 40, 55].map((years) => <button className={displayYears === years ? 'is-active' : ''} type="button" key={years} onClick={() => { if (plan.projectionYears < years) updatePlan({ projectionYears: years }); setDisplayYears(years) }}>{years} 年</button>)}</div>
          </details>
        </div>
      </div>
      <ProjectionTable plan={plan} rows={rows.slice(0, displayYears)} onUpdateAmount={updateYearAmount} />
      <details className="cashflow-coverage-guide">
        <summary>覆盖支出率说明与分级依据</summary>
        <div className="cashflow-coverage-guide-body">
          <div><strong>计算口径</strong><p>年度总支出 ÷ 当年收益情景资金 × 100%。数值越低，表示当年支出对收益情景下资金存量的消耗越小；在该年度情景静态不变时，资金可覆盖年数约等于 100 ÷ 覆盖支出率。</p></div>
          <ul aria-label="覆盖支出率等级">
            <li className="coverage-long_term"><i /> <strong>≤ 5%</strong><span>可覆盖20年以上</span></li>
            <li className="coverage-adequate"><i /> <strong>5%–10%</strong><span>可覆盖10–20年</span></li>
            <li className="coverage-medium_term"><i /> <strong>10%–20%</strong><span>可覆盖5–10年</span></li>
            <li className="coverage-limited"><i /> <strong>20%–50%</strong><span>可覆盖2–5年</span></li>
            <li className="coverage-attention"><i /> <strong>&gt; 50%</strong><span>不足2年</span></li>
            <li className="coverage-depleted"><i /> <strong>资金 ≤ 0</strong><span>资金耗尽</span></li>
          </ul>
          <p className="cashflow-coverage-disclaimer">数据条长度按当前显示年份中的最大有效比率进行相对缩放，便于比较年度变化；颜色始终按照上方固定区间判断。收益情景资金小于或等于0时，百分比失去解释意义，系统改为显示“资金耗尽”。目前国内没有针对“年度总支出 ÷ 收益情景资金”的统一标准，上述区间按资金可覆盖年数建立，用于长期现金流规划。中国家庭常用的3–6个月备用金标准只衡量短期流动性，不能替代本指标；工作期家庭还需结合年度净现金流，退休期家庭则应更重视长期覆盖年数。参考：<a href="https://www.cgbchina.com.cn/Info/17775570" target="_blank" rel="noreferrer">广发银行资产配置</a>、<a href="https://group.ccb.com/chn/2021-06/09/article_2021082106144860154.shtml" target="_blank" rel="noreferrer">建设银行家庭财富规划</a>、<a href="https://soe.xmu.edu.cn/zhongguojiatingcaifuyuxiaofeibaogao2025niandisijidu.pdf" target="_blank" rel="noreferrer">中国家庭财富与消费报告</a>。</p>
        </div>
      </details>
      <p className="cashflow-model-note">计算口径：首年资金总额 = 当下存量资金 + 首年净现金流；收益情景资金 =（上年收益情景资金 + 当年净现金流）×（1 + 预期年化收益率）。本表用于现金流情景梳理，不构成收益保证。</p>
    </section>
  </div>
}

function ManagerHeading({ customers, selectedCustomerId, onSelect }: { customers: Array<{ id: string; householdName: string; primaryContactName: string; source?: 'advisor' | 'self_service' }>; selectedCustomerId: string; onSelect: (id: string) => void }) {
  return <header className="cashflow-manager-heading">
    <div><span className="section-kicker">顾问工具</span><h1>现金流管理</h1><p>选择客户，读取已有档案并建立可持续更新的家庭现金流预测。</p></div>
    <label className="cashflow-customer-select"><span>当前客户</span><select value={selectedCustomerId} onChange={(event) => onSelect(event.target.value)}><option value="">请选择客户</option>{customers.map((customer) => <option value={customer.id} key={customer.id}>{customer.householdName || customer.primaryContactName}{customer.source === 'self_service' ? '（客户自填）' : ''}</option>)}</select></label>
  </header>
}

function ProjectionTable({ plan, rows, onUpdateAmount }: { plan: CashFlowPlan; rows: ReturnType<typeof buildCashFlowProjection>; onUpdateAmount: (kind: 'incomes' | 'expenses', itemId: string, year: number, value: number) => void }) {
  const coverageScaleMaximum = coverageBarScaleMaximum(rows.map((row) => row.expenseCoverageRate))
  return <div className="cashflow-table-scroll">
    <table className="cashflow-projection-table">
      <thead>
        <tr><th>年度</th><th>年份</th>{plan.members.map((member) => <th key={member.id}>{member.name}年龄</th>)}{plan.incomes.map((item) => <th key={item.id}>{item.label}</th>)}<th className="cashflow-total-column">总收入</th>{plan.expenses.map((item) => <th key={item.id}>{item.label}</th>)}<th className="cashflow-total-column">总支出</th><th>每年增量资金</th><th>资金总额</th><th>收益情景（{plan.annualReturnRate}%）</th><th>利息差</th><th>覆盖支出率</th></tr>
      </thead>
      <tbody>{rows.map((row) => <tr key={row.year}>
        <td>{row.offset + 1}</td><td>{row.year}</td>{row.memberAges.map((age, index) => <td key={plan.members[index]?.id ?? index}>{age ?? '待补充'}</td>)}{row.incomeValues.map((value, index) => <EditableMoneyCell key={plan.incomes[index].id} label={`${row.year}年${plan.incomes[index].label}`} value={value} onChange={(next) => onUpdateAmount('incomes', plan.incomes[index].id, row.year, next)} />)}<td className="cashflow-total-column">{formatTableMoney(row.totalIncome)}</td>{row.expenseValues.map((value, index) => <EditableMoneyCell key={plan.expenses[index].id} label={`${row.year}年${plan.expenses[index].label}`} value={value} onChange={(next) => onUpdateAmount('expenses', plan.expenses[index].id, row.year, next)} />)}<td className="cashflow-total-column">{formatTableMoney(row.totalExpenses)}</td><td className={row.annualNet < 0 ? 'negative-cell' : ''}>{formatTableMoney(row.annualNet)}</td><td className={row.balanceWithoutReturn < 0 ? 'negative-cell' : ''}>{formatTableMoney(row.balanceWithoutReturn)}</td><td className={row.balanceWithReturn < 0 ? 'negative-cell' : 'return-cell'}>{formatTableMoney(row.balanceWithReturn)}</td><td>{formatTableMoney(row.interestDifference)}</td><CoverageCell value={row.expenseCoverageRate} scaleMaximum={coverageScaleMaximum} depleted={row.balanceWithReturn <= 0} />
      </tr>)}</tbody>
    </table>
  </div>
}

function EditableMoneyCell({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <td className="cashflow-editable-cell"><input aria-label={label} inputMode="decimal" type="number" min="0" step="1000" value={Math.round(value) || ''} onChange={(event) => onChange(numberValue(event.target.value, 0))} /></td>
}

function CoverageCell({ value, scaleMaximum, depleted }: { value: number | null; scaleMaximum: number; depleted: boolean }) {
  if (depleted) return <td className="cashflow-coverage-cell coverage-depleted" title="收益情景资金已小于或等于0，覆盖支出率不再具有可解释性"><span>资金耗尽</span></td>
  const status = expenseCoverageBand(value)
  const fill = value === null ? 0 : Math.min(100, Math.max(0, value / scaleMaximum * 100))
  const years = value && value > 0 ? 100 / value : null
  return <td className={`cashflow-coverage-cell coverage-${status.band}`} title={`${status.label}：${value === null ? '比例暂不可计算' : `年度支出占收益情景资金的${value.toFixed(1)}%，约可覆盖${formatCoverageYears(years)}`}`} style={{ '--coverage-fill': `${fill}%` } as CSSProperties}><span>{value === null ? '暂无' : `${value.toFixed(1)}%`}</span></td>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="field-block"><span>{label}</span>{children}</label> }
function MoneyInput({ value, onChange, unit = '元/年' }: { value: number; onChange: (value: number) => void; unit?: string }) { return <span className="cashflow-number-input"><input type="number" min="0" step="1000" value={value || ''} onChange={(event) => onChange(numberValue(event.target.value, 0))} /><em>{unit}</em></span> }
function numberValue(value: string, fallback: number) { const result = Number(value); return Number.isFinite(result) ? result : fallback }
function nullableNumber(value: string) { if (!value) return null; const result = Number(value); return Number.isFinite(result) ? result : null }
function formatMoney(value: number) { return new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY', maximumFractionDigits: 0 }).format(value) }
function formatTableMoney(value: number) { if (Math.abs(value) < 0.5) return '-'; return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 }).format(value) }
function formatCoverageYears(value: number | null) { return value === null ? '长期' : value >= 100 ? '100年以上' : `${value.toFixed(1)}年` }
function coverageBarScaleMaximum(values: Array<number | null>) {
  const maximum = Math.max(0, ...values.filter((value): value is number => value !== null && Number.isFinite(value)))
  return Math.max(50, Math.ceil(maximum / 25) * 25)
}
function shiftYearlyAmounts(values: Record<string, number> | undefined, shift: number) { return values ? Object.fromEntries(Object.entries(values).map(([year, amount]) => [String(Number(year) + shift), amount])) : undefined }

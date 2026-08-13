import { useMemo, useState } from 'react'
import {
  ArrowClockwiseIcon,
  CalculatorIcon,
  PlusIcon,
  TrashIcon,
  UsersThreeIcon,
} from '@phosphor-icons/react'
import {
  buildCashFlowProjection,
  createCashFlowPlanFromCustomer,
  createPlanItem,
  mergeCustomerDataIntoPlan,
} from '../lib/cashFlowPlan'
import { useCustomerStore } from '../stores/customerStore'
import type { CashFlowPlan, CashFlowPlanItem } from '../types/domain'

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
      incomes: plan.incomes.map((item) => ({ ...item, startYear: item.startYear + shift, endYear: item.endYear + shift })),
      expenses: plan.expenses.map((item) => ({ ...item, startYear: item.startYear + shift, endYear: item.endYear + shift })),
    })
  }

  function updateItems(kind: 'incomes' | 'expenses', items: CashFlowPlanItem[]) {
    if (!plan) return
    savePlan({ ...plan, [kind]: items })
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
        <Field label="长期预测上限"><select value={plan.projectionYears} onChange={(event) => updatePlan({ projectionYears: Number(event.target.value) })}><option value={10}>10 年</option><option value={20}>20 年</option><option value={30}>30 年</option><option value={40}>40 年</option><option value={55}>55 年</option></select></Field>
        <Field label="当下存量资金"><MoneyInput unit="元" value={plan.initialFunds} onChange={(value) => updatePlan({ initialFunds: value })} /></Field>
        <Field label="预期年化收益率"><PercentInput value={plan.annualReturnRate} onChange={(value) => updatePlan({ annualReturnRate: value })} /></Field>
      </div>
      <div className="cashflow-member-grid">
        {plan.members.length ? plan.members.map((member, index) => <div className="cashflow-member-field" key={member.id}><span>{member.name || `家庭成员 ${index + 1}`}</span><label><input type="number" min="0" max="110" value={member.baseAge ?? ''} placeholder="年龄" onChange={(event) => updatePlan({ members: plan.members.map((item) => item.id === member.id ? { ...item, baseAge: nullableNumber(event.target.value) } : item) })} /><em>岁</em></label></div>) : <p className="cashflow-inline-note">家庭成员尚未填写出生日期，可先在客户资料中补充，也可直接使用下面的现金流表。</p>}
      </div>
    </section>

    <div className="cashflow-assumption-grid">
      <PlanItemsEditor title="收入项目" description="已有收入已按原频率折算为年金额" kind="incomes" items={plan.incomes} baseYear={plan.baseYear} projectionYears={plan.projectionYears} onChange={updateItems} />
      <PlanItemsEditor title="支出项目" description="生活支出与月供已自动归类，仍可调整" kind="expenses" items={plan.expenses} baseYear={plan.baseYear} projectionYears={plan.projectionYears} onChange={updateItems} />
    </div>

    <section className="cashflow-projection-panel">
      <div className="cashflow-section-heading">
        <div><CalculatorIcon size={22} /><div><h2>家庭现金流长期预测</h2><p>结构参考《现金流梳理》表，所有结果均由上方假设实时计算。</p></div></div>
        <div className="cashflow-range-controls" aria-label="预测显示区间">
          <button className={displayYears === 5 ? 'is-active' : ''} type="button" onClick={() => setDisplayYears(5)}>5 年</button>
          <button className={displayYears === 10 ? 'is-active' : ''} type="button" onClick={() => setDisplayYears(10)}>10 年</button>
          <details className="cashflow-range-more">
            <summary className={displayYears > 10 ? 'is-active' : ''}>展开长期周期</summary>
            <div>{[20, 30, 40, 55].map((years) => <button className={displayYears === years ? 'is-active' : ''} type="button" key={years} onClick={() => { if (plan.projectionYears < years) updatePlan({ projectionYears: years }); setDisplayYears(years) }}>{years} 年</button>)}</div>
          </details>
        </div>
      </div>
      <ProjectionTable plan={plan} rows={rows.slice(0, displayYears)} />
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

function PlanItemsEditor({ title, description, kind, items, baseYear, projectionYears, onChange }: { title: string; description: string; kind: 'incomes' | 'expenses'; items: CashFlowPlanItem[]; baseYear: number; projectionYears: number; onChange: (kind: 'incomes' | 'expenses', items: CashFlowPlanItem[]) => void }) {
  function update(id: string, patch: Partial<CashFlowPlanItem>) { onChange(kind, items.map((item) => item.id === id ? { ...item, ...patch } : item)) }
  return <section className="cashflow-items-panel">
    <div className="cashflow-items-heading"><div><h2>{title}</h2><p>{description}</p></div><button className="subtle-button" type="button" onClick={() => onChange(kind, [...items, createPlanItem(kind === 'incomes' ? '其他收入' : '其他支出', baseYear, projectionYears)])}><PlusIcon size={16} /> 新增</button></div>
    <div className="cashflow-item-head"><span>项目</span><span>年金额</span><span>年增长率</span><span>起止年份</span><span /></div>
    <div className="cashflow-item-list">
      {items.map((item) => <div className="cashflow-item-row" key={item.id}>
        <label data-label="项目"><input aria-label={`${title}项目名称`} value={item.label} onChange={(event) => update(item.id, { label: event.target.value })} /></label>
        <label data-label="年金额"><MoneyInput value={item.annualAmount} onChange={(value) => update(item.id, { annualAmount: value })} /></label>
        <label data-label="年增长率"><PercentInput value={item.growthRate} onChange={(value) => update(item.id, { growthRate: value })} /></label>
        <label className="cashflow-year-range" data-label="起止年份"><input aria-label="开始年份" type="number" value={item.startYear} onChange={(event) => update(item.id, { startYear: numberValue(event.target.value, baseYear) })} /><span>至</span><input aria-label="结束年份" type="number" value={item.endYear} onChange={(event) => update(item.id, { endYear: numberValue(event.target.value, baseYear + projectionYears - 1) })} /></label>
        <button className="cashflow-item-delete" aria-label={`删除${item.label}`} title="删除项目" type="button" onClick={() => onChange(kind, items.filter((entry) => entry.id !== item.id))}><TrashIcon size={16} /></button>
      </div>)}
    </div>
  </section>
}

function ProjectionTable({ plan, rows }: { plan: CashFlowPlan; rows: ReturnType<typeof buildCashFlowProjection> }) {
  return <div className="cashflow-table-scroll">
    <table className="cashflow-projection-table">
      <thead>
        <tr className="cashflow-group-row"><th colSpan={2 + plan.members.length}>家庭基础信息</th><th colSpan={plan.incomes.length + 1}>收入</th><th colSpan={plan.expenses.length + 1}>支出</th><th colSpan={2}>资金总和</th><th colSpan={3}>收益情景</th></tr>
        <tr><th>年度</th><th>年份</th>{plan.members.map((member) => <th key={member.id}>{member.name}</th>)}{plan.incomes.map((item) => <th key={item.id}>{item.label}</th>)}<th className="cashflow-total-column">总收入</th>{plan.expenses.map((item) => <th key={item.id}>{item.label}</th>)}<th className="cashflow-total-column">总支出</th><th>每年增量资金</th><th>资金总额</th><th>按 {plan.annualReturnRate}%</th><th>利息差</th><th>覆盖支出率</th></tr>
      </thead>
      <tbody>{rows.map((row) => <tr key={row.year}>
        <td>{row.offset + 1}</td><td>{row.year}</td>{row.memberAges.map((age, index) => <td key={plan.members[index]?.id ?? index}>{age ?? '待补充'}</td>)}{row.incomeValues.map((value, index) => <td key={plan.incomes[index].id}>{formatTableMoney(value)}</td>)}<td className="cashflow-total-column">{formatTableMoney(row.totalIncome)}</td>{row.expenseValues.map((value, index) => <td key={plan.expenses[index].id}>{formatTableMoney(value)}</td>)}<td className="cashflow-total-column">{formatTableMoney(row.totalExpenses)}</td><td className={row.annualNet < 0 ? 'negative-cell' : ''}>{formatTableMoney(row.annualNet)}</td><td className={row.balanceWithoutReturn < 0 ? 'negative-cell' : ''}>{formatTableMoney(row.balanceWithoutReturn)}</td><td className={row.balanceWithReturn < 0 ? 'negative-cell' : 'return-cell'}>{formatTableMoney(row.balanceWithReturn)}</td><td>{formatTableMoney(row.interestDifference)}</td><td>{row.expenseCoverageRate === null ? '暂无' : `${row.expenseCoverageRate.toFixed(1)}%`}</td>
      </tr>)}</tbody>
    </table>
  </div>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="field-block"><span>{label}</span>{children}</label> }
function MoneyInput({ value, onChange, unit = '元/年' }: { value: number; onChange: (value: number) => void; unit?: string }) { return <span className="cashflow-number-input"><input type="number" min="0" step="1000" value={value || ''} onChange={(event) => onChange(numberValue(event.target.value, 0))} /><em>{unit}</em></span> }
function PercentInput({ value, onChange }: { value: number; onChange: (value: number) => void }) { return <span className="cashflow-number-input"><input type="number" step="0.1" value={value} onChange={(event) => onChange(numberValue(event.target.value, 0))} /><em>%</em></span> }
function numberValue(value: string, fallback: number) { const result = Number(value); return Number.isFinite(result) ? result : fallback }
function nullableNumber(value: string) { if (!value) return null; const result = Number(value); return Number.isFinite(result) ? result : null }
function formatMoney(value: number) { return new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY', maximumFractionDigits: 0 }).format(value) }
function formatTableMoney(value: number) { if (Math.abs(value) < 0.5) return '-'; return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 }).format(value) }

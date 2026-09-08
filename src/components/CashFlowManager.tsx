import { useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent as ReactDragEvent, type KeyboardEvent } from 'react'
import {
  ArrowClockwiseIcon,
  ArrowsOutIcon,
  CalculatorIcon,
  CaretDownIcon,
  CheckIcon,
  MagnifyingGlassIcon,
  ArrowLeftIcon,
  UsersThreeIcon,
  XIcon,
} from '@phosphor-icons/react'
import {
  buildCashFlowProjection,
  createCashFlowPlanFromCustomer,
  expenseCoverageBand,
  fillYearlyAmountsBelow,
  fillYearlyAmountsRange,
  mergeCustomerDataIntoPlan,
} from '../lib/cashFlowPlan'
import { useCustomerStore } from '../stores/customerStore'
import { PrivateControl, PrivateText } from '../lib/privacy'
import type { CashFlowPlan } from '../types/domain'
import { insuranceSelection, SAVINGS_INSURANCE_PRODUCTS, type SavingsInsuranceProduct } from '../lib/savingsInsurance'

interface Props {
  onOpenCustomer: () => void
  selfService?: boolean
}

export function CashFlowManager({ onOpenCustomer, selfService = false }: Props) {
  const { customers, selectedCustomerId, selectCustomer, updateCustomer } = useCustomerStore()
  const customer = customers.find((item) => item.id === selectedCustomerId) ?? null
  const availableCustomers = selfService ? customers.filter((item) => item.id === selectedCustomerId) : customers
  const plan = useMemo(() => customer ? customer.cashFlowPlan ?? createCashFlowPlanFromCustomer(customer) : null, [customer])
  const rows = useMemo(() => plan ? buildCashFlowProjection(plan) : [], [plan])
  const [displayYears, setDisplayYears] = useState(5)
  const [hideBlankColumns, setHideBlankColumns] = useState(true)
  const [tableExpanded, setTableExpanded] = useState(false)
  const tableDialog = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    if (!tableExpanded) return
    tableDialog.current?.showModal()
    const previousOverflow = document.body.style.overflow
    const closeOnEscape = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape') setTableExpanded(false) }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [tableExpanded])

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

  function applyAmountDown(kind: 'incomes' | 'expenses', itemId: string, sourceYear: number, value: number) {
    if (!plan) return
    const lastYear = plan.baseYear + plan.projectionYears - 1
    if (!confirmBulkOverwrite(kind, itemId, sourceYear, lastYear, value, '向下填充')) return
    savePlan({
      ...plan,
      [kind]: plan[kind].map((item) => item.id === itemId
        ? { ...item, yearlyAmounts: fillYearlyAmountsBelow(item.yearlyAmounts, sourceYear, plan.baseYear, plan.projectionYears, value) }
        : item),
    })
  }

  function fillAmountRange(kind: 'incomes' | 'expenses', itemId: string, sourceYear: number, targetYear: number, value: number) {
    if (!plan || targetYear <= sourceYear) return
    if (!confirmBulkOverwrite(kind, itemId, sourceYear, targetYear, value, '拖动填充')) return
    savePlan({
      ...plan,
      [kind]: plan[kind].map((item) => item.id === itemId
        ? { ...item, yearlyAmounts: fillYearlyAmountsRange(item.yearlyAmounts, sourceYear, targetYear, value) }
        : item),
    })
  }

  function confirmBulkOverwrite(kind: 'incomes' | 'expenses', itemId: string, sourceYear: number, targetYear: number, value: number, action: string) {
    const itemIndex = plan?.[kind].findIndex((item) => item.id === itemId) ?? -1
    if (itemIndex < 0) return false
    const changedExisting = rows.filter((row) => row.year > sourceYear && row.year <= targetYear).filter((row) => {
      const current = kind === 'incomes' ? row.incomeValues[itemIndex] : row.expenseValues[itemIndex]
      return Math.abs(current) >= .5 && Math.abs(current - value) >= .5
    }).length
    return targetYear > sourceYear && window.confirm(`${action}：${sourceYear + 1}–${targetYear} 年，共 ${targetYear - sourceYear} 格；将替换 ${changedExisting} 个不同的非零金额。仅修改本列，填入 ${formatTableMoney(value)} 元，确认继续？`)
  }

  function selectDisplayYears(years: number) {
    if (plan && plan.projectionYears < years) updatePlan({ projectionYears: years })
    setDisplayYears(years)
  }

  if (!customer || !plan) {
    return <div className="cashflow-manager-page">
      <ManagerHeading customers={availableCustomers} selectedCustomerId="" onSelect={selectCustomer} onOpenCustomer={onOpenCustomer} selfService={selfService} />
      <section className="empty-state cashflow-manager-empty">
        <UsersThreeIcon size={34} />
        <h2>{selfService ? '请先完成联系人姓名' : '选择客户后开始梳理'}</h2>
        <p>{selfService ? '填写联系人姓名后，即可读取您的收入、支出、负债和流动资产并生成现金流预测。' : '系统会先读取客户已填写的收入、支出、负债和流动资产，缺少的项目可继续手动补充。'}</p>
        <button className="primary-action compact" type="button" onClick={onOpenCustomer}>{selfService ? '返回资料填写' : '前往客户管理'}</button>
      </section>
    </div>
  }

  const firstRow = rows[0]
  const lastRow = rows[Math.min(displayYears, rows.length) - 1]
  const insurance = insuranceSelection(plan)
  const premium = Math.max(0, plan.savingsInsuranceAnnualPremium ?? 0)
  const firstCashShortfall = rows.find(row => row.insuranceScenarioLiquidBalance < 0)

  return <div className="cashflow-manager-page">
    <ManagerHeading customers={availableCustomers} selectedCustomerId={customer.id} onSelect={selectCustomer} onOpenCustomer={onOpenCustomer} selfService={selfService} />

    <section className="cashflow-plan-summary" aria-label="现金流梳理摘要">
      <article><span>当前可用资金</span><strong>{formatMoney(plan.initialFunds)}</strong><small>默认排除房产、车辆及长期锁定资产</small></article>
      <article><span>首年净现金流</span><strong className={(firstRow?.annualNet ?? 0) < 0 ? 'negative-value' : ''}>{formatMoney(firstRow?.annualNet ?? 0)}</strong><small>总收入减总支出</small></article>
      <article><span>{displayYears} 年后资金</span><strong className={(lastRow?.balanceWithoutReturn ?? 0) < 0 ? 'negative-value' : ''}>{formatMoney(lastRow?.balanceWithoutReturn ?? 0)}</strong><small>按原有收入与日常支出计算</small></article>
    </section>

    {premium > 0 && <p className="cashflow-model-note" role="status">储蓄险场景：{displayYears} 年后可动用资金 {formatMoney(lastRow?.insuranceScenarioLiquidBalance ?? 0)}（不含保单价值）。{firstCashShortfall ? `首次现金不足出现在 ${firstCashShortfall.year} 年，缺口 ${formatMoney(-firstCashShortfall.insuranceScenarioLiquidBalance)}。` : '预测期内未出现现金不足。'}保单价值不等于可无损提取的现金，系统不会自动借款弥补缺口。</p>}
    {customer.liabilities.some(debt => debt.monthlyPayment > 0 && debt.remainingMonths === null) && <p className="cashflow-model-note">部分贷款尚未填写剩余期限，默认按持续月供预测。请补充期限或在表格中调整对应年份。</p>}

    <section className="cashflow-settings-panel">
      <div className="cashflow-section-heading">
        <div><CalculatorIcon size={22} /><div><h2>预测基础</h2><p>金额均按年度口径录入，系统自动生成长期现金流时间轴。</p></div></div>
        <button className="subtle-button" type="button" onClick={() => savePlan(mergeCustomerDataIntoPlan(plan, customer))}><ArrowClockwiseIcon size={17} /> 补充档案新增项目</button>
      </div>
      <div className="cashflow-settings-grid">
        <Field label="起始年份"><input type="number" min="2000" max="2100" value={plan.baseYear} onChange={(event) => updateBaseYear(numberValue(event.target.value, plan.baseYear))} /></Field>
        <Field label="当下存量资金"><MoneyInput unit="元" value={plan.initialFunds} onChange={(value) => updatePlan({ initialFunds: value })} /></Field>
      </div>
      <fieldset className="cashflow-insurance-settings">
        <legend>储蓄险方案</legend>
        <div className="cashflow-insurance-fields">
          <Field label="产品"><select aria-label="产品" value={insurance.product} onChange={(event) => {
            const product = event.target.value as SavingsInsuranceProduct
            updatePlan({ savingsInsuranceProduct: product, savingsInsurancePaymentYears: product === 'prmesp' ? 1 : insurance.paymentYears })
          }}>{Object.entries(SAVINGS_INSURANCE_PRODUCTS).map(([id, product]) => <option key={id} value={id}>{product.name}</option>)}</select></Field>
          <Field label="缴费年限"><select aria-label="缴费年限" value={insurance.paymentYears} onChange={(event) => updatePlan({ savingsInsurancePaymentYears: event.target.value === '1' ? 1 : 5 })}>{SAVINGS_INSURANCE_PRODUCTS[insurance.product].paymentYears.map((years) => <option key={years} value={years}>{years === 1 ? '1 年交清' : '5 年分期'}</option>)}</select></Field>
          <Field label={insurance.paymentYears === 1 ? '一次性投入金额' : '每年投入金额'}><MoneyInput unit={insurance.paymentYears === 1 ? '元' : '元/年'} value={premium} onChange={(value) => updatePlan({ savingsInsuranceAnnualPremium: Math.max(0, value) })} /></Field>
        </div>
        <p className="cashflow-insurance-summary">{insurance.paymentYears === 1 ? '仅首年缴费' : '连续缴费 5 年'}<span>累计投入 <strong>{formatMoney(premium * insurance.paymentYears)}</strong></span></p>
        {insurance.product === 'trst' && insurance.paymentYears === 1 ? <small className="cashflow-setting-help">一次性预缴 5 年保费，金额填写首年总投入。</small> : null}
      </fieldset>
      <div className="cashflow-member-grid">
        {plan.members.length ? plan.members.map((member, index) => <div className="cashflow-member-field" key={member.id}><span><PrivateText>{member.name || `家庭成员 ${index + 1}`}</PrivateText></span><label><PrivateControl><input type="number" min="0" max="110" value={member.baseAge ?? ''} placeholder="年龄" onChange={(event) => updatePlan({ members: plan.members.map((item) => item.id === member.id ? { ...item, baseAge: nullableNumber(event.target.value) } : item) })} /></PrivateControl><em>岁</em></label></div>) : <p className="cashflow-inline-note">家庭成员尚未填写出生日期，可先在客户资料中补充，也可直接使用下面的现金流表。</p>}
      </div>
    </section>

    <section className="cashflow-projection-panel">
      <div className="cashflow-section-heading">
        <div><CalculatorIcon size={22} /><div><h2>家庭现金流长期预测</h2><p>收入和支出可在表格中逐年直接修改，调整后自动保存并重新计算。</p></div></div>
        <div className="cashflow-projection-actions">
          <RangeControls displayYears={displayYears} onSelect={selectDisplayYears} />
          <button className="cashflow-expand-button" type="button" onClick={() => setTableExpanded(true)}><ArrowsOutIcon size={16} /> 放大表格</button>
        </div>
      </div>
      <ProjectionTable plan={plan} rows={rows.slice(0, displayYears)} hideBlankColumns={hideBlankColumns} onToggleBlankColumns={() => setHideBlankColumns((value) => !value)} onUpdateAmount={updateYearAmount} onApplyDown={applyAmountDown} onFillRange={fillAmountRange} />
      <details className="cashflow-coverage-guide">
        <summary>两种场景的资金覆盖率说明</summary>
        <div className="cashflow-coverage-guide-body">
          <div><strong>两个独立计算口径</strong><p>原有资金覆盖率＝日常总支出 ÷ 原场景资金总额。储蓄险场景覆盖率＝日常支出与当年保费之和 ÷ 储蓄险场景资产总额。保费按所选缴费年限扣除；场景资产总额为扣除保费后的流动资金加保单参考余额。</p></div>
          <ul aria-label="覆盖支出率等级">
            <li className="coverage-long_term"><i /> <strong>≤ 5%</strong><span>可覆盖20年以上</span></li>
            <li className="coverage-adequate"><i /> <strong>5%–10%</strong><span>可覆盖10–20年</span></li>
            <li className="coverage-medium_term"><i /> <strong>10%–20%</strong><span>可覆盖5–10年</span></li>
            <li className="coverage-limited"><i /> <strong>20%–50%</strong><span>可覆盖2–5年</span></li>
            <li className="coverage-attention"><i /> <strong>&gt; 50%</strong><span>不足2年</span></li>
            <li className="coverage-depleted"><i /> <strong>资金 ≤ 0</strong><span>资金耗尽</span></li>
          </ul>
          <p className="cashflow-coverage-disclaimer">两列数据条分别按各自在当前显示年份中的最大有效比率进行相对缩放，便于比较年度变化；颜色始终按照上方固定区间判断。对应资金小于或等于0时，百分比失去解释意义，系统改为显示“资金耗尽”。目前国内没有针对这些长期覆盖率的统一标准，上述区间按资金可覆盖年数建立，用于长期现金流规划。中国家庭常用的3-6个月备用金标准只衡量短期流动性，不能替代本指标；工作期家庭还需结合年度净现金流，退休期家庭则应更重视长期覆盖年数。参考：<a href="https://www.cgbchina.com.cn/Info/17775570" target="_blank" rel="noreferrer">广发银行资产配置</a>、<a href="https://group.ccb.com/chn/2021-06/09/article_2021082106144860154.shtml" target="_blank" rel="noreferrer">建设银行家庭财富规划</a>、<a href="https://soe.xmu.edu.cn/zhongguojiatingcaifuyuxiaofeibaogao2025niandisijidu.pdf" target="_blank" rel="noreferrer">中国家庭财富与消费报告</a>。</p>
        </div>
      </details>
      <p className="cashflow-model-note">{insurance.product === 'prmesp' ? '世誉财富：参考 e-1-toolbox-2026-08-03 的 PRMESP 工作表，以优惠后实际供款及逐年余额同比换算。' : insurance.paymentYears === 1 ? '信守明天一次性交：参考同一文件 TRST 工作表的一笔过预缴公式，计入参考预缴折扣，不叠加推广返还。' : '信守明天：5 年交沿用原参考计划（每年 50 万元）。'} 余额包含保证及非保证部分，按参考方案比例折算为人民币，不预测汇率变化。IRR 为持有期间的内部回报率，不作为固定年利率复利。首行为投保当年，对应参考表年期 0；早期未展示的 IRR 留空。实际保单价值以保险公司计划书为准。</p>
    </section>

    {tableExpanded ? <dialog ref={tableDialog} className="cashflow-table-modal-backdrop" style={{ margin: 0, width: '100vw', height: '100dvh', maxWidth: 'none', maxHeight: 'none', border: 0 }} aria-describedby="cashflow-table-dialog-description" aria-labelledby="cashflow-table-dialog-title" onCancel={() => setTableExpanded(false)} onClose={() => setTableExpanded(false)} onMouseDown={event => { if (event.target === event.currentTarget) setTableExpanded(false) }}>
      <section className="cashflow-table-dialog">
        <header className="cashflow-table-dialog-header">
          <div><span className="section-kicker">现金流管理</span><h2 id="cashflow-table-dialog-title">家庭现金流长期预测</h2><p id="cashflow-table-dialog-description">放大模式保留全部编辑功能，修改后会自动保存并重新计算。</p></div>
          <div className="cashflow-table-dialog-actions">
            <RangeControls displayYears={displayYears} onSelect={selectDisplayYears} />
            <button aria-label="关闭放大表格" autoFocus className="cashflow-table-dialog-close" type="button" onClick={() => setTableExpanded(false)}><XIcon size={20} /></button>
          </div>
        </header>
        <div className="cashflow-expanded-table">
          <ProjectionTable plan={plan} rows={rows.slice(0, displayYears)} hideBlankColumns={hideBlankColumns} onToggleBlankColumns={() => setHideBlankColumns((value) => !value)} onUpdateAmount={updateYearAmount} onApplyDown={applyAmountDown} onFillRange={fillAmountRange} />
        </div>
        <footer className="cashflow-table-dialog-footer"><span>当前显示 {displayYears} 年</span><span>{hideBlankColumns ? '已隐藏空白收入与支出列' : '已展开全部收入与支出列'}</span><span>按 Esc 也可关闭</span></footer>
      </section>
    </dialog> : null}
  </div>
}

type CashFlowCustomerOption = { id: string; householdName: string; primaryContactName: string; source?: 'advisor' | 'self_service' }

function ManagerHeading({ customers, selectedCustomerId, onSelect, onOpenCustomer, selfService }: { customers: CashFlowCustomerOption[]; selectedCustomerId: string; onSelect: (id: string) => void; onOpenCustomer: () => void; selfService: boolean }) {
  const selected = customers.find((customer) => customer.id === selectedCustomerId) ?? null
  return <header className="cashflow-manager-heading">
    <div><span className="section-kicker">{selfService ? '家庭财务自测' : '顾问工具'}</span><h1>现金流管理</h1><p>{selfService ? '根据已填写的家庭资料，建立可持续更新的长期现金流预测。' : '选择客户，读取已有档案并建立可持续更新的家庭现金流预测。'}</p></div>
    <div className="cashflow-manager-context">
      {selfService ? <div className="cashflow-self-customer"><span>当前档案</span><strong>{selected?.primaryContactName || selected?.householdName || '我的家庭'}</strong><small>仅显示您的家庭资料</small></div> : <CustomerSearchSelect customers={customers} selectedCustomerId={selectedCustomerId} onSelect={onSelect} />}
      {selected ? <button className="cashflow-return-customer" type="button" onClick={onOpenCustomer}><ArrowLeftIcon size={17} /> {selfService ? '返回我的资料' : '返回客户档案'}</button> : null}
    </div>
  </header>
}

function CustomerSearchSelect({ customers, selectedCustomerId, onSelect }: { customers: CashFlowCustomerOption[]; selectedCustomerId: string; onSelect: (id: string) => void }) {
  const selected = customers.find((customer) => customer.id === selectedCustomerId) ?? null
  const [query, setQuery] = useState(() => selected ? customerOptionLabel(selected) : '')
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const normalizedQuery = query.trim().toLowerCase()
  const filtered = customers.filter((customer) => !normalizedQuery || customerSearchText(customer).includes(normalizedQuery))

  useEffect(() => { setQuery(selected ? customerOptionLabel(selected) : '') }, [selectedCustomerId])
  useEffect(() => { setActiveIndex(0) }, [query])

  function choose(customer: CashFlowCustomerOption) {
    setQuery(customerOptionLabel(customer))
    setOpen(false)
    onSelect(customer.id)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); setActiveIndex((index) => Math.min(filtered.length - 1, index + 1)) }
    if (event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); setActiveIndex((index) => Math.max(0, index - 1)) }
    if (event.key === 'Enter' && open && filtered[activeIndex]) { event.preventDefault(); choose(filtered[activeIndex]) }
    if (event.key === 'Escape') { setOpen(false); setQuery(selected ? customerOptionLabel(selected) : '') }
  }

  return <div className="cashflow-customer-select" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) { setOpen(false); setQuery(selected ? customerOptionLabel(selected) : '') } }}>
    <span>当前客户</span>
    <div className="cashflow-customer-search-control">
      <MagnifyingGlassIcon size={17} />
      <PrivateControl><input aria-autocomplete="list" aria-controls="cashflow-customer-options" aria-expanded={open} aria-label="搜索并选择客户" placeholder="搜索姓名或家庭名称" role="combobox" value={query} onChange={(event) => { setQuery(event.target.value); setOpen(true) }} onFocus={(event) => { event.currentTarget.select(); setOpen(true) }} onKeyDown={handleKeyDown} /></PrivateControl>
      {query ? <button aria-label="清除客户搜索" type="button" onClick={() => { setQuery(''); setOpen(true); onSelect('') }}><XIcon size={14} /></button> : <CaretDownIcon size={14} />}
    </div>
    {open ? <div className="cashflow-customer-options" id="cashflow-customer-options" role="listbox">
      {filtered.length ? filtered.map((customer, index) => <button aria-selected={customer.id === selectedCustomerId} className={index === activeIndex ? 'is-active' : ''} key={customer.id} role="option" type="button" onClick={() => choose(customer)} onMouseEnter={() => setActiveIndex(index)}>
        <span><strong><PrivateText>{customer.householdName || customer.primaryContactName || '未命名客户'}</PrivateText></strong>{customer.householdName && customer.primaryContactName && customer.householdName !== customer.primaryContactName ? <small><PrivateText>{customer.primaryContactName}</PrivateText></small> : null}</span>
        <em>{customer.source === 'self_service' ? '客户自填' : '顾问录入'}</em>
        {customer.id === selectedCustomerId ? <CheckIcon size={15} weight="bold" /> : null}
      </button>) : <p>没有找到匹配的客户</p>}
    </div> : null}
  </div>
}

function customerOptionLabel(customer: CashFlowCustomerOption) { return `${customer.householdName || customer.primaryContactName || '未命名客户'}${customer.source === 'self_service' ? '（客户自填）' : ''}` }
function customerSearchText(customer: CashFlowCustomerOption) { return `${customer.householdName} ${customer.primaryContactName} ${customer.source === 'self_service' ? '客户自填' : '顾问录入'}`.toLowerCase() }

function RangeControls({ displayYears, onSelect }: { displayYears: number; onSelect: (years: number) => void }) {
  const [open, setOpen] = useState(false)
  function choose(years: number) { onSelect(years); setOpen(false) }
  return <div className="cashflow-range-controls" aria-label="预测显示区间">
    <button className={displayYears === 5 ? 'is-active' : ''} type="button" onClick={() => choose(5)}>5 年</button>
    <button className={displayYears === 10 ? 'is-active' : ''} type="button" onClick={() => choose(10)}>10 年</button>
    <details className="cashflow-range-more" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className={displayYears > 10 ? 'is-active' : ''}>展开长期周期</summary>
      <div>{[20, 30, 40, 55].map((years) => <button className={displayYears === years ? 'is-active' : ''} type="button" key={years} onClick={() => choose(years)}>{years} 年</button>)}</div>
    </details>
  </div>
}

type FillDragState = { kind: 'incomes' | 'expenses'; itemId: string; sourceYear: number; targetYear: number; value: number }

function ProjectionTable({ plan, rows, hideBlankColumns, onToggleBlankColumns, onUpdateAmount, onApplyDown, onFillRange }: { plan: CashFlowPlan; rows: ReturnType<typeof buildCashFlowProjection>; hideBlankColumns: boolean; onToggleBlankColumns: () => void; onUpdateAmount: (kind: 'incomes' | 'expenses', itemId: string, year: number, value: number) => void; onApplyDown: (kind: 'incomes' | 'expenses', itemId: string, sourceYear: number, value: number) => void; onFillRange: (kind: 'incomes' | 'expenses', itemId: string, sourceYear: number, targetYear: number, value: number) => void }) {
  const [fillDrag, setFillDrag] = useState<FillDragState | null>(null)
  const insurance = insuranceSelection(plan)
  const showInsurance = (plan.savingsInsuranceAnnualPremium ?? 0) > 0
  const fundsCoverageScaleMaximum = coverageBarScaleMaximum(rows.map((row) => row.fundsExpenseCoverageRate))
  const insuredCoverageScaleMaximum = coverageBarScaleMaximum(rows.map((row) => row.savingsInsuranceCoverageRate))
  const visibleIncomeIndexes = visibleItemIndexes(plan.incomes.length, rows.map((row) => row.incomeValues), hideBlankColumns)
  const visibleExpenseIndexes = visibleItemIndexes(plan.expenses.length, rows.map((row) => row.expenseValues), hideBlankColumns)
  return <div className="cashflow-table-scroll">
    <table className="cashflow-projection-table">
      <thead>
        <tr><th>年度</th><th>年份</th>{plan.members.map((member) => <th key={member.id}><PrivateText>{member.name}</PrivateText>年龄</th>)}{visibleIncomeIndexes.map((index) => <ToggleColumnHeader key={plan.incomes[index].id} label={plan.incomes[index].label} compact={hideBlankColumns} onToggle={onToggleBlankColumns} />)}<ToggleColumnHeader className="cashflow-total-column" label="总收入" compact={hideBlankColumns} onToggle={onToggleBlankColumns} />{visibleExpenseIndexes.map((index) => <ToggleColumnHeader key={plan.expenses[index].id} label={plan.expenses[index].label} compact={hideBlankColumns} onToggle={onToggleBlankColumns} />)}<ToggleColumnHeader className="cashflow-total-column" label="日常总支出" compact={hideBlankColumns} onToggle={onToggleBlankColumns} /><th>每年增量资金</th><th>资金总额</th><th title="日常总支出 ÷ 原场景资金总额">资金覆盖率</th>{showInsurance ? <><th className="insurance-scenario-column insurance-scenario-start" title={`${insurance.name}，${insurance.paymentYears === 1 ? '一次性交费' : '5 年交费'}；主数字为保单参考余额`}><span className="cashflow-scenario-label">{insurance.name} · {insurance.paymentYears === 1 ? '一次性交' : '5 年交'}</span>保单余额 / 当年保费</th><th className="insurance-scenario-column" title="日常总支出加当年保费">含保费总支出</th><th className="insurance-scenario-column" title="扣除保费后的剩余流动资金加保单参考余额">含保单资产总额</th><th className="insurance-scenario-column" title="购买储蓄险后总支出 ÷ 储蓄险场景资产总额">场景覆盖率</th></> : null}</tr>
      </thead>
      <tbody>{rows.map((row) => <tr key={row.year}>
        <td>{row.offset + 1}</td><td>{row.year}</td>{row.memberAges.map((age, index) => <td key={plan.members[index]?.id ?? index}><PrivateText>{age ?? '待补充'}</PrivateText></td>)}{visibleIncomeIndexes.map((index) => <EditableMoneyCell key={plan.incomes[index].id} kind="incomes" itemId={plan.incomes[index].id} year={row.year} label={`${row.year}年${plan.incomes[index].label}`} value={row.incomeValues[index]} fillDrag={fillDrag} onFillDragChange={setFillDrag} onFillRange={onFillRange} onChange={(next) => onUpdateAmount('incomes', plan.incomes[index].id, row.year, next)} onApplyDown={(next) => onApplyDown('incomes', plan.incomes[index].id, row.year, next)} />)}<td className="cashflow-total-column">{formatTableMoney(row.totalIncome)}</td>{visibleExpenseIndexes.map((index) => <EditableMoneyCell key={plan.expenses[index].id} kind="expenses" itemId={plan.expenses[index].id} year={row.year} label={`${row.year}年${plan.expenses[index].label}`} value={row.expenseValues[index]} fillDrag={fillDrag} onFillDragChange={setFillDrag} onFillRange={onFillRange} onChange={(next) => onUpdateAmount('expenses', plan.expenses[index].id, row.year, next)} onApplyDown={(next) => onApplyDown('expenses', plan.expenses[index].id, row.year, next)} />)}<td className="cashflow-total-column">{formatTableMoney(row.totalExpenses)}</td><td className={row.annualNet < 0 ? 'negative-cell' : ''}>{formatTableMoney(row.annualNet)}</td><td className={row.balanceWithoutReturn < 0 ? 'negative-cell' : ''}>{formatTableMoney(row.balanceWithoutReturn)}</td><CoverageCell value={row.fundsExpenseCoverageRate} scaleMaximum={fundsCoverageScaleMaximum} depleted={row.balanceWithoutReturn <= 0} basis="原场景资金总额" />{showInsurance ? <><InsuranceBalanceCell balance={row.savingsInsuranceBalance} premium={row.savingsInsurancePremium} irr={row.savingsInsuranceIrr} /><td className="insurance-scenario-column insurance-expense-cell">{formatTableMoney(row.totalExpensesWithInsurance)}</td><td className={`insurance-scenario-column insurance-assets-cell${row.balanceWithSavingsInsurance < 0 ? ' negative-cell' : ''}`}>{formatTableMoney(row.balanceWithSavingsInsurance)}</td><CoverageCell className="insurance-scenario-column" value={row.savingsInsuranceCoverageRate} scaleMaximum={insuredCoverageScaleMaximum} depleted={row.balanceWithSavingsInsurance <= 0} basis="储蓄险场景资产总额" /></> : null}
      </tr>)}</tbody>
    </table>
  </div>
}

function ToggleColumnHeader({ label, compact, onToggle, className = '' }: { label: string; compact: boolean; onToggle: () => void; className?: string }) {
  const help = compact ? '点击展开全部收入与支出列' : '点击隐藏当前区间内全为空白的收入与支出列'
  return <th className={`${className} cashflow-toggle-column-header`.trim()}><button aria-label={`${label}，${help}`} aria-pressed={compact} data-tooltip={help} type="button" onClick={onToggle}>{label}</button></th>
}

function EditableMoneyCell({ kind, itemId, year, label, value, fillDrag, onFillDragChange, onFillRange, onChange, onApplyDown }: { kind: 'incomes' | 'expenses'; itemId: string; year: number; label: string; value: number; fillDrag: FillDragState | null; onFillDragChange: (state: FillDragState | null) => void; onFillRange: (kind: 'incomes' | 'expenses', itemId: string, sourceYear: number, targetYear: number, value: number) => void; onChange: (value: number) => void; onApplyDown: (value: number) => void }) {
  const sameColumn = fillDrag?.kind === kind && fillDrag.itemId === itemId
  const inFillRange = fillDrag !== null && sameColumn && year > fillDrag.sourceYear && year <= fillDrag.targetYear
  function startFill(event: ReactDragEvent<HTMLButtonElement>) {
    event.dataTransfer.effectAllowed = 'copy'
    event.dataTransfer.setData('text/plain', `${kind}:${itemId}:${year}`)
    onFillDragChange({ kind, itemId, sourceYear: year, targetYear: year, value })
  }
  function dragOver(event: ReactDragEvent<HTMLTableCellElement>) {
    if (!sameColumn || !fillDrag || year <= fillDrag.sourceYear) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    if (fillDrag.targetYear !== year) onFillDragChange({ ...fillDrag, targetYear: year })
  }
  function dropFill(event: ReactDragEvent<HTMLTableCellElement>) {
    if (!sameColumn || !fillDrag || year <= fillDrag.sourceYear) return
    event.preventDefault()
    onFillRange(kind, itemId, fillDrag.sourceYear, year, fillDrag.value)
    onFillDragChange(null)
  }
  return <td className={`cashflow-editable-cell${inFillRange ? ' is-fill-target' : ''}`} onDragOver={dragOver} onDrop={dropFill}><input aria-label={label} inputMode="decimal" type="number" min="0" step="1000" value={Math.round(value) || ''} onChange={(event) => onChange(numberValue(event.target.value, 0))} /><button className="cashflow-apply-down" aria-label={`将${label}的金额应用到下方年份`} data-tooltip="仅覆盖当前年份之后的该项目金额" type="button" onClick={() => onApplyDown(value)}>向下</button><button className="cashflow-fill-handle" aria-label={`向下拖动复制${label}`} data-tooltip="沿当前列向下拖动，复制到松开位置" draggable type="button" onDragStart={startFill} onDragEnd={() => onFillDragChange(null)} /></td>
}

function InsuranceBalanceCell({ balance, premium, irr }: { balance: number; premium: number; irr: number | null }) {
  const detail = [`参考余额 ${formatMoney(balance)}`]
  if (premium > 0) detail.push(`本年支出 ${formatMoney(premium)}`)
  if (irr !== null) detail.push(`参考 IRR ${irr.toFixed(1)}%`)
  return <td className="cashflow-insurance-cell insurance-scenario-column insurance-scenario-start" title={detail.join('；')}><strong>{formatTableMoney(balance)}</strong>{premium > 0 ? <small>支出 {formatTableMoney(premium)}</small> : null}{irr !== null ? <em>IRR {irr.toFixed(1)}%</em> : null}</td>
}

function CoverageCell({ value, scaleMaximum, depleted, basis, className = '' }: { value: number | null; scaleMaximum: number; depleted: boolean; basis: string; className?: string }) {
  if (depleted) return <td className={`${className} cashflow-coverage-cell coverage-depleted`.trim()} title={`${basis}已小于或等于0，覆盖率不再具有可解释性`}><span>资金耗尽</span></td>
  const status = expenseCoverageBand(value)
  const fill = value === null ? 0 : Math.min(100, Math.max(0, value / scaleMaximum * 100))
  const years = value && value > 0 ? 100 / value : null
  return <td className={`${className} cashflow-coverage-cell coverage-${status.band}`.trim()} title={`${status.label}：${value === null ? '比例暂不可计算' : `年度支出占${basis}的${value.toFixed(1)}%，约可覆盖${formatCoverageYears(years)}`}`} style={{ '--coverage-fill': `${fill}%` } as CSSProperties}><span>{value === null ? '暂无' : `${value.toFixed(1)}%`}</span></td>
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
function visibleItemIndexes(count: number, values: number[][], hideBlank: boolean) { return Array.from({ length: count }, (_, index) => index).filter((index) => !hideBlank || values.some((row) => Math.abs(row[index] ?? 0) >= .5)) }
function shiftYearlyAmounts(values: Record<string, number> | undefined, shift: number) { return values ? Object.fromEntries(Object.entries(values).map(([year, amount]) => [String(Number(year) + shift), amount])) : undefined }

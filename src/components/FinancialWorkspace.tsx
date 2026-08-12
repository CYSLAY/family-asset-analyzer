import { useState } from 'react'
import { ArrowRightIcon, PlusIcon, TrashIcon, UsersThreeIcon } from '@phosphor-icons/react'
import {
  createAsset,
  createCashFlow,
  createEducationGoal,
  createLiability,
  educationStageDefaults,
  type AssetEntry,
  type CashFlowEntry,
  type CustomerProfile,
  type EducationGoal,
  type EducationStagePlan,
  type LiabilityEntry,
} from '../types/domain'
import { useCustomerStore } from '../stores/customerStore'

export type FinancialSection = 'fixed' | 'liquid' | 'cashflow' | 'goals'

interface Props {
  section: FinancialSection
  onChooseCustomer: () => void
}

const assetLabels = { cash: '现金', bank: '银行存款与理财', fund: '基金', stock: '股票', bond: '债券', property: '房产', vehicle: '车辆', pension: '养老金与公积金', receivable: '私人债权', other: '其他资产' }
const fixedAssetLabels = { property: '房产', vehicle: '车辆' }
const liquidAssetLabels = { cash: '现金', bank: '银行存款与理财', fund: '基金', stock: '股票', bond: '债券', pension: '养老金与公积金', receivable: '私人债权', other: '其他资产' }
const liabilityLabels = { mortgage: '房贷', car_loan: '车贷', consumer_loan: '消费贷款', credit_card: '信用卡', private_loan: '私人借款', other: '其他负债' }
const frequencyLabels = { monthly: '每月', quarterly: '每季度', yearly: '每年' }
const educationRoutes = ['公立', '私立', '留学']
const popularDestinations = ['香港', '英国', '美国']
const otherDestinations = ['新加坡', '加拿大', '澳大利亚', '新西兰', '日本', '韩国', '德国', '法国', '瑞士', '爱尔兰', '荷兰', '其他国家或地区']
const educationYearOptions = Array.from({ length: 12 }, (_, index) => index + 1)

function normalizedEducationChoice(value: string) {
  if (!value) return { route: '', destination: '' }
  if (educationRoutes.includes(value)) return { route: value, destination: '' }
  const destination = [...popularDestinations, ...otherDestinations].find((item) => value.includes(item.replace('其他国家或地区', '其他')))
  if (destination && destination !== '其他国家或地区' && !value.includes('中国')) return { route: '留学', destination }
  if (value.includes('公立') || value === '中国') return { route: '公立', destination: '' }
  if (value.includes('私立')) return { route: '私立', destination: '' }
  return { route: '', destination: '' }
}

export function FinancialWorkspace({ section, onChooseCustomer }: Props) {
  const { customers, selectedCustomerId, updateCustomer } = useCustomerStore()
  const customer = customers.find((item) => item.id === selectedCustomerId) ?? null

  if (!customer) {
    return <section className="empty-state financial-empty"><UsersThreeIcon size={34} /><h2>请先选择客户</h2><p>所有资产、负债和收支都必须归属于一份客户档案。</p><button className="primary-action compact" type="button" onClick={onChooseCustomer}>选择客户 <ArrowRightIcon size={18} /></button></section>
  }

  if (section === 'fixed' || section === 'liquid') return <BalanceEditor mode={section} customer={customer} onUpdate={(patch) => updateCustomer(customer.id, patch)} />
  if (section === 'cashflow') return <CashFlowEditor customer={customer} onUpdate={(patch) => updateCustomer(customer.id, patch)} />
  return <GoalEditor customer={customer} onUpdate={(patch) => updateCustomer(customer.id, patch)} />
}

function BalanceEditor({ customer, onUpdate, mode }: EditorProps & { mode: 'fixed' | 'liquid' }) {
  function updateAsset(id: string, patch: Partial<AssetEntry>) { onUpdate({ assets: customer.assets.map((item) => item.id === id ? { ...item, ...patch } : item) }) }
  function updateLiability(id: string, patch: Partial<LiabilityEntry>) { onUpdate({ liabilities: customer.liabilities.map((item) => item.id === id ? { ...item, ...patch } : item) }) }
  const totalAssets = customer.assets.reduce((sum, item) => sum + item.currentValue, 0)
  const totalLiabilities = customer.liabilities.reduce((sum, item) => sum + item.balance, 0)
  const isFixed = (asset: AssetEntry) => asset.category === 'property' || asset.category === 'vehicle'
  const visibleAssets = customer.assets.filter((asset) => mode === 'fixed' ? isFixed(asset) : !isFixed(asset))
  const visibleAssetTotal = visibleAssets.reduce((sum, item) => sum + item.currentValue, 0)
  const addAsset = () => {
    const asset = createAsset()
    if (mode === 'fixed') Object.assign(asset, { category: 'property', liquidity: 'long_term', availableForEmergency: false })
    onUpdate({ assets: [...customer.assets, asset] })
  }

  return <div className="financial-page">
    <PageTitle title={mode === 'fixed' ? '固定资产' : '流动资产与负债'} description={mode === 'fixed' ? '记录房产、车辆等长期持有资产的当前市值与权属。' : '记录可变现资金和每笔债务，供流动性与偿债压力分析使用。'} />
    <SummaryLine items={mode === 'fixed' ? [['固定资产合计', visibleAssetTotal], ['家庭总资产', totalAssets]] : [['流动资产', visibleAssetTotal], ['总负债', totalLiabilities], ['流动资产减负债', visibleAssetTotal - totalLiabilities]]} />
    <EntrySection title={mode === 'fixed' ? '房产与车辆' : '现金及金融资产'} description={mode === 'fixed' ? '每项资产独立记录，后续可准确计算固定资产占比。' : '包括现金、存款、基金、股票、债券、公积金及其他可变现资产。'} action={mode === 'fixed' ? '添加固定资产' : '添加流动资产'} onAdd={addAsset}>
      {visibleAssets.length ? visibleAssets.map((asset) => <article className="entry-card" key={asset.id}>
        <EntryHeader name={asset.name || assetLabels[asset.category]} onDelete={() => onUpdate({ assets: customer.assets.filter((item) => item.id !== asset.id) })} />
        <div className="form-grid four-columns">
          <Field label="资产名称"><input value={asset.name} onChange={(e) => updateAsset(asset.id, { name: e.target.value })} placeholder="例如：自住房" /></Field>
          <Field label="资产类型"><select value={asset.category} onChange={(e) => updateAsset(asset.id, { category: e.target.value as AssetEntry['category'] })}>{options(mode === 'fixed' ? fixedAssetLabels : liquidAssetLabels)}</select></Field>
          <MoneyField label="当前价值" value={asset.currentValue} onChange={(value) => updateAsset(asset.id, { currentValue: value })} />
          <Field label="所属成员"><select value={asset.ownerMemberId ?? ''} onChange={(e) => updateAsset(asset.id, { ownerMemberId: e.target.value || null })}><option value="">家庭共有</option>{memberOptions(customer)}</select></Field>
          <Field label="变现速度"><select value={asset.liquidity} onChange={(e) => updateAsset(asset.id, { liquidity: e.target.value as AssetEntry['liquidity'] })}><option value="immediate">随时可用</option><option value="within_month">一个月内</option><option value="long_term">长期资产</option></select></Field>
          <Field label="年收益率（可选）"><input type="number" value={asset.annualReturnRate ?? ''} onChange={(e) => updateAsset(asset.id, { annualReturnRate: nullableNumber(e.target.value) })} /><span className="input-suffix">%</span></Field>
          <label className="checkbox-field span-two"><input type="checkbox" checked={asset.availableForEmergency} onChange={(e) => updateAsset(asset.id, { availableForEmergency: e.target.checked })} /><span><strong>可作为应急资金</strong><small>将计入现金储备充足度</small></span></label>
        </div>
      </article>) : <InlineEmpty text={mode === 'fixed' ? '如家庭没有房产或车辆，也可以直接确认本步骤。' : '还没有流动资产记录。先从现金或银行账户开始。'} />}
    </EntrySection>

    {mode === 'liquid' ? <EntrySection title="家庭负债" description="余额用于净资产分析，月供和一年内还款用于偿债压力分析。" action="添加负债" onAdd={() => onUpdate({ liabilities: [...customer.liabilities, createLiability()] })}>
      {customer.liabilities.length ? customer.liabilities.map((liability) => <article className="entry-card" key={liability.id}>
        <EntryHeader name={liability.name || liabilityLabels[liability.category]} onDelete={() => onUpdate({ liabilities: customer.liabilities.filter((item) => item.id !== liability.id) })} />
        <div className="form-grid four-columns">
          <Field label="负债名称"><input value={liability.name} onChange={(e) => updateLiability(liability.id, { name: e.target.value })} placeholder="例如：住房贷款" /></Field>
          <Field label="负债类型"><select value={liability.category} onChange={(e) => updateLiability(liability.id, { category: e.target.value as LiabilityEntry['category'] })}>{options(liabilityLabels)}</select></Field>
          <MoneyField label="当前余额" value={liability.balance} onChange={(value) => updateLiability(liability.id, { balance: value })} />
          <MoneyField label="每月还款" value={liability.monthlyPayment} onChange={(value) => updateLiability(liability.id, { monthlyPayment: value })} />
          <Field label="年利率（可选）"><input type="number" value={liability.annualInterestRate ?? ''} onChange={(e) => updateLiability(liability.id, { annualInterestRate: nullableNumber(e.target.value) })} /><span className="input-suffix">%</span></Field>
          <Field label="剩余月数"><input type="number" min="0" value={liability.remainingMonths ?? ''} onChange={(e) => updateLiability(liability.id, { remainingMonths: nullableNumber(e.target.value) })} /></Field>
          <MoneyField label="未来一年应还" value={liability.dueWithinOneYear} onChange={(value) => updateLiability(liability.id, { dueWithinOneYear: value })} />
        </div>
      </article>) : <InlineEmpty text="当前没有负债记录。无负债家庭可以保持为空。" />}
    </EntrySection> : null}
  </div>
}

function CashFlowEditor({ customer, onUpdate }: EditorProps) {
  function updateFlow(key: 'incomes' | 'expenses', id: string, patch: Partial<CashFlowEntry>) { onUpdate({ [key]: customer[key].map((item) => item.id === id ? { ...item, ...patch } : item) }) }
  return <div className="financial-page">
    <PageTitle title="收支储蓄" description="每笔金额可按月、季度或年度录入，系统会统一换算为年度现金流。" />
    <SummaryLine items={[['家庭年收入', annualTotal(customer.incomes)], ['家庭年支出', annualTotal(customer.expenses)], ['年度结余', annualTotal(customer.incomes) - annualTotal(customer.expenses)]]} />
    {(['incomes', 'expenses'] as const).map((key) => {
      const isIncome = key === 'incomes'
      return <EntrySection key={key} title={isIncome ? '收入来源' : '家庭支出'} description={isIncome ? '区分工作、经营、投资及其他收入。' : '必要支出会用于计算个性化应急资金目标。'} action={isIncome ? '添加收入' : '添加支出'} onAdd={() => onUpdate({ [key]: [...customer[key], createCashFlow(isIncome ? 'income' : 'expense')] })}>
        {customer[key].length ? customer[key].map((flow) => <article className="entry-card compact-entry" key={flow.id}>
          <EntryHeader name={flow.name || flow.category} onDelete={() => onUpdate({ [key]: customer[key].filter((item) => item.id !== flow.id) })} />
          <div className="form-grid four-columns">
            <Field label="项目名称"><input value={flow.name} onChange={(e) => updateFlow(key, flow.id, { name: e.target.value })} placeholder={isIncome ? '例如：税后工资' : '例如：餐饮日用'} /></Field>
            <Field label="类别"><input value={flow.category} onChange={(e) => updateFlow(key, flow.id, { category: e.target.value })} /></Field>
            <MoneyField label="每期金额" value={flow.amount} onChange={(value) => updateFlow(key, flow.id, { amount: value })} />
            <Field label="发生频率"><select value={flow.frequency} onChange={(e) => updateFlow(key, flow.id, { frequency: e.target.value as CashFlowEntry['frequency'] })}>{options(frequencyLabels)}</select></Field>
            <Field label="归属成员"><select value={flow.memberId ?? ''} onChange={(e) => updateFlow(key, flow.id, { memberId: e.target.value || null })}><option value="">整个家庭</option>{memberOptions(customer)}</select></Field>
            {!isIncome ? <label className="checkbox-field span-two"><input type="checkbox" checked={flow.necessary} onChange={(e) => updateFlow(key, flow.id, { necessary: e.target.checked })} /><span><strong>必要支出</strong><small>生活、住房、医疗、教育和强制偿债等</small></span></label> : null}
          </div>
        </article>) : <InlineEmpty text={isIncome ? '还没有收入记录。' : '还没有支出记录。'} />}
      </EntrySection>
    })}
  </div>
}

function GoalEditor({ customer, onUpdate }: EditorProps) {
  function updateGoal(id: string, patch: Partial<EducationGoal>) { onUpdate({ educationGoals: customer.educationGoals.map((item) => item.id === id ? { ...item, ...patch } : item) }) }
  function plansFor(goal: EducationGoal): EducationStagePlan[] {
    return educationStageDefaults.map((defaultPlan) => {
      const saved = goal.stagePlans?.find((plan) => plan.stage === defaultPlan.stage)
      const legacyRoute = !saved && goal.currentStage === defaultPlan.stage ? goal.targetRoute : ''
      const normalized = normalizedEducationChoice(saved?.route ?? legacyRoute)
      return { ...defaultPlan, ...saved, route: normalized.route, destination: saved?.destination ?? normalized.destination }
    })
  }
  function saveStagePlans(goal: EducationGoal, stagePlans: EducationStagePlan[], activeStage: string) {
    const activePlan = stagePlans.find((plan) => plan.stage === activeStage)
    const firstPlan = activePlan?.route ? activePlan : stagePlans.find((plan) => plan.route)
    updateGoal(goal.id, {
      stagePlans,
      targetRoute: firstPlan?.route === '留学' && firstPlan.destination ? `留学（${firstPlan.destination}）` : firstPlan?.route || '',
      durationYears: activePlan?.durationYears ?? goal.durationYears,
    })
  }
  function updateRoute(goal: EducationGoal, stage: string, route: string) {
    const stagePlans = plansFor(goal).map((plan) => plan.stage === stage
      ? { ...plan, route: plan.route === route ? '' : route, destination: route === '留学' && plan.route !== route ? plan.destination : '' }
      : plan)
    saveStagePlans(goal, stagePlans, stage)
  }
  function updateStageDuration(goal: EducationGoal, stage: string, durationYears: number) {
    saveStagePlans(goal, plansFor(goal).map((plan) => plan.stage === stage ? { ...plan, durationYears } : plan), stage)
  }
  function updateDestination(goal: EducationGoal, stage: string, destination: string) {
    saveStagePlans(goal, plansFor(goal).map((plan) => plan.stage === stage ? { ...plan, route: '留学', destination } : plan), stage)
  }
  return <div className="financial-page">
    <PageTitle title="教育期望" description="选择子女与当前阶段，再逐行点选未来教育路线；没有规划的阶段可以留空。" />
    <EntrySection title="子女教育路线" description="每位子女一张路线表，常见阶段年限已经预设，可随时修改资金假设。" action="添加子女规划" onAdd={() => onUpdate({ educationGoals: [...customer.educationGoals, createEducationGoal()] })}>
      {customer.educationGoals.length ? customer.educationGoals.map((goal) => {
        const childName = customer.members.find((member) => member.id === goal.childMemberId)?.name
        return <article className="entry-card education-card" key={goal.id}>
        <EntryHeader name={childName ? `${childName}的教育规划` : '子女教育规划'} onDelete={() => onUpdate({ educationGoals: customer.educationGoals.filter((item) => item.id !== goal.id) })} />
        <div className="form-grid three-columns education-basics">
          <Field label="对应子女"><select value={goal.childMemberId ?? ''} onChange={(e) => updateGoal(goal.id, { childMemberId: e.target.value || null })}><option value="">暂未指定</option>{customer.members.filter((m) => m.relation === '子女').map((m) => <option value={m.id} key={m.id}>{m.name || '未命名子女'}</option>)}</select></Field>
          <Field label="当前教育阶段"><select value={goal.currentStage} onChange={(e) => updateGoal(goal.id, { currentStage: e.target.value })}><option>未开始</option><option>早教</option><option>幼儿园</option><option>小学</option><option>初中</option><option>高中</option><option>本科</option><option>研究生</option><option>已完成</option></select></Field>
          <MoneyField label="其他培训费用／年" value={goal.extraTrainingCostAnnual ?? 0} onChange={(value) => updateGoal(goal.id, { extraTrainingCostAnnual: value })} />
        </div>

        <div className="education-pathway" aria-label="教育路线设置">
          {plansFor(goal).map((plan) => {
            return <div className="education-stage-row" key={plan.stage}>
              <div className="education-stage-label">
                <strong>{plan.stage}</strong>
                <label className="education-duration-control"><span className="sr-only">{plan.stage}年限</span><select value={plan.durationYears} aria-label={`${plan.stage}年限`} onChange={(event) => updateStageDuration(goal, plan.stage, Number(event.target.value))}>{educationYearOptions.map((year) => <option value={year} key={year}>{year} 年</option>)}</select></label>
              </div>
              <div className="education-route-options">
                {educationRoutes.map((route) => <button className={`route-chip ${plan.route === route ? 'is-selected' : ''}`} type="button" key={route} aria-pressed={plan.route === route} onClick={() => updateRoute(goal, plan.stage, route)}>{route}</button>)}
                {plan.route === '留学' ? <label className="education-destination-control"><span className="sr-only">{plan.stage}留学国家或地区</span><select value={plan.destination ?? ''} aria-label={`${plan.stage}留学国家或地区`} onChange={(event) => updateDestination(goal, plan.stage, event.target.value)}>
                  <option value="">选择国家或地区</option>
                  <optgroup label="热门选项">{popularDestinations.map((destination) => <option value={destination} key={destination}>{destination}</option>)}</optgroup>
                  <optgroup label="其他国家和地区">{otherDestinations.map((destination) => <option value={destination} key={destination}>{destination}</option>)}</optgroup>
                </select></label> : null}
              </div>
            </div>
          })}
        </div>

        <div className="education-funding">
          <div className="education-funding-heading"><strong>资金假设（可选）</strong><span>填写后可估算教育资金准备度</span></div>
          <div className="form-grid four-columns">
          <Field label="距离开始年数"><input type="number" min="0" value={goal.yearsUntilStart} onChange={(e) => updateGoal(goal.id, { yearsUntilStart: numberValue(e.target.value) })} /></Field>
          <MoneyField label="当前每年费用" value={goal.annualCostToday} onChange={(value) => updateGoal(goal.id, { annualCostToday: value })} />
          <Field label="学费年增长率"><input type="number" min="0" value={goal.inflationRate} onChange={(e) => updateGoal(goal.id, { inflationRate: numberValue(e.target.value) })} /><span className="input-suffix">%</span></Field>
          <MoneyField label="已准备资金" value={goal.preparedAmount} onChange={(value) => updateGoal(goal.id, { preparedAmount: value })} />
          </div>
        </div>
      </article>}) : <InlineEmpty text="还没有教育规划。可为每位子女分别添加一张路线表。" />}
    </EntrySection>
  </div>
}

interface EditorProps { customer: CustomerProfile; onUpdate: (patch: Partial<CustomerProfile>) => void }
function PageTitle({ title, description }: { title: string; description: string }) { return <section className="directory-heading"><div><h1>{title}</h1><p>{description}</p></div></section> }
function EntrySection({ title, description, action, onAdd, children }: { title: string; description: string; action: string; onAdd: () => void; children: React.ReactNode }) { return <section className="form-section entry-section"><div className="form-section-heading member-heading"><div><h2>{title}</h2><p>{description}</p></div><button className="subtle-button" type="button" onClick={onAdd}><PlusIcon size={18} /> {action}</button></div><div className="member-stack">{children}</div></section> }
function EntryHeader({ name, onDelete }: { name: string; onDelete: () => void }) { return <div className="member-card-heading"><div><span>原始记录</span><strong>{name}</strong></div><button className="icon-button danger" title="删除记录" type="button" onClick={onDelete}><TrashIcon size={18} /></button></div> }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="field-block"><span>{label}</span><div className="input-wrap">{children}</div></label> }
function MoneyField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) { return <Field label={label}><input type="number" min="0" inputMode="decimal" value={value || ''} onChange={(e) => onChange(numberValue(e.target.value))} /><span className="input-suffix">元</span></Field> }
function InlineEmpty({ text }: { text: string }) { return <div className="inline-empty">{text}</div> }
function SummaryLine({ items }: { items: Array<[string, number]> }) { return <section className="metric-strip financial-summary">{items.map(([label, value]) => <article key={label}><span>{label}</span><strong className={value < 0 ? 'negative-value' : ''}>{formatMoney(value)}</strong></article>)}</section> }
function memberOptions(customer: CustomerProfile) { return customer.members.map((member) => <option value={member.id} key={member.id}>{member.name || member.relation}</option>) }
function options(labels: Record<string, string>) { return Object.entries(labels).map(([value, label]) => <option value={value} key={value}>{label}</option>) }
function nullableNumber(value: string) { return value === '' ? null : numberValue(value) }
function numberValue(value: string) { const number = Number(value); return Number.isFinite(number) ? Math.max(0, number) : 0 }
function annualTotal(entries: CashFlowEntry[]) { return entries.reduce((sum, item) => sum + item.amount * (item.frequency === 'monthly' ? 12 : item.frequency === 'quarterly' ? 4 : 1), 0) }
function formatMoney(value: number) { return new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY', maximumFractionDigits: 0 }).format(value) }

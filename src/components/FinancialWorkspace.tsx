import { useState } from 'react'
import { ArrowRightIcon, PlusIcon, TrashIcon, UsersThreeIcon } from '@phosphor-icons/react'
import {
  createAsset,
  createCashFlow,
  createEducationGoal,
  createLiability,
  createMember,
  educationStageDefaults,
  type AssetEntry,
  type CashFlowEntry,
  type CustomerProfile,
  type EducationGoal,
  type EducationStagePlan,
  type LiabilityEntry,
} from '../types/domain'
import { useCustomerStore } from '../stores/customerStore'
import { estimateEducationGoalCash, estimateEducationStage } from '../lib/educationCosts'

export type FinancialSection = 'fixed' | 'liquid' | 'cashflow' | 'goals'

interface Props {
  section: FinancialSection
  onChooseCustomer: () => void
  showSummary?: boolean
}

const assetLabels = { cash: '现金', bank: '银行定期存款', fund: '基金', stock: '股票', bond: '债券', property: '房产', vehicle: '车辆', pension: '养老金与公积金', receivable: '私人债权', other: '其他资产' }
const fixedAssetLabels = { property: '房产', vehicle: '车辆' }
const liquidAssetLabels = { cash: '现金', bank: '银行定期存款', fund: '基金', stock: '股票', bond: '债券', pension: '养老金与公积金', receivable: '私人债权', other: '其他资产' }
const liabilityLabels = { mortgage: '房贷', car_loan: '车贷', consumer_loan: '消费贷款', credit_card: '信用卡', private_loan: '私人借款', other: '其他负债' }
const frequencyLabels = { monthly: '每月', quarterly: '每季度', yearly: '每年' }
const liquidityLabels = { immediate: '随时可用', within_month: '一个月内', long_term: '长期持有' }

type AssetPreset = Pick<AssetEntry, 'name' | 'category' | 'liquidity' | 'availableForEmergency'> & { aliases?: string[] }
type LiabilityPreset = Pick<LiabilityEntry, 'name' | 'category'>
type FlowPreset = Pick<CashFlowEntry, 'name' | 'category' | 'frequency' | 'necessary'> & { aliases?: string[] }

const fixedAssetPresets: AssetPreset[] = [
  { name: '家庭车辆', category: 'vehicle', liquidity: 'long_term', availableForEmergency: false },
]
const liquidAssetPresets: AssetPreset[] = [
  { name: '现金', category: 'cash', liquidity: 'immediate', availableForEmergency: true },
  { name: '银行定期存款', category: 'bank', liquidity: 'within_month', availableForEmergency: true, aliases: ['银行存款与理财'] },
  { name: '货币基金', category: 'fund', liquidity: 'within_month', availableForEmergency: true },
  { name: '基金', category: 'fund', liquidity: 'within_month', availableForEmergency: false },
  { name: '股票', category: 'stock', liquidity: 'within_month', availableForEmergency: false },
  { name: '债券', category: 'bond', liquidity: 'within_month', availableForEmergency: false },
  { name: '养老金与公积金', category: 'pension', liquidity: 'long_term', availableForEmergency: false },
  { name: '专项投资', category: 'other', liquidity: 'long_term', availableForEmergency: false },
  { name: '私人债权', category: 'receivable', liquidity: 'long_term', availableForEmergency: false },
  { name: '保险年金返还', category: 'other', liquidity: 'long_term', availableForEmergency: false },
]
const liabilityPresets: LiabilityPreset[] = [
  { name: '住房贷款', category: 'mortgage' },
  { name: '车辆贷款', category: 'car_loan' },
  { name: '消费贷款', category: 'consumer_loan' },
  { name: '信用卡', category: 'credit_card' },
  { name: '私人借款', category: 'private_loan' },
  { name: '其他负债', category: 'other' },
]
const incomePresets: FlowPreset[] = [
  { name: '税后收入', category: '工作收入', frequency: 'yearly', necessary: false, aliases: ['税后工资', '工作收入'] },
  { name: '奖金、佣金', category: '工作收入', frequency: 'yearly', necessary: false, aliases: ['奖金与佣金'] },
  { name: '住房公积金', category: '住房公积金', frequency: 'monthly', necessary: false },
  { name: '日常提取', category: '经营收入', frequency: 'monthly', necessary: false, aliases: ['经营收入'] },
  { name: '其他收入', category: '其他收入', frequency: 'yearly', necessary: false, aliases: ['投资与理财收入', '租金收入', '养老金及其他收入'] },
]
const expensePresets: FlowPreset[] = [
  { name: '餐饮零食', category: '基本生活', frequency: 'monthly', necessary: true, aliases: ['餐饮日用', '基本生活'] },
  { name: '交通通讯', category: '基本生活', frequency: 'monthly', necessary: true },
  { name: '衣服、美容', category: '可调整支出', frequency: 'yearly', necessary: false, aliases: ['服饰美容'] },
  { name: '娱乐、旅游', category: '可调整支出', frequency: 'yearly', necessary: false, aliases: ['娱乐旅游'] },
  { name: '学习、爱好', category: '教育支出', frequency: 'yearly', necessary: false, aliases: ['子女教育'] },
  { name: '保险', category: '保险保障', frequency: 'yearly', necessary: false, aliases: ['人情往来', '保险保障'] },
  { name: '医疗保健', category: '医疗支出', frequency: 'yearly', necessary: true },
  { name: '其他支出', category: '其他支出', frequency: 'yearly', necessary: false, aliases: ['居住与物业', '投资储蓄'] },
]
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

export function FinancialWorkspace({ section, onChooseCustomer, showSummary = true }: Props) {
  const { customers, selectedCustomerId, updateCustomer } = useCustomerStore()
  const customer = customers.find((item) => item.id === selectedCustomerId) ?? null

  if (!customer) {
    return <section className="empty-state financial-empty"><UsersThreeIcon size={34} /><h2>请先选择客户</h2><p>所有资产、负债和收支都必须归属于一份客户档案。</p><button className="primary-action compact" type="button" onClick={onChooseCustomer}>选择客户 <ArrowRightIcon size={18} /></button></section>
  }

  if (section === 'fixed' || section === 'liquid') return <BalanceEditor mode={section} customer={customer} showSummary={showSummary} onUpdate={(patch) => updateCustomer(customer.id, patch)} />
  if (section === 'cashflow') return <CashFlowEditor customer={customer} showSummary={showSummary} onUpdate={(patch) => updateCustomer(customer.id, patch)} />
  return <GoalEditor customer={customer} onUpdate={(patch) => updateCustomer(customer.id, patch)} />
}

function BalanceEditor({ customer, onUpdate, mode, showSummary }: EditorProps & { mode: 'fixed' | 'liquid'; showSummary: boolean }) {
  const isFixedAsset = (asset: AssetEntry) => asset.category === 'property' || asset.category === 'vehicle'
  const visibleAssets = customer.assets.filter((asset) => mode === 'fixed' ? isFixedAsset(asset) : !isFixedAsset(asset))
  const presets = mode === 'fixed' ? fixedAssetPresets : liquidAssetPresets
  const claimedIds = new Set<string>()
  const rows = presets.map((preset) => {
    const exact = visibleAssets.find((item) => !claimedIds.has(item.id) && (item.name === preset.name || preset.aliases?.includes(item.name)))
    const uniqueCategory = presets.filter((item) => item.category === preset.category).length === 1
    const categoryMatch = uniqueCategory ? visibleAssets.find((item) => !claimedIds.has(item.id) && item.category === preset.category) : undefined
    const entry = exact ?? categoryMatch
    if (entry) claimedIds.add(entry.id)
    return { preset, entry }
  })
  const extraAssets = visibleAssets.filter((item) => !claimedIds.has(item.id))
  const claimedLiabilityIds = new Set<string>()
  const liabilityRows = liabilityPresets.map((preset) => {
    const exact = customer.liabilities.find((item) => !claimedLiabilityIds.has(item.id) && item.name === preset.name)
    const categoryMatch = customer.liabilities.find((item) => !claimedLiabilityIds.has(item.id) && item.category === preset.category)
    const entry = exact ?? categoryMatch
    if (entry) claimedLiabilityIds.add(entry.id)
    return { preset, entry }
  })
  const extraLiabilities = customer.liabilities.filter((item) => !claimedLiabilityIds.has(item.id))
  const visibleTotal = visibleAssets.reduce((sum, item) => sum + item.currentValue, 0)
  const totalAssets = customer.assets.reduce((sum, item) => sum + item.currentValue, 0)
  const totalLiabilities = customer.liabilities.reduce((sum, item) => sum + item.balance, 0)

  function saveAsset(preset: AssetPreset, entry: AssetEntry | undefined, patch: Partial<AssetEntry>) {
    if (entry) onUpdate({ assets: customer.assets.map((item) => item.id === entry.id ? { ...item, ...patch } : item) })
    else onUpdate({ assets: [...customer.assets, { ...createAsset(), ...preset, ...patch }] })
  }
  function saveLiability(preset: LiabilityPreset, entry: LiabilityEntry | undefined, patch: Partial<LiabilityEntry>) {
    if (entry) onUpdate({ liabilities: customer.liabilities.map((item) => item.id === entry.id ? { ...item, ...patch } : item) })
    else onUpdate({ liabilities: [...customer.liabilities, { ...createLiability(), ...preset, ...patch }] })
  }
  function addFixedAsset(category: 'property' | 'vehicle') {
    const asset = createAsset()
    onUpdate({
      assets: [...customer.assets, {
        ...asset,
        name: category === 'property' ? '房产' : '车辆',
        category,
        liquidity: 'long_term',
        availableForEmergency: false,
      }],
    })
  }

  return <div className="financial-page one-screen-editor">
    {showSummary ? <SummaryLine items={mode === 'fixed' ? [['固定资产合计', visibleTotal], ['家庭总资产', totalAssets]] : [['流动资产', visibleTotal], ['总负债', totalLiabilities], ['流动资产减负债', visibleTotal - totalLiabilities]]} /> : null}
    <SheetSection title={mode === 'fixed' ? '房产与车辆' : '现金及金融资产'} description={mode === 'fixed' ? '直接填写家庭车辆；如有房产或其他车辆，可在表格下方新增。' : '直接填写金额与对应选项；已经保存的自定义项目会继续显示在表格末尾。'}>
      <div className={`entry-sheet asset-sheet ${mode === 'fixed' ? 'fixed-sheet' : ''}`}>
        <div className="sheet-row sheet-head"><span>资产项目</span><span>当前价值</span><span>年收益率</span><span>所属成员</span><span>变现速度</span>{mode === 'liquid' ? <span>应急资金</span> : null}</div>
        {rows.map(({ preset, entry }) => <AssetSheetRow key={preset.name} preset={preset} entry={entry} customer={customer} showEmergency={mode === 'liquid'} onChange={(patch) => saveAsset(preset, entry, patch)} />)}
        {extraAssets.map((entry) => <AssetSheetRow key={entry.id} preset={{ name: entry.name || assetLabels[entry.category], category: entry.category, liquidity: entry.liquidity, availableForEmergency: entry.availableForEmergency }} entry={entry} customer={customer} showEmergency={mode === 'liquid'} onChange={(patch) => saveAsset({ name: entry.name, category: entry.category, liquidity: entry.liquidity, availableForEmergency: entry.availableForEmergency }, entry, patch)} onDelete={() => onUpdate({ assets: customer.assets.filter((item) => item.id !== entry.id) })} />)}
        {mode === 'fixed' ? <div className="sheet-add-row">
          <label className="sheet-add-control">
            <PlusIcon size={17} />
            <span className="sr-only">新增资产项目</span>
            <select aria-label="新增资产项目" defaultValue="" onChange={(event) => {
              const category = event.target.value as 'property' | 'vehicle' | ''
              if (category) addFixedAsset(category)
              event.target.value = ''
            }}>
              <option value="" disabled>添加资产项目</option>
              <option value="property">新增房产</option>
              <option value="vehicle">新增车辆</option>
            </select>
          </label>
        </div> : null}
      </div>
    </SheetSection>
    {mode === 'liquid' ? <SheetSection title="家庭负债" description="当前余额、月供与未来一年应还金额会分别用于净资产和短期偿债分析。">
      <div className="entry-sheet liability-sheet">
        <div className="sheet-row sheet-head"><span>负债项目</span><span>当前余额</span><span>每月还款</span><span>年利率</span><span>剩余月数</span><span>未来一年应还</span></div>
        {liabilityRows.map(({ preset, entry }) => <LiabilitySheetRow key={preset.name} preset={preset} entry={entry} onChange={(patch) => saveLiability(preset, entry, patch)} />)}
        {extraLiabilities.map((entry) => <LiabilitySheetRow key={entry.id} preset={{ name: entry.name || liabilityLabels[entry.category], category: entry.category }} entry={entry} onChange={(patch) => saveLiability({ name: entry.name, category: entry.category }, entry, patch)} onDelete={() => onUpdate({ liabilities: customer.liabilities.filter((item) => item.id !== entry.id) })} />)}
      </div>
    </SheetSection> : null}
  </div>
}

function LegacyBalanceEditor({ customer, onUpdate, mode }: EditorProps & { mode: 'fixed' | 'liquid' }) {
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

function CashFlowEditor({ customer, onUpdate, showSummary }: EditorProps & { showSummary: boolean }) {
  const primaryMember = customer.members.find((member) => member.isPrimaryIncomeProvider) ?? customer.members.find((member) => member.relation === '本人') ?? customer.members[0]
  const existingIncomeMemberIds = customer.incomes.map((item) => item.memberId).filter((id): id is string => Boolean(id))
  const hasHouseholdIncome = customer.incomes.some((item) => !item.memberId)
  const [visibleIncomeMembers, setVisibleIncomeMembers] = useState<string[]>(() => Array.from(new Set([
    ...(primaryMember ? [primaryMember.id] : ['household']),
    ...existingIncomeMemberIds,
    ...(hasHouseholdIncome && primaryMember ? ['household'] : []),
  ])))

  function saveFlow(key: 'incomes' | 'expenses', preset: FlowPreset, entry: CashFlowEntry | undefined, patch: Partial<CashFlowEntry>, memberId: string | null = null) {
    if (entry) onUpdate({ [key]: customer[key].map((item) => item.id === entry.id ? { ...item, ...patch } : item) })
    else onUpdate({ [key]: [...customer[key], { ...createCashFlow(key === 'incomes' ? 'income' : 'expense'), ...preset, memberId, ...patch }] })
  }

  function incomeRows(memberKey: string) {
    const memberId = memberKey === 'household' ? null : memberKey
    const memberEntries = customer.incomes.filter((item) => item.memberId === memberId)
    const claimed = new Set<string>()
    const rows = incomePresets.map((preset) => {
      const entry = memberEntries.find((item) => !claimed.has(item.id) && (item.name === preset.name || preset.aliases?.includes(item.name)))
      if (entry) claimed.add(entry.id)
      return { preset, entry }
    })
    return { rows, extras: memberEntries.filter((item) => !claimed.has(item.id)), memberId }
  }

  const expenseClaimed = new Set<string>()
  const expenseRows = expensePresets.map((preset) => {
    const entry = customer.expenses.find((item) => !expenseClaimed.has(item.id) && (item.name === preset.name || preset.aliases?.includes(item.name)))
    if (entry) expenseClaimed.add(entry.id)
    return { preset, entry }
  })
  const extraExpenses = customer.expenses.filter((item) => !expenseClaimed.has(item.id))
  const availableIncomeMembers = customer.members.filter((member) => !visibleIncomeMembers.includes(member.id))

  function addIncomeMember(value: string) {
    if (!value) return
    if (value !== 'new') {
      setVisibleIncomeMembers((ids) => [...ids, value])
      return
    }
    const member = createMember({ relation: '其他' })
    onUpdate({ members: [...customer.members, member] })
    setVisibleIncomeMembers((ids) => [...ids, member.id])
  }

  function updateIncomeMemberName(memberId: string, name: string) {
    onUpdate({ members: customer.members.map((member) => member.id === memberId ? { ...member, name } : member) })
  }

  return <div className="financial-page one-screen-editor">
    {showSummary ? <SummaryLine items={[["家庭年收入", annualTotal(customer.incomes)], ["家庭年支出", annualTotal(customer.expenses)], ["年度结余", annualTotal(customer.incomes) - annualTotal(customer.expenses)]]} /> : null}
    <SheetSection title="收入来源" description="每位成员独立填写，单位固定显示为元/月或元/年。">
      <div className="income-member-list">
        {visibleIncomeMembers.map((memberKey) => {
          const member = customer.members.find((item) => item.id === memberKey)
          const { rows, extras, memberId } = incomeRows(memberKey)
          return <section className="income-member-block" key={memberKey}>
            <div className="income-member-heading"><div>{member ? <label><span className="sr-only">收入成员姓名</span><input aria-label="收入成员姓名" value={member.name} onChange={(event) => updateIncomeMemberName(member.id, event.target.value)} placeholder="填写成员姓名" /></label> : <strong>{memberKey === 'household' ? '家庭共有收入' : '未命名成员'}</strong>}<span>{member?.relation || '家庭'}</span></div>{memberKey !== primaryMember?.id && !extras.length && !rows.some((item) => item.entry) ? <button type="button" onClick={() => setVisibleIncomeMembers((ids) => ids.filter((id) => id !== memberKey))}>移除</button> : null}</div>
            <div className="compact-flow-grid income-flow-grid">
              {rows.map(({ preset, entry }) => <CompactFlowField key={preset.name} label={preset.name} entry={entry} frequency={entry?.frequency ?? preset.frequency} onChange={(amount) => saveFlow('incomes', preset, entry, { amount }, memberId)} />)}
              {extras.map((entry) => <CompactFlowField key={entry.id} label={entry.name || entry.category} entry={entry} frequency={entry.frequency} onChange={(amount) => saveFlow('incomes', { name: entry.name, category: entry.category, frequency: entry.frequency, necessary: entry.necessary }, entry, { amount }, memberId)} onDelete={() => onUpdate({ incomes: customer.incomes.filter((item) => item.id !== entry.id) })} />)}
            </div>
          </section>
        })}
        <label className="add-income-member"><PlusIcon size={17} /><span className="sr-only">添加其他收入成员</span><select value="" onChange={(event) => addIncomeMember(event.target.value)}><option value="">添加其他成员</option>{availableIncomeMembers.map((member) => <option value={member.id} key={member.id}>{member.name || member.relation}</option>)}<option value="new">新建家庭成员</option></select></label>
      </div>
    </SheetSection>
    <SheetSection title="家庭支出" description="按家庭整体填写，常见项目采用参考图中的月度或年度口径。">
      <div className="compact-flow-grid expense-flow-grid">
        {expenseRows.map(({ preset, entry }) => <CompactFlowField key={preset.name} label={preset.name} entry={entry} frequency={entry?.frequency ?? preset.frequency} necessary={entry?.necessary ?? preset.necessary} onChange={(amount) => saveFlow('expenses', preset, entry, { amount })} />)}
        {extraExpenses.map((entry) => <CompactFlowField key={entry.id} label={entry.name || entry.category} entry={entry} frequency={entry.frequency} necessary={entry.necessary} onChange={(amount) => saveFlow('expenses', { name: entry.name, category: entry.category, frequency: entry.frequency, necessary: entry.necessary }, entry, { amount })} onDelete={() => onUpdate({ expenses: customer.expenses.filter((item) => item.id !== entry.id) })} />)}
      </div>
    </SheetSection>
  </div>
}

function LegacyCashFlowEditor({ customer, onUpdate }: EditorProps) {
  function updateFlow(key: 'incomes' | 'expenses', id: string, patch: Partial<CashFlowEntry>) { onUpdate({ [key]: customer[key].map((item) => item.id === id ? { ...item, ...patch } : item) }) }
  return <div className="financial-page">
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
    <EntrySection title="子女教育路线" description="每位子女一张路线表，常见阶段年限已经预设，可随时修改资金假设。" action="添加子女规划" onAdd={() => onUpdate({ educationGoals: [...customer.educationGoals, createEducationGoal()] })}>
      {customer.educationGoals.length ? customer.educationGoals.map((goal) => {
        const childName = customer.members.find((member) => member.id === goal.childMemberId)?.name
        const educationPlans = plansFor(goal)
        const educationCash = estimateEducationGoalCash({ ...goal, stagePlans: educationPlans })
        return <article className="entry-card education-card" key={goal.id}>
        <EntryHeader name={childName ? `${childName}的教育规划` : '子女教育规划'} onDelete={() => onUpdate({ educationGoals: customer.educationGoals.filter((item) => item.id !== goal.id) })} />
        <div className="form-grid three-columns education-basics">
          <Field label="对应子女"><select value={goal.childMemberId ?? ''} onChange={(e) => updateGoal(goal.id, { childMemberId: e.target.value || null })}><option value="">暂未指定</option>{customer.members.filter((m) => m.relation === '子女').map((m) => <option value={m.id} key={m.id}>{m.name || '未命名子女'}</option>)}</select></Field>
          <Field label="当前教育阶段"><select value={goal.currentStage} onChange={(e) => updateGoal(goal.id, { currentStage: e.target.value })}><option>未开始</option><option>早教</option><option>幼儿园</option><option>小学</option><option>初中</option><option>高中</option><option>本科</option><option>研究生</option><option>已完成</option></select></Field>
          <MoneyField label="其他培训费用／年" value={goal.extraTrainingCostAnnual ?? 0} onChange={(value) => updateGoal(goal.id, { extraTrainingCostAnnual: value })} />
        </div>

        <div className="education-pathway" aria-label="教育路线设置">
          {educationPlans.map((plan) => {
            const estimate = estimateEducationStage(plan)
            return <div className="education-stage-row" key={plan.stage}>
              <div className="education-stage-label">
                <strong>{plan.stage}</strong>
                <label className="education-duration-control"><span className="sr-only">{plan.stage}年限</span><select value={plan.durationYears} aria-label={`${plan.stage}年限`} onChange={(event) => updateStageDuration(goal, plan.stage, Number(event.target.value))}>{educationYearOptions.map((year) => <option value={year} key={year}>{year} 年</option>)}</select></label>
              </div>
              <div className="education-route-options">
                {(plan.stage === '早教' ? ['私立'] : educationRoutes.filter((route) => route !== '留学')).map((route) => <button className={`route-chip ${plan.route === route ? 'is-selected' : ''}`} type="button" key={route} aria-pressed={plan.route === route} onClick={() => updateRoute(goal, plan.stage, route)}>{route}</button>)}
                {plan.stage !== '早教' ? <div className={plan.route === '留学' ? 'study-abroad-combo is-active' : 'study-abroad-combo'}>
                  <button className={`route-chip ${plan.route === '留学' ? 'is-selected' : ''}`} type="button" aria-pressed={plan.route === '留学'} onClick={() => updateRoute(goal, plan.stage, '留学')}>留学</button>
                  {plan.route === '留学' ? <label className="education-destination-control"><span className="sr-only">{plan.stage}留学国家或地区</span><select value={plan.destination ?? ''} aria-label={`${plan.stage}留学国家或地区`} onChange={(event) => updateDestination(goal, plan.stage, event.target.value)}>
                    <option value="">地区</option>
                    <optgroup label="热门选项">{popularDestinations.map((destination) => <option value={destination} key={destination}>{destination}</option>)}</optgroup>
                    <optgroup label="其他国家和地区">{otherDestinations.map((destination) => <option value={destination} key={destination}>{destination}</option>)}</optgroup>
                  </select></label> : null}
                </div> : null}
              </div>
              <div className={plan.route ? 'education-stage-estimate has-estimate' : 'education-stage-estimate'} title={estimate.basis || undefined}>
                <strong>{plan.route ? `${formatMoney(estimate.annualTotal)}/年` : '选择路线后估算'}</strong>
                {plan.route
                  ? <>
                    <small>学费／课程 {formatMoney(estimate.annualTuition)} · 食宿／生活 {formatMoney(estimate.annualLiving)}</small>
                    {estimate.oneTimeFees ? <small>一次性入学费 {formatMoney(estimate.oneTimeFees)}</small> : null}
                    <small>{plan.durationYears} 年现金小计 {formatMoney(estimate.cashTotal)}</small>
                  </>
                  : <small>按现价估算</small>}
              </div>
            </div>
          })}
        </div>

        <div className="education-cost-summary" aria-label="教育现金总计">
          <div><span>路线费用</span><strong>{formatMoney(educationCash.routeCashTotal)}</strong></div>
          <div><span>额外培训</span><strong>{formatMoney(educationCash.extraTrainingTotal)}</strong></div>
          <div className="education-cost-total">
            <span>教育现金总计</span>
            <strong>{educationCash.selectedYears ? formatMoney(educationCash.cashTotal) : '待选择路线'}</strong>
            <small>按当前学制和现价估算，标准来自参考图及公开市场中位数；不含未来通胀、汇率波动及奖学金。</small>
          </div>
        </div>

        <div className="education-funding">
          <div className="education-funding-heading"><strong>资金准备（可选）</strong><span>用于计算教育资金准备度与资金缺口</span></div>
          <div className="education-prepared-field">
            <MoneyField label="已准备资金" value={goal.preparedAmount} onChange={(value) => updateGoal(goal.id, { preparedAmount: value })} />
          </div>
        </div>
      </article>}) : <InlineEmpty text="还没有教育规划。可为每位子女分别添加一张路线表。" />}
    </EntrySection>
    <aside className="education-source-note" aria-label="教育费用数据来源">
      <strong>费用估算口径与数据来源</strong>
      <p>估算基准截至 2026 年 8 月，均按人民币现价现金口径展示。国内教育费用结合参考图标准与公立、私立教育常见支出估算；香港留学参考<a href="https://admissions.hku.hk/fees-and-scholarships/fees" target="_blank" rel="noreferrer">香港大学非本地生学费、住宿及生活费</a>；英国参考<a href="https://study-uk.britishcouncil.org/moving-uk/cost-studying" target="_blank" rel="noreferrer">British Council 国际学生学费与生活费区间</a>；美国参考<a href="https://research.collegeboard.org/trends/college-pricing" target="_blank" rel="noreferrer">College Board 2025–26 学年学费、住宿及膳食标准</a>。其他国家和地区采用公开教育费用的市场中位规划值。</p>
      <p>以上结果用于家庭财务规划，不构成学校正式报价；实际费用会因院校、专业、城市、汇率、通胀、奖学金及个人生活方式而变化，请以院校最新公布资料为准。</p>
    </aside>
  </div>
}

interface EditorProps { customer: CustomerProfile; onUpdate: (patch: Partial<CustomerProfile>) => void }
function SheetSection({ title, description, children }: { title: string; description: string; children: React.ReactNode }) { return <section className="form-section sheet-section"><div className="form-section-heading"><h2>{title}</h2><p>{description}</p></div>{children}</section> }
function SheetMoneyInput({ value, onChange, suffix = '元', label, mobileLabel }: { value: number | null; onChange: (value: number) => void; suffix?: string; label: string; mobileLabel?: string }) { return <label className="sheet-input-wrap" data-mobile-label={mobileLabel}><span className="sr-only">{label}</span><input aria-label={label} type="number" min="0" inputMode="decimal" value={value || ''} onChange={(event) => onChange(numberValue(event.target.value))} /><i>{suffix}</i></label> }

function AssetSheetRow({ preset, entry, customer, showEmergency, onChange, onDelete }: { preset: AssetPreset; entry?: AssetEntry; customer: CustomerProfile; showEmergency: boolean; onChange: (patch: Partial<AssetEntry>) => void; onDelete?: () => void }) {
  const value = entry?.currentValue ?? 0
  const displayName = onDelete ? entry?.name || preset.name : preset.name
  return <div className={`sheet-row ${entry ? 'has-data' : ''}`}>
    <div className="sheet-item-label"><strong>{displayName}</strong><small>{assetLabels[entry?.category ?? preset.category]}</small>{onDelete ? <button type="button" aria-label={`删除${displayName}`} onClick={onDelete}><TrashIcon size={14} /></button> : null}</div>
    <SheetMoneyInput label={`${preset.name}当前价值`} mobileLabel="当前价值" value={value} onChange={(currentValue) => onChange({ currentValue })} />
    <SheetMoneyInput label={`${preset.name}年收益率`} mobileLabel="年收益率" suffix="%" value={entry?.annualReturnRate ?? 0} onChange={(annualReturnRate) => onChange({ annualReturnRate })} />
    <label className="sheet-select-wrap" data-mobile-label="所属成员"><span className="sr-only">{preset.name}所属成员</span><select aria-label={`${preset.name}所属成员`} value={entry?.ownerMemberId ?? ''} onChange={(event) => onChange({ ownerMemberId: event.target.value || null })}><option value="">家庭共有</option>{memberOptions(customer)}</select></label>
    <label className="sheet-select-wrap" data-mobile-label="变现速度"><span className="sr-only">{preset.name}变现速度</span><select aria-label={`${preset.name}变现速度`} value={entry?.liquidity ?? preset.liquidity} onChange={(event) => onChange({ liquidity: event.target.value as AssetEntry['liquidity'] })}>{options(liquidityLabels)}</select></label>
    {showEmergency ? <label className="sheet-check" data-mobile-label="应急资金"><input type="checkbox" checked={entry?.availableForEmergency ?? preset.availableForEmergency} onChange={(event) => onChange({ availableForEmergency: event.target.checked })} /><span>计入</span></label> : null}
  </div>
}

function LiabilitySheetRow({ preset, entry, onChange, onDelete }: { preset: LiabilityPreset; entry?: LiabilityEntry; onChange: (patch: Partial<LiabilityEntry>) => void; onDelete?: () => void }) {
  return <div className={`sheet-row ${entry ? 'has-data' : ''}`}>
    <div className="sheet-item-label"><strong>{entry?.name || preset.name}</strong><small>{liabilityLabels[entry?.category ?? preset.category]}</small>{onDelete ? <button type="button" aria-label={`删除${entry?.name || preset.name}`} onClick={onDelete}><TrashIcon size={14} /></button> : null}</div>
    <SheetMoneyInput label={`${preset.name}当前余额`} mobileLabel="当前余额" value={entry?.balance ?? 0} onChange={(balance) => onChange({ balance })} />
    <SheetMoneyInput label={`${preset.name}每月还款`} mobileLabel="每月还款" value={entry?.monthlyPayment ?? 0} onChange={(monthlyPayment) => onChange({ monthlyPayment })} />
    <SheetMoneyInput label={`${preset.name}年利率`} mobileLabel="年利率" suffix="%" value={entry?.annualInterestRate ?? 0} onChange={(annualInterestRate) => onChange({ annualInterestRate })} />
    <label className="sheet-input-wrap" data-mobile-label="剩余月数"><span className="sr-only">{preset.name}剩余月数</span><input aria-label={`${preset.name}剩余月数`} type="number" min="0" value={entry?.remainingMonths ?? ''} onChange={(event) => onChange({ remainingMonths: nullableNumber(event.target.value) })} /><i>月</i></label>
    <SheetMoneyInput label={`${preset.name}未来一年应还`} mobileLabel="一年内应还" value={entry?.dueWithinOneYear ?? 0} onChange={(dueWithinOneYear) => onChange({ dueWithinOneYear })} />
  </div>
}

function CompactFlowField({ label, entry, frequency, necessary, onChange, onDelete }: { label: string; entry?: CashFlowEntry; frequency: CashFlowEntry['frequency']; necessary?: boolean; onChange: (amount: number) => void; onDelete?: () => void }) {
  const unit = frequency === 'monthly' ? '元/月' : frequency === 'quarterly' ? '元/季度' : '元/年'
  return <div className={`compact-flow-field ${entry ? 'has-data' : ''}`}>
    <div className="compact-flow-label"><strong>{label}</strong>{necessary ? <small>必要支出</small> : null}</div>
    <label className="compact-flow-input"><span className="sr-only">{label}（{unit}）</span><input aria-label={`${label}（${unit}）`} type="number" min="0" inputMode="decimal" value={entry?.amount || ''} onChange={(event) => onChange(numberValue(event.target.value))} /><i>{unit}</i></label>
    {onDelete ? <button className="compact-flow-delete" type="button" aria-label={`删除${label}`} onClick={onDelete}><TrashIcon size={14} /></button> : null}
  </div>
}

function CashFlowSheetRow({ preset, entry, customer, showNecessary, onChange, onDelete }: { preset: FlowPreset; entry?: CashFlowEntry; customer: CustomerProfile; showNecessary: boolean; onChange: (patch: Partial<CashFlowEntry>) => void; onDelete?: () => void }) {
  return <div className={`sheet-row ${entry ? 'has-data' : ''}`}>
    <div className="sheet-item-label"><strong>{onDelete ? entry?.name || preset.name : preset.name}</strong><small>{entry?.category || preset.category}</small>{onDelete ? <button type="button" aria-label={`删除${entry?.name || preset.name}`} onClick={onDelete}><TrashIcon size={14} /></button> : null}</div>
    <SheetMoneyInput label={`${preset.name}每期金额`} value={entry?.amount ?? 0} onChange={(amount) => onChange({ amount })} />
    <label className="sheet-select-wrap"><span className="sr-only">{preset.name}频率</span><select aria-label={`${preset.name}频率`} value={entry?.frequency ?? preset.frequency} onChange={(event) => onChange({ frequency: event.target.value as CashFlowEntry['frequency'] })}>{options(frequencyLabels)}</select></label>
    <label className="sheet-select-wrap"><span className="sr-only">{preset.name}归属成员</span><select aria-label={`${preset.name}归属成员`} value={entry?.memberId ?? ''} onChange={(event) => onChange({ memberId: event.target.value || null })}><option value="">整个家庭</option>{memberOptions(customer)}</select></label>
    {showNecessary ? <label className="sheet-check"><input type="checkbox" checked={entry?.necessary ?? preset.necessary} onChange={(event) => onChange({ necessary: event.target.checked })} /><span>必要</span></label> : null}
  </div>
}
function EntrySection({ title, description, action, onAdd, children }: { title: string; description: string; action: string; onAdd: () => void; children: React.ReactNode }) { return <section className="form-section entry-section"><div className="form-section-heading member-heading"><div><h2>{title}</h2><p>{description}</p></div><button className="subtle-button" type="button" onClick={onAdd}><PlusIcon size={18} /> {action}</button></div><div className="member-stack">{children}</div></section> }
function EntryHeader({ name, onDelete }: { name: string; onDelete: () => void }) { return <div className="member-card-heading"><div><span>原始记录</span><strong>{name}</strong></div><button className="icon-button danger" title="删除记录" type="button" onClick={onDelete}><TrashIcon size={18} /></button></div> }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="field-block"><span>{label}</span><div className="input-wrap">{children}</div></label> }
function MoneyField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) { return <Field label={label}><input type="number" min="0" inputMode="decimal" value={value || ''} onChange={(e) => onChange(numberValue(e.target.value))} /><span className="input-suffix">元</span></Field> }
function InlineEmpty({ text }: { text: string }) { return <div className="inline-empty">{text}</div> }
function SummaryLine({ items }: { items: Array<[string, number]> }) { return <section className={`metric-strip financial-summary summary-items-${items.length}`}>{items.map(([label, value]) => <article key={label}><span>{label}</span><strong className={value < 0 ? 'negative-value' : ''}>{formatMoney(value)}</strong></article>)}</section> }
function memberOptions(customer: CustomerProfile) { return customer.members.map((member) => <option value={member.id} key={member.id}>{member.name || member.relation}</option>) }
function options(labels: Record<string, string>) { return Object.entries(labels).map(([value, label]) => <option value={value} key={value}>{label}</option>) }
function nullableNumber(value: string) { return value === '' ? null : numberValue(value) }
function numberValue(value: string) { const number = Number(value); return Number.isFinite(number) ? Math.max(0, number) : 0 }
function annualTotal(entries: CashFlowEntry[]) { return entries.reduce((sum, item) => sum + item.amount * (item.frequency === 'monthly' ? 12 : item.frequency === 'quarterly' ? 4 : 1), 0) }
function formatMoney(value: number) { return new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY', maximumFractionDigits: 0 }).format(value) }

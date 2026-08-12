import { useMemo, useState } from 'react'
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  BuildingsIcon,
  ClipboardTextIcon,
  CurrencyCircleDollarIcon,
  FileTextIcon,
  PlusIcon,
  TrendUpIcon,
  TrashIcon,
  UserPlusIcon,
  UsersThreeIcon,
  WalletIcon,
} from '@phosphor-icons/react'
import { FinancialWorkspace } from './FinancialWorkspace'
import { useCustomerStore } from '../stores/customerStore'
import {
  createMember,
  hasIntakeStepData,
  intakeCompletion,
  type CustomerProfile,
  type FamilyMember,
  type IncomeStability,
  type IntakeStepKey,
} from '../types/domain'

interface Props {
  onOpenReport: () => void
  onOpenCustomers: () => void
}

type IntakeView = 'overview' | IntakeStepKey

const stepMeta: Array<{ key: IntakeStepKey; title: string; description: string; icon: typeof UsersThreeIcon }> = [
  { key: 'profile', title: '客户资料', description: '联系人、所在城市与备注', icon: ClipboardTextIcon },
  { key: 'members', title: '家庭成员', description: '成员关系、年龄、工作及健康情况', icon: UsersThreeIcon },
  { key: 'fixed_assets', title: '固定资产', description: '房产、车辆及其他长期资产', icon: BuildingsIcon },
  { key: 'liquid_assets', title: '流动资产与负债', description: '现金、金融资产、贷款与月供', icon: WalletIcon },
  { key: 'cashflow', title: '生活收支', description: '家庭收入、支出及发生频率', icon: TrendUpIcon },
  { key: 'education', title: '教育期望', description: '教育路线、时间与资金准备', icon: CurrencyCircleDollarIcon },
]

const stabilityLabels: Record<IncomeStability, string> = {
  stable: '固定收入',
  variable: '浮动收入',
  self_employed: '自雇或经营',
  retired: '退休收入',
  none: '暂无收入',
}

const popularCities = ['北京', '上海', '广州', '深圳', '香港']
const otherCities = ['杭州', '成都', '重庆', '天津', '苏州', '南京', '武汉', '西安', '厦门', '青岛', '宁波', '东莞', '佛山', '珠海', '澳门', '台北', '其他城市或地区']

export function IntakeWorkspace({ onOpenReport, onOpenCustomers }: Props) {
  const { customers, selectedCustomerId, selectCustomer, addCustomer, updateCustomer } = useCustomerStore()
  const [view, setView] = useState<IntakeView>('overview')
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const customer = customers.find((item) => item.id === selectedCustomerId) ?? null

  const recentCustomers = useMemo(
    () => customers.slice(0, 6),
    [customers],
  )

  async function createAndStart() {
    if (!newName.trim()) return
    await addCustomer(newName)
    setNewName('')
    setCreating(false)
    setView('profile')
  }

  if (!customer) {
    return <div className="intake-start">
      <section className="intake-start-hero">
        <div>
          <span className="section-kicker">信息录入</span>
          <h1>开始进行家庭财务分析</h1>
          <p>为您量身定制的家庭资产管理计划</p>
        </div>
        <button className="primary-action" type="button" onClick={() => setCreating(true)}><UserPlusIcon size={19} /> 新建客户</button>
      </section>

      {creating ? <section className="new-intake-panel">
        <label className="field-block"><span>主要联系人姓名</span><input autoFocus value={newName} onChange={(event) => setNewName(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && void createAndStart()} placeholder="例如：陈雅雯" /></label>
        <button className="primary-action compact" type="button" disabled={!newName.trim()} onClick={() => void createAndStart()}>建立并开始</button>
        <button className="text-button" type="button" onClick={() => setCreating(false)}>取消</button>
      </section> : null}

      <section className="recent-intakes">
        <div className="content-heading"><div><h2>继续录入</h2><p>选择客户后，可自由进入任何资料模块。</p></div><button className="text-button" type="button" onClick={onOpenCustomers}>查看全部档案</button></div>
        {recentCustomers.length ? <div className="intake-customer-list">
          {recentCustomers.map((item) => <button className="intake-customer-row" type="button" key={item.id} onClick={() => { selectCustomer(item.id); setView('overview') }}>
            <span className="customer-avatar">{item.primaryContactName.slice(0, 1)}</span>
            <span><strong>{item.householdName}</strong><small>{intakeCompletion(item)}% 已填写</small></span>
            <ArrowRightIcon size={18} />
          </button>)}
        </div> : <div className="inline-empty">还没有客户资料。新建客户后即可开始录入。</div>}
      </section>
    </div>
  }

  const filled = new Set(stepMeta.filter((item) => hasIntakeStepData(customer, item.key)).map((item) => item.key))
  const activeMeta = stepMeta.find((item) => item.key === view)

  return <div className="intake-workspace">
    <header className="intake-header">
      <div>
        <button className="back-button" type="button" onClick={() => { selectCustomer(''); setView('overview') }}><ArrowLeftIcon size={17} /> 切换客户</button>
        <h1>{customer.householdName}</h1>
        <p>可自由选择任意模块录入，系统会根据已有内容自动更新填写状态。</p>
      </div>
      <div className="intake-progress-number"><strong>{intakeCompletion(customer)}%</strong><span>模块已有资料</span></div>
    </header>

    <nav className="intake-quick-nav" aria-label="录入模块快速切换">
      <button className={view === 'overview' ? 'quick-nav-item is-active' : 'quick-nav-item'} type="button" onClick={() => setView('overview')}><FileTextIcon size={17} /><span>录入总览</span></button>
      {stepMeta.map((item) => {
        const Icon = item.icon
        return <button className={view === item.key ? 'quick-nav-item is-active' : 'quick-nav-item'} type="button" key={item.key} onClick={() => setView(item.key)}><Icon size={17} /><span>{item.title}</span>{filled.has(item.key) ? <i aria-label="已填写" /> : null}</button>
      })}
      <button className="quick-nav-item report" type="button" onClick={onOpenReport}><FileTextIcon size={17} /><span>分析报告</span></button>
    </nav>

    <div className="intake-layout">
      <main className="intake-content">
        {view === 'overview' ? <IntakeOverview filled={filled} onOpen={setView} onOpenReport={onOpenReport} /> : <>
          <div className="module-content-heading"><div><span className="section-kicker">资料模块</span><h2>{activeMeta?.title}</h2><p>{activeMeta?.description}</p></div><span className={filled.has(view) ? 'confirmation-badge is-done' : 'confirmation-badge'}>{filled.has(view) ? '已填写' : '待确认'}</span></div>
          {view === 'profile' ? <ProfileForm customer={customer} onUpdate={(patch) => updateCustomer(customer.id, patch)} /> : null}
          {view === 'members' ? <MemberForm customer={customer} /> : null}
          {view === 'fixed_assets' ? <FinancialWorkspace section="fixed" onChooseCustomer={() => selectCustomer('')} /> : null}
          {view === 'liquid_assets' ? <FinancialWorkspace section="liquid" onChooseCustomer={() => selectCustomer('')} /> : null}
          {view === 'cashflow' ? <FinancialWorkspace section="cashflow" onChooseCustomer={() => selectCustomer('')} /> : null}
          {view === 'education' ? <FinancialWorkspace section="goals" onChooseCustomer={() => selectCustomer('')} /> : null}
        </>}
      </main>
    </div>
  </div>
}

function IntakeOverview({ filled, onOpen, onOpenReport }: { filled: Set<IntakeStepKey>; onOpen: (view: IntakeView) => void; onOpenReport: () => void }) {
  return <>
    <section className="overview-lead">
      <span className="section-kicker">录入总览</span>
      <h2>选择要补充的资料</h2>
      <p>录入没有固定顺序。填写任意有效内容后，模块会自动标记为已填写。</p>
    </section>
    <section className="module-grid">
      {stepMeta.map((item) => {
        const Icon = item.icon
        const done = filled.has(item.key)
        return <button className={done ? 'module-card is-done' : 'module-card'} type="button" key={item.key} onClick={() => onOpen(item.key)}>
          <span className="module-icon"><Icon size={23} /></span>
          <span><strong>{item.title}</strong><small>{item.description}</small></span>
          <span className="module-state">{done ? '已填写' : '进入录入'}</span>
        </button>
      })}
    </section>
    <section className="report-gate is-ready">
      <div><FileTextIcon size={26} /><div><h3>财务分析报告</h3><p>随时根据现有资料生成，缺少数据的指标会明确显示“资料不足”。</p></div></div>
      <button className="primary-action compact" type="button" onClick={onOpenReport}>查看报告 <ArrowRightIcon size={18} /></button>
    </section>
  </>
}

function ProfileForm({ customer, onUpdate }: { customer: CustomerProfile; onUpdate: (patch: Partial<CustomerProfile>) => void }) {
  const knownCities = [...popularCities, ...otherCities]
  const hasLegacyCity = Boolean(customer.city && !knownCities.includes(customer.city))
  return <section className="form-section module-form">
    <div className="form-grid two-columns">
      <Field label="主要联系人姓名"><input value={customer.primaryContactName} onChange={(event) => onUpdate({ primaryContactName: event.target.value })} /></Field>
      <Field label="所在城市"><select value={customer.city} onChange={(event) => onUpdate({ city: event.target.value })}>
        <option value="">请选择城市或地区</option>
        {hasLegacyCity ? <option value={customer.city}>{customer.city}（原有资料）</option> : null}
        <optgroup label="热门城市">{popularCities.map((city) => <option value={city} key={city}>{city}</option>)}</optgroup>
        <optgroup label="其他城市和地区">{otherCities.map((city) => <option value={city} key={city}>{city}</option>)}</optgroup>
      </select></Field>
      <Field label="家庭情况备注" wide><textarea value={customer.notes} onChange={(event) => onUpdate({ notes: event.target.value })} placeholder="记录重要家庭责任、沟通偏好或需要持续关注的事项" /></Field>
    </div>
  </section>
}

function MemberForm({ customer }: { customer: CustomerProfile }) {
  const { addMember, updateMember, removeMember } = useCustomerStore()
  return <section className="form-section module-form">
    <div className="form-section-heading member-heading"><div><h2>家庭成员明细</h2><p>每位成员独立保存，便于收入与教育目标归属。</p></div><button className="subtle-button" type="button" onClick={() => void addMember(customer.id, createMember({ relation: '配偶' }))}><PlusIcon size={18} /> 添加成员</button></div>
    <div className="member-stack">
      {customer.members.map((member, index) => <MemberCard customer={customer} member={member} index={index} onUpdate={(patch) => updateMember(customer.id, member.id, patch)} onRemove={() => removeMember(customer.id, member.id)} key={member.id} />)}
    </div>
  </section>
}

function MemberCard({ customer, member, index, onUpdate, onRemove }: { customer: CustomerProfile; member: FamilyMember; index: number; onUpdate: (patch: Partial<FamilyMember>) => void; onRemove: () => void }) {
  return <article className="member-card">
    <div className="member-card-heading"><div><span>家庭成员 {index + 1}</span><strong>{member.name || '姓名待补充'}</strong></div>{customer.members.length > 1 ? <button className="icon-button danger" title="移除成员" type="button" onClick={onRemove}><TrashIcon size={18} /></button> : null}</div>
    <div className="form-grid three-columns">
      <Field label="姓名"><input value={member.name} onChange={(event) => onUpdate({ name: event.target.value })} /></Field>
      <Field label="家庭关系"><select value={member.relation} onChange={(event) => onUpdate({ relation: event.target.value })}><option>本人</option><option>配偶</option><option>子女</option><option>父母</option><option>其他</option></select></Field>
      <Field label="出生日期"><input type="date" value={member.birthDate} onChange={(event) => onUpdate({ birthDate: event.target.value })} /></Field>
      <Field label="工作性质"><input value={member.jobType} onChange={(event) => onUpdate({ jobType: event.target.value })} placeholder="例如：企业职员" /></Field>
      <Field label="收入稳定性"><select value={member.incomeStability} onChange={(event) => onUpdate({ incomeStability: event.target.value as IncomeStability })}>{Object.entries(stabilityLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></Field>
      <Field label="联系电话（可选）"><input inputMode="tel" value={member.phone} onChange={(event) => onUpdate({ phone: event.target.value })} /></Field>
      <Field label="身高（厘米）"><input type="number" min="0" value={member.heightCm ?? ''} onChange={(event) => onUpdate({ heightCm: toNullableNumber(event.target.value) })} /></Field>
      <Field label="体重（公斤）"><input type="number" min="0" value={member.weightKg ?? ''} onChange={(event) => onUpdate({ weightKg: toNullableNumber(event.target.value) })} /></Field>
      <label className="checkbox-field"><input type="checkbox" checked={member.isPrimaryIncomeProvider} onChange={(event) => onUpdate({ isPrimaryIncomeProvider: event.target.checked })} /><span><strong>主要收入贡献者</strong><small>用于判断收入集中风险</small></span></label>
      <Field label="健康状况备注" wide><textarea value={member.healthNotes} onChange={(event) => onUpdate({ healthNotes: event.target.value })} placeholder="如有需要持续关注的健康情况，可在此记录" /></Field>
    </div>
  </article>
}

function Field({ label, wide = false, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return <label className={wide ? 'field-block is-wide' : 'field-block'}><span>{label}</span>{children}</label>
}

function toNullableNumber(value: string) {
  if (!value) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

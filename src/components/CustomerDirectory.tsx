import { useMemo, useState } from 'react'
import {
  ArchiveIcon,
  ArrowLeftIcon,
  CheckCircleIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  TrashIcon,
  UserPlusIcon,
  UsersThreeIcon,
} from '@phosphor-icons/react'
import { createMember, type CustomerProfile, type FamilyMember, type IncomeStability } from '../types/domain'
import { useCustomerStore } from '../stores/customerStore'

interface CustomerDirectoryProps {
  onOpenDashboard: () => void
}

const stabilityLabels: Record<IncomeStability, string> = {
  stable: '固定收入',
  variable: '浮动收入',
  self_employed: '自雇或经营',
  retired: '退休收入',
  none: '暂无收入',
}

export function CustomerDirectory({ onOpenDashboard }: CustomerDirectoryProps) {
  const {
    customers,
    selectedCustomerId,
    selectCustomer,
    addCustomer,
    updateCustomer,
    addMember,
    updateMember,
    removeMember,
    archiveCustomer,
    deleteCustomer,
  } = useCustomerStore()
  const [search, setSearch] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const selected = customers.find((item) => item.id === selectedCustomerId) ?? null
  const visibleCustomers = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase('zh-CN')
    return customers.filter((customer) => {
      if (Boolean(customer.archivedAt) !== showArchived) return false
      if (!keyword) return true
      return [customer.primaryContactName, customer.householdName, customer.city]
        .some((value) => value.toLocaleLowerCase('zh-CN').includes(keyword))
    })
  }, [customers, search, showArchived])

  async function handleCreate() {
    if (!newName.trim()) return
    await addCustomer(newName)
    setNewName('')
    setCreating(false)
  }

  if (selected) {
    return (
      <CustomerEditor
        customer={selected}
        onBack={() => selectCustomer('')}
        onDashboard={onOpenDashboard}
        onUpdate={(patch) => updateCustomer(selected.id, patch)}
        onAddMember={(member) => addMember(selected.id, member)}
        onUpdateMember={(memberId, patch) => updateMember(selected.id, memberId, patch)}
        onRemoveMember={(memberId) => removeMember(selected.id, memberId)}
        onArchive={() => archiveCustomer(selected.id, !selected.archivedAt)}
      />
    )
  }

  return (
    <div className="directory-page">
      <section className="directory-heading">
        <div>
          <h1>客户档案</h1>
          <p>每个家庭使用独立编号保存，同名客户不会互相覆盖。</p>
        </div>
        <button className="primary-action" type="button" onClick={() => setCreating(true)}><PlusIcon size={18} /> 新建客户</button>
      </section>

      <section className="directory-tools">
        <label className="search-field">
          <MagnifyingGlassIcon size={18} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索姓名、家庭名称或城市" aria-label="搜索客户" />
        </label>
        <button className="subtle-button" type="button" onClick={() => setShowArchived((value) => !value)}>
          <ArchiveIcon size={18} /> {showArchived ? '返回当前客户' : '查看已归档'}
        </button>
      </section>

      {creating ? (
        <section className="create-customer-panel" aria-label="新建客户">
          <div><UserPlusIcon size={24} /><strong>建立一份独立客户档案</strong></div>
          <label className="field-block"><span>主要联系人姓名</span><input autoFocus value={newName} onChange={(event) => setNewName(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && handleCreate()} placeholder="例如：周明" /></label>
          <div className="form-actions">
            <button className="subtle-button" type="button" onClick={() => setCreating(false)}>取消</button>
            <button className="primary-action compact" type="button" disabled={!newName.trim()} onClick={handleCreate}>创建档案</button>
          </div>
        </section>
      ) : null}

      {visibleCustomers.length ? (
        <section className="customer-list" aria-label={showArchived ? '已归档客户' : '当前客户'}>
          {visibleCustomers.map((customer) => (
            <article className="customer-row" key={customer.id}>
              <button className="customer-main" type="button" onClick={() => selectCustomer(customer.id)}>
                <span className="customer-avatar">{customer.primaryContactName.slice(0, 1)}</span>
                <span><strong>{customer.householdName}</strong><small>{customer.city || '城市待补充'}　{customer.members.length} 位成员</small></span>
              </button>
              <div className="customer-meta"><span>最近保存</span><strong>{formatDate(customer.updatedAt)}</strong></div>
              {showArchived ? (
                <div className="row-actions">
                  <button className="icon-button" title="恢复档案" type="button" onClick={() => archiveCustomer(customer.id, false)}><CheckCircleIcon size={19} /></button>
                  {confirmDelete === customer.id ? (
                    <button className="danger-text-button" type="button" onClick={() => deleteCustomer(customer.id)}>确认删除</button>
                  ) : (
                    <button className="icon-button danger" title="永久删除" type="button" onClick={() => setConfirmDelete(customer.id)}><TrashIcon size={19} /></button>
                  )}
                </div>
              ) : null}
            </article>
          ))}
        </section>
      ) : (
        <section className="empty-state">
          <UsersThreeIcon size={34} />
          <h2>{search ? '没有匹配的客户' : showArchived ? '没有已归档客户' : '还没有客户档案'}</h2>
          <p>{search ? '换一个姓名或城市继续搜索。' : '新建客户后，原始资料会自动保存在当前设备。'}</p>
          {!search && !showArchived ? <button className="primary-action compact" type="button" onClick={() => setCreating(true)}>新建第一位客户</button> : null}
        </section>
      )}
    </div>
  )
}

interface CustomerEditorProps {
  customer: CustomerProfile
  onBack: () => void
  onDashboard: () => void
  onUpdate: (patch: Partial<CustomerProfile>) => void
  onAddMember: (member: FamilyMember) => void
  onUpdateMember: (memberId: string, patch: Partial<FamilyMember>) => void
  onRemoveMember: (memberId: string) => void
  onArchive: () => void
}

function CustomerEditor({ customer, onBack, onDashboard, onUpdate, onAddMember, onUpdateMember, onRemoveMember, onArchive }: CustomerEditorProps) {
  return (
    <div className="editor-page">
      <div className="editor-toolbar">
        <button className="back-button" type="button" onClick={onBack}><ArrowLeftIcon size={18} /> 所有客户</button>
        <div className="editor-toolbar-actions">
          <button className="subtle-button" type="button" onClick={onArchive}><ArchiveIcon size={18} /> {customer.archivedAt ? '恢复档案' : '归档'}</button>
          <button className="primary-action compact" type="button" onClick={onDashboard}>查看工作台</button>
        </div>
      </div>

      <section className="editor-title">
        <div><span className="quiet-label">客户原始资料</span><h1>{customer.householdName}</h1><p>输入内容会先自动保存在本机；确认后点击顶部“保存并同步”上传云端。</p></div>
        <div className="record-id"><span>档案编号</span><strong>{customer.id.slice(0, 8).toUpperCase()}</strong></div>
      </section>

      <section className="form-section">
        <div className="form-section-heading"><h2>家庭基本信息</h2><p>用于搜索、识别和生成报告封面。</p></div>
        <div className="form-grid three-columns">
          <Field label="主要联系人姓名"><input value={customer.primaryContactName} onChange={(event) => onUpdate({ primaryContactName: event.target.value })} /></Field>
          <Field label="家庭名称"><input value={customer.householdName} onChange={(event) => onUpdate({ householdName: event.target.value })} /></Field>
          <Field label="所在城市"><input value={customer.city} onChange={(event) => onUpdate({ city: event.target.value })} placeholder="例如：深圳" /></Field>
          <Field label="家庭情况备注" wide><textarea value={customer.notes} onChange={(event) => onUpdate({ notes: event.target.value })} placeholder="记录重要家庭责任或沟通事项" /></Field>
        </div>
      </section>

      <section className="form-section">
        <div className="form-section-heading member-heading"><div><h2>家庭成员</h2><p>成员姓名、年龄、工作和健康信息将用于个性化分析。</p></div><button className="subtle-button" type="button" onClick={() => onAddMember(createMember({ relation: '配偶' }))}><PlusIcon size={18} /> 添加成员</button></div>
        <div className="member-stack">
          {customer.members.map((member, index) => (
            <article className="member-card" key={member.id}>
              <div className="member-card-heading"><div><span>成员 {index + 1}</span><strong>{member.name || '姓名待补充'}</strong></div>{customer.members.length > 1 ? <button className="icon-button danger" title="移除成员" type="button" onClick={() => onRemoveMember(member.id)}><TrashIcon size={18} /></button> : null}</div>
              <div className="form-grid three-columns">
                <Field label="姓名"><input value={member.name} onChange={(event) => onUpdateMember(member.id, { name: event.target.value })} /></Field>
                <Field label="家庭关系"><select value={member.relation} onChange={(event) => onUpdateMember(member.id, { relation: event.target.value })}><option>本人</option><option>配偶</option><option>子女</option><option>父母</option><option>其他</option></select></Field>
                <Field label="出生日期"><input type="date" value={member.birthDate} onChange={(event) => onUpdateMember(member.id, { birthDate: event.target.value })} /></Field>
                <Field label="工作性质"><input value={member.jobType} onChange={(event) => onUpdateMember(member.id, { jobType: event.target.value })} placeholder="例如：企业职员" /></Field>
                <Field label="收入稳定性"><select value={member.incomeStability} onChange={(event) => onUpdateMember(member.id, { incomeStability: event.target.value as IncomeStability })}>{Object.entries(stabilityLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></Field>
                <Field label="联系电话（可选）"><input inputMode="tel" value={member.phone} onChange={(event) => onUpdateMember(member.id, { phone: event.target.value })} placeholder="仅用于档案识别" /></Field>
                <Field label="身高（厘米）"><input type="number" min="0" value={member.heightCm ?? ''} onChange={(event) => onUpdateMember(member.id, { heightCm: toNullableNumber(event.target.value) })} /></Field>
                <Field label="体重（公斤）"><input type="number" min="0" value={member.weightKg ?? ''} onChange={(event) => onUpdateMember(member.id, { weightKg: toNullableNumber(event.target.value) })} /></Field>
                <label className="checkbox-field"><input type="checkbox" checked={member.isPrimaryIncomeProvider} onChange={(event) => onUpdateMember(member.id, { isPrimaryIncomeProvider: event.target.checked })} /><span><strong>主要收入贡献者</strong><small>影响现金储备目标与收入风险判断</small></span></label>
                <Field label="健康状况备注" wide><textarea value={member.healthNotes} onChange={(event) => onUpdateMember(member.id, { healthNotes: event.target.value })} placeholder="如有需要持续关注的健康情况，可在此记录" /></Field>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}

function Field({ label, wide = false, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return <label className={wide ? 'field-block is-wide' : 'field-block'}><span>{label}</span>{children}</label>
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

function toNullableNumber(value: string) {
  if (!value) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

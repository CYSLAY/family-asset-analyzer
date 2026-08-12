import { useMemo, useState } from 'react'
import {
  CaretLeftIcon,
  CaretRightIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  TrashIcon,
  UserPlusIcon,
  UsersThreeIcon,
} from '@phosphor-icons/react'
import { intakeCompletion, type CustomerProfile } from '../types/domain'
import { buildCustomerDirectoryView } from '../lib/customerDirectory'
import { useCustomerStore } from '../stores/customerStore'

interface CustomerDirectoryProps {
  onStartIntake: () => void
  onOpenReport: () => void
}

export function CustomerDirectory({ onStartIntake, onOpenReport }: CustomerDirectoryProps) {
  const {
    customers,
    selectCustomer,
    addCustomer,
    deleteCustomer,
  } = useCustomerStore()
  const [search, setSearch] = useState('')
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [advisorPage, setAdvisorPage] = useState(1)
  const [pendingDelete, setPendingDelete] = useState<CustomerProfile | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  const directoryView = useMemo(() => buildCustomerDirectoryView(customers, search, advisorPage), [advisorPage, customers, search])
  const { visibleCustomers, searchActive, advisorCustomers, selfServiceCustomers, advisorPageCount, advisorPage: currentAdvisorPage, displayedAdvisorCustomers, displayedSelfServiceCustomers } = directoryView
  const customerGroups = [
    { key: 'advisor', title: '顾问录入', description: '由您在管理工作区建立和维护的客户档案', customers: displayedAdvisorCustomers, total: advisorCustomers.length },
    { key: 'self_service', title: '客户自填', description: '客户通过“家庭财务自测”独立填写并自动提交的档案', customers: displayedSelfServiceCustomers, total: selfServiceCustomers.length },
  ]

  async function handleCreate() {
    if (!newName.trim()) return
    await addCustomer(newName)
    setNewName('')
    setCreating(false)
  }

  async function handleDelete() {
    if (!pendingDelete || deleting) return
    setDeleting(true)
    setDeleteError('')
    try {
      await deleteCustomer(pendingDelete.id)
      setPendingDelete(null)
    } catch {
      setDeleteError('删除未完成，请检查网络后重试。客户资料仍然保留。')
    } finally {
      setDeleting(false)
    }
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
          <input value={search} onChange={(event) => { setSearch(event.target.value); setAdvisorPage(1) }} placeholder="搜索姓名、家庭名称或城市" aria-label="搜索客户" />
        </label>
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
        <div className="customer-source-groups">
          {customerGroups.map((group) => group.customers.length ? <section className="customer-source-section" key={group.key} aria-label={group.title}>
            <header className="customer-source-heading"><div><span className={`customer-source-mark ${group.key}`} /> <strong>{group.title}</strong><p>{group.description}</p></div><span>{group.total} 份档案</span></header>
            <div className="customer-list">
              {group.customers.map((customer) => <article className="customer-row" key={customer.id}>
                <button className="customer-main" type="button" onClick={() => { selectCustomer(customer.id); onStartIntake() }}>
                  <span className="customer-avatar">{customer.primaryContactName.slice(0, 1) || '家'}</span>
                  <span><strong>{customer.householdName}</strong><small>{customer.city || '城市待补充'}　{customer.members.length} 位成员　{intakeCompletion(customer)}% 已填写</small></span>
                </button>
                <div className="customer-meta"><span>最近保存</span><strong>{formatDate(customer.updatedAt)}</strong></div>
                <div className="row-actions customer-row-actions">
                  <button className="subtle-button compact-row-button" type="button" onClick={() => { selectCustomer(customer.id); onStartIntake() }}>继续录入</button>
                  <button className="subtle-button compact-row-button" type="button" onClick={() => { selectCustomer(customer.id); onOpenReport() }}>查看报告</button>
                  <button className="customer-delete-button" type="button" onClick={() => { setDeleteError(''); setPendingDelete(customer) }}><TrashIcon size={16} /> 删除</button>
                </div>
              </article>)}
            </div>
            {!searchActive && group.key === 'advisor' && advisorPageCount > 1 ? <nav className="customer-pagination" aria-label="顾问录入档案分页">
              <span>第 {currentAdvisorPage} 页，共 {advisorPageCount} 页</span>
              <div>
                <button aria-label="上一页" disabled={currentAdvisorPage === 1} type="button" onClick={() => setAdvisorPage((page) => Math.max(1, page - 1))}><CaretLeftIcon size={16} /> 上一页</button>
                <button aria-label="下一页" disabled={currentAdvisorPage === advisorPageCount} type="button" onClick={() => setAdvisorPage((page) => Math.min(advisorPageCount, page + 1))}>下一页 <CaretRightIcon size={16} /></button>
              </div>
            </nav> : null}
            {!searchActive && group.key === 'self_service' && group.total > 2 ? <p className="customer-hidden-note">当前显示最近 2 份客户自填档案，其余档案可通过上方搜索查找。</p> : null}
          </section> : null)}
        </div>
      ) : (
        <section className="empty-state">
          <UsersThreeIcon size={34} />
          <h2>{search ? '没有匹配的客户' : '还没有客户档案'}</h2>
          <p>{search ? '换一个姓名或城市继续搜索。' : '新建客户后，原始资料会自动保存在当前设备。'}</p>
          {!search ? <button className="primary-action compact" type="button" onClick={() => setCreating(true)}>新建第一位客户</button> : null}
        </section>
      )}

      {pendingDelete ? <div className="modal-backdrop delete-modal-backdrop" role="presentation" onMouseDown={() => !deleting && setPendingDelete(null)}>
        <section className="delete-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-dialog-title" aria-describedby="delete-dialog-description" onMouseDown={(event) => event.stopPropagation()}>
          <span className="delete-dialog-icon"><TrashIcon size={24} weight="bold" /></span>
          <span className="section-kicker">删除客户档案</span>
          <h2 id="delete-dialog-title">确定删除“{pendingDelete.householdName}”吗？</h2>
          <p id="delete-dialog-description">确认后，这位客户的家庭成员、资产、负债、收支和分析资料都会从本机与云端删除，且无法恢复。</p>
          {deleteError ? <p className="delete-dialog-error" role="alert">{deleteError}</p> : null}
          <div className="delete-dialog-actions">
            <button className="subtle-button" type="button" disabled={deleting} onClick={() => setPendingDelete(null)}>取消</button>
            <button className="danger-confirm-button" type="button" disabled={deleting} onClick={() => void handleDelete()}><TrashIcon size={17} /> {deleting ? '正在删除' : '确认永久删除'}</button>
          </div>
        </section>
      </div> : null}
    </div>
  )
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

import { useEffect, useMemo, useState } from 'react'
import {
  ArrowSquareOutIcon,
  CaretLeftIcon,
  CaretRightIcon,
  CheckIcon,
  CopyIcon,
  KeyIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  TableIcon,
  TrashIcon,
  UserPlusIcon,
  UsersThreeIcon,
} from '@phosphor-icons/react'
import { intakeCompletion, type CustomerProfile } from '../types/domain'
import { getAccessSession } from '../lib/access'
import { createClientInvitation, invitationAccessState, listClientInvitations, type ClientInvitation, updateClientInvitationRecipient } from '../lib/clientInvitations'
import { buildCustomerDirectoryView } from '../lib/customerDirectory'
import { useCustomerStore } from '../stores/customerStore'

interface CustomerDirectoryProps {
  onStartIntake: () => void
  onOpenReport: () => void
  onOpenCashFlow: () => void
}

export function CustomerDirectory({ onStartIntake, onOpenReport, onOpenCashFlow }: CustomerDirectoryProps) {
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
  const [invitations, setInvitations] = useState<ClientInvitation[]>([])
  const [invitationRecipient, setInvitationRecipient] = useState('')
  const [recipientDrafts, setRecipientDrafts] = useState<Record<string, string>>({})
  const [loadingInvitations, setLoadingInvitations] = useState(true)
  const [creatingInvitation, setCreatingInvitation] = useState(false)
  const [savingInvitation, setSavingInvitation] = useState('')
  const [copiedInvitation, setCopiedInvitation] = useState('')
  const [invitationError, setInvitationError] = useState('')

  const directoryView = useMemo(() => buildCustomerDirectoryView(customers, search, advisorPage), [advisorPage, customers, search])
  const { visibleCustomers, searchActive, advisorCustomers, selfServiceCustomers, advisorPageCount, advisorPage: currentAdvisorPage, displayedAdvisorCustomers, displayedSelfServiceCustomers } = directoryView
  const customerGroups = [
    { key: 'advisor', title: '顾问录入', description: '由您在管理工作区建立和维护的客户档案', customers: displayedAdvisorCustomers, total: advisorCustomers.length },
    { key: 'self_service', title: '客户自填', description: '客户通过“家庭财务自测”独立填写并自动提交的档案', customers: displayedSelfServiceCustomers, total: selfServiceCustomers.length },
  ]

  useEffect(() => {
    const session = getAccessSession()
    if (!session) {
      setLoadingInvitations(false)
      return
    }
    let cancelled = false
    void listClientInvitations(session.username, session.accessCode)
      .then((records) => {
        if (cancelled) return
        setInvitations(records)
        setRecipientDrafts(Object.fromEntries(records.map((record) => [record.code, record.recipientName])))
      })
      .catch(() => !cancelled && setInvitationError('邀请码记录暂时无法读取，请稍后重试。'))
      .finally(() => !cancelled && setLoadingInvitations(false))
    return () => { cancelled = true }
  }, [])

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

  async function handleCreateInvitation() {
    const session = getAccessSession()
    if (!session || creatingInvitation) return
    setCreatingInvitation(true)
    setInvitationError('')
    try {
      const invitation = await createClientInvitation(session.username, session.accessCode, invitationRecipient)
      setInvitations((records) => [invitation, ...records])
      setRecipientDrafts((drafts) => ({ ...drafts, [invitation.code]: invitation.recipientName }))
      setInvitationRecipient('')
    } catch {
      setInvitationError('邀请码生成失败，请检查云端连接后重试。')
    } finally {
      setCreatingInvitation(false)
    }
  }

  async function handleSaveInvitation(invitation: ClientInvitation) {
    const session = getAccessSession()
    if (!session || savingInvitation) return
    const recipientName = (recipientDrafts[invitation.code] ?? '').trim()
    setSavingInvitation(invitation.code)
    setInvitationError('')
    try {
      await updateClientInvitationRecipient(session.username, session.accessCode, invitation.code, recipientName)
      setInvitations((records) => records.map((record) => record.code === invitation.code ? { ...record, recipientName } : record))
    } catch {
      setInvitationError('客户姓名或备注未保存，请稍后重试。')
    } finally {
      setSavingInvitation('')
    }
  }

  async function handleCopyInvitation(code: string) {
    try {
      await navigator.clipboard.writeText(code)
      setCopiedInvitation(code)
      window.setTimeout(() => setCopiedInvitation((current) => current === code ? '' : current), 1600)
    } catch {
      setInvitationError('复制失败，请手动选择邀请码。')
    }
  }

  return (
    <div className="directory-page">
      <section className="intake-start-hero customer-management-hero">
        <div>
          <span className="section-kicker">客户管理</span>
          <h1>开始进行家庭财务分析</h1>
          <p>为您量身定制的家庭资产管理计划</p>
        </div>
        <button className="primary-action" type="button" onClick={() => setCreating(true)}><PlusIcon size={18} /> 新建客户</button>
      </section>

      <section className="invitation-manager" aria-labelledby="invitation-manager-title">
        <header className="invitation-manager-heading">
          <div className="invitation-manager-title"><span><KeyIcon size={21} weight="bold" /></span><div><h2 id="invitation-manager-title">客户邀请码</h2><p>每个邀请码最多登录 3 次；客户提交资料后，可从记录直接进入对应报告。</p></div></div>
          <div className="invitation-generator">
            <label className="field-block"><span>客户姓名或用途备注</span><input value={invitationRecipient} onChange={(event) => setInvitationRecipient(event.target.value)} maxLength={120} placeholder="例如：陈女士（8 月咨询）" /></label>
            <button className="primary-action compact" type="button" disabled={creatingInvitation} onClick={() => void handleCreateInvitation()}><KeyIcon size={16} /> {creatingInvitation ? '正在生成' : '生成邀请码'}</button>
          </div>
        </header>

        {invitationError ? <p className="invitation-message error" role="alert">{invitationError}</p> : null}
        {loadingInvitations ? <p className="invitation-empty">正在读取邀请码记录…</p> : invitations.length ? <div className="invitation-list">
          {invitations.map((invitation) => {
            const customer = customers.find((record) => record.id === invitation.intakeId && record.source === 'self_service')
            const status = invitationAccessState(invitation)
            const recipientDraft = recipientDrafts[invitation.code] ?? invitation.recipientName
            const recipientChanged = recipientDraft.trim() !== invitation.recipientName
            return <article className="invitation-row" key={invitation.code}>
              <div className="invitation-code-cell"><span>邀请码</span><div><code>{invitation.code}</code><button aria-label={`复制邀请码 ${invitation.code}`} type="button" onClick={() => void handleCopyInvitation(invitation.code)}>{copiedInvitation === invitation.code ? <CheckIcon size={16} /> : <CopyIcon size={16} />}{copiedInvitation === invitation.code ? '已复制' : '复制'}</button></div></div>
              <label className="invitation-recipient"><span>客户姓名 / 备注</span><div><input value={recipientDraft} onChange={(event) => setRecipientDrafts((drafts) => ({ ...drafts, [invitation.code]: event.target.value }))} placeholder="待记录客户" /><button disabled={!recipientChanged || savingInvitation === invitation.code} type="button" onClick={() => void handleSaveInvitation(invitation)}>{savingInvitation === invitation.code ? '保存中' : '保存'}</button></div></label>
              <div className="invitation-usage"><span>登录次数</span><strong>{invitation.loginCount} / {invitation.maxLogins}</strong><em className={status === '可使用' ? 'available' : 'unavailable'}>{status}</em></div>
              <div className="invitation-actions"><span>{formatDate(invitation.createdAt)} 创建</span><button className="subtle-button compact-row-button" disabled={!customer} type="button" title={customer ? '打开该客户的分析报告' : '客户提交资料后即可查看报告'} onClick={() => { if (!customer) return; selectCustomer(customer.id); onOpenReport() }}><ArrowSquareOutIcon size={15} /> {customer ? '查看报告' : '等待客户提交'}</button></div>
            </article>
          })}
        </div> : <p className="invitation-empty">还没有邀请码。填写客户姓名或备注后，点击“生成邀请码”。</p>}
      </section>

      <section className="directory-tools customer-directory-tools">
        <div><h2>客户档案</h2><p>顾问录入与客户自填分开管理，同名客户不会互相覆盖。</p></div>
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
                  <button className="subtle-button compact-row-button" type="button" onClick={() => { selectCustomer(customer.id); onOpenCashFlow() }}><TableIcon size={15} /> 现金流</button>
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

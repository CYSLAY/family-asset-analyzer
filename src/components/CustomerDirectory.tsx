import { useEffect, useMemo, useState } from 'react'
import {
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
} from '@phosphor-icons/react'
import { intakeCompletion, type CustomerProfile } from '../types/domain'
import { getAccessSession } from '../lib/access'
import { createClientInvitation, deletePendingClientInvitation, invitationAccessState, listClientInvitations, type ClientInvitation, updateClientInvitationRecipient } from '../lib/clientInvitations'
import { buildCustomerDirectoryView, buildSelfServiceDirectoryItems, paginateSelfServiceDirectoryItems } from '../lib/customerDirectory'
import { useCustomerStore } from '../stores/customerStore'
import { customerAvatarInitial, PrivateControl, PrivateText } from '../lib/privacy'

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
  const [selfServicePage, setSelfServicePage] = useState(1)
  const [pendingDelete, setPendingDelete] = useState<CustomerProfile | null>(null)
  const [pendingInvitationDelete, setPendingInvitationDelete] = useState<ClientInvitation | null>(null)
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
  const { advisorCustomers, advisorPageCount, advisorPage: currentAdvisorPage, displayedAdvisorCustomers } = directoryView
  const selfServiceEntries = useMemo(() => buildSelfServiceDirectoryItems(invitations, customers, search), [customers, invitations, search])
  const selfServiceDirectoryPage = useMemo(() => paginateSelfServiceDirectoryItems(selfServiceEntries, selfServicePage), [selfServiceEntries, selfServicePage])
  const { displayedItems: displayedSelfServiceEntries, page: currentSelfServicePage, pageCount: selfServicePageCount } = selfServiceDirectoryPage

  useEffect(() => {
    if (selfServicePage !== currentSelfServicePage) setSelfServicePage(currentSelfServicePage)
  }, [currentSelfServicePage, selfServicePage])

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
    if ((!pendingDelete && !pendingInvitationDelete) || deleting) return
    setDeleting(true)
    setDeleteError('')
    try {
      if (pendingInvitationDelete) {
        const session = getAccessSession()
        if (!session) throw new Error('access_required')
        await deletePendingClientInvitation(session.username, session.accessCode, pendingInvitationDelete.code)
        setInvitations((records) => records.filter((record) => record.code !== pendingInvitationDelete.code))
        setPendingInvitationDelete(null)
        return
      }
      if (!pendingDelete) return
      await deleteCustomer(pendingDelete.id)
      setInvitations((records) => records.map((record) => record.intakeId === pendingDelete.id
        ? { ...record, active: false, updatedAt: new Date().toISOString() }
        : record))
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

      <section className="directory-tools customer-directory-tools">
        <div><h2>客户档案</h2><p>顾问录入与客户自填分开管理，同名客户不会互相覆盖。</p></div>
        <label className="search-field">
          <MagnifyingGlassIcon size={18} />
          <PrivateControl><input value={search} onChange={(event) => { setSearch(event.target.value); setAdvisorPage(1); setSelfServicePage(1) }} placeholder="搜索姓名、城市或邀请码" aria-label="搜索客户或邀请码" /></PrivateControl>
        </label>
      </section>

      {creating ? (
        <section className="create-customer-panel" aria-label="新建客户">
          <div><UserPlusIcon size={24} /><strong>建立一份独立客户档案</strong></div>
          <label className="field-block"><span>主要联系人姓名</span><PrivateControl><input autoFocus value={newName} onChange={(event) => setNewName(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && handleCreate()} placeholder="例如：周明" /></PrivateControl></label>
          <div className="form-actions">
            <button className="subtle-button" type="button" onClick={() => setCreating(false)}>取消</button>
            <button className="primary-action compact" type="button" disabled={!newName.trim()} onClick={handleCreate}>创建档案</button>
          </div>
        </section>
      ) : null}

      <div className="customer-source-groups">
        <section className="customer-source-section" aria-label="顾问录入">
          <header className="customer-source-heading"><div><span className="customer-source-mark advisor" /> <strong>顾问录入</strong><p>由您在管理工作区建立和维护的客户档案</p></div><span>{advisorCustomers.length} 份档案</span></header>
          {displayedAdvisorCustomers.length ? <div className="customer-list">
            {displayedAdvisorCustomers.map((customer) => <article className="customer-row advisor-customer-row" key={customer.id}>
              <button className="customer-main" type="button" onClick={() => { selectCustomer(customer.id); onStartIntake() }}>
                <span className="customer-avatar" aria-label="客户姓名首字">{customerAvatarInitial(customer.primaryContactName, customer.householdName)}</span>
                <span><strong><PrivateText>{customer.householdName}</PrivateText></strong><small><PrivateText>{customer.city || '城市待补充'}</PrivateText>　{customer.members.length} 位成员　{intakeCompletion(customer)}% 已填写</small></span>
              </button>
              <div className="customer-meta"><span>最近保存</span><strong>{formatDate(customer.updatedAt)}</strong></div>
              <CustomerRowActions customer={customer} onSelect={selectCustomer} onStartIntake={onStartIntake} onOpenReport={onOpenReport} onOpenCashFlow={onOpenCashFlow} onDelete={(record) => { setDeleteError(''); setPendingDelete(record) }} />
            </article>)}
          </div> : <p className="customer-section-empty">{search ? '没有匹配的顾问录入档案。' : '还没有顾问录入档案，可从上方新建客户。'}</p>}
          {advisorPageCount > 1 ? <nav className="customer-pagination" aria-label="顾问录入档案分页">
            <span>第 {currentAdvisorPage} 页，共 {advisorPageCount} 页</span>
            <div>
              <button aria-label="上一页" disabled={currentAdvisorPage === 1} type="button" onClick={() => setAdvisorPage((page) => Math.max(1, page - 1))}><CaretLeftIcon size={16} /> 上一页</button>
              <button aria-label="下一页" disabled={currentAdvisorPage === advisorPageCount} type="button" onClick={() => setAdvisorPage((page) => Math.min(advisorPageCount, page + 1))}>下一页 <CaretRightIcon size={16} /></button>
            </div>
          </nav> : null}
        </section>

        <section className="customer-source-section self-service-directory" aria-label="客户自填">
          <header className="customer-source-heading"><div><span className="customer-source-mark self_service" /> <strong>客户自填</strong><p>邀请码、登录记录与客户档案统一管理</p></div><span>{selfServiceEntries.length} 条记录</span></header>
          <div className="self-service-invitation-tools">
            <div className="self-service-invitation-intro"><span><KeyIcon size={20} weight="bold" /></span><div><strong>生成客户邀请码</strong><p>每个邀请码最多登录 3 次，客户提交后会自动关联档案。</p></div></div>
            <div className="invitation-generator">
              <label className="field-block"><span>客户姓名或用途备注</span><PrivateControl><input value={invitationRecipient} onChange={(event) => setInvitationRecipient(event.target.value)} maxLength={120} placeholder="例如：陈女士（8 月咨询）" /></PrivateControl></label>
              <button className="primary-action compact" type="button" disabled={creatingInvitation} onClick={() => void handleCreateInvitation()}><KeyIcon size={16} /> {creatingInvitation ? '正在生成' : '生成邀请码'}</button>
            </div>
          </div>
          {invitationError ? <p className="invitation-message error" role="alert">{invitationError}</p> : null}
          {loadingInvitations ? <p className="customer-section-empty">正在读取邀请码和客户自填记录…</p> : displayedSelfServiceEntries.length ? <div className="customer-list self-service-customer-list">
            {displayedSelfServiceEntries.map(({ invitation, customer }) => {
              const status = invitation ? invitationAccessState(invitation) : '历史档案'
              const recipientDraft = invitation ? (recipientDrafts[invitation.code] ?? invitation.recipientName) : customer?.primaryContactName ?? ''
              const recipientChanged = invitation ? recipientDraft.trim() !== invitation.recipientName : false
              const rowKey = invitation?.code ?? customer?.id ?? 'unknown'
              return <article className="customer-row self-service-customer-row" key={rowKey}>
                {invitation ? <label className="invitation-recipient"><span>客户姓名 / 备注</span><div><PrivateControl><input value={recipientDraft} onChange={(event) => setRecipientDrafts((drafts) => ({ ...drafts, [invitation.code]: event.target.value }))} placeholder="待记录客户" /></PrivateControl><button disabled={!recipientChanged || savingInvitation === invitation.code} type="button" onClick={() => void handleSaveInvitation(invitation)}>{savingInvitation === invitation.code ? '保存中' : '保存'}</button></div>{customer ? <small>{intakeCompletion(customer)}% 已填写</small> : null}</label> : <div className="invitation-recipient legacy-recipient"><span>客户姓名 / 备注</span><strong><PrivateText>{customer?.primaryContactName || '待补充'}</PrivateText></strong><small>历史客户自填档案</small></div>}
                <div className="invitation-code-cell"><span>邀请码</span>{invitation ? <div><code>{invitation.code}</code><button aria-label={`复制邀请码 ${invitation.code}`} type="button" onClick={() => void handleCopyInvitation(invitation.code)}>{copiedInvitation === invitation.code ? <CheckIcon size={16} /> : <CopyIcon size={16} />}{copiedInvitation === invitation.code ? '已复制' : '复制'}</button></div> : <strong className="invitation-legacy-label">未关联</strong>}</div>
                <div className="invitation-usage"><span>登录次数</span><strong>{invitation ? `${invitation.loginCount} / ${invitation.maxLogins}` : '未记录'}</strong><em className={status === '可使用' ? 'available' : status === '历史档案' ? '' : 'unavailable'}>{status}</em></div>
                <div className="self-service-save-meta"><span>最近保存</span><strong>{customer ? formatDate(customer.updatedAt) : '尚未提交'}</strong></div>
                <CustomerRowActions customer={customer} onSelect={selectCustomer} onStartIntake={onStartIntake} onOpenReport={onOpenReport} onOpenCashFlow={onOpenCashFlow} onDelete={(record) => { setDeleteError(''); setPendingDelete(record) }} onDeleteInvitation={!customer && invitation ? () => { setDeleteError(''); setPendingInvitationDelete(invitation) } : undefined} />
              </article>
            })}
          </div> : <p className="customer-section-empty">{search ? '没有匹配的邀请码或客户自填档案。' : '还没有客户自填记录，请先生成邀请码。'}</p>}
          {selfServicePageCount > 1 ? <nav className="customer-pagination" aria-label="客户自填档案分页">
            <span>第 {currentSelfServicePage} 页，共 {selfServicePageCount} 页</span>
            <div>
              <button aria-label="客户自填上一页" disabled={currentSelfServicePage === 1} type="button" onClick={() => setSelfServicePage((page) => Math.max(1, page - 1))}><CaretLeftIcon size={16} /> 上一页</button>
              <button aria-label="客户自填下一页" disabled={currentSelfServicePage === selfServicePageCount} type="button" onClick={() => setSelfServicePage((page) => Math.min(selfServicePageCount, page + 1))}>下一页 <CaretRightIcon size={16} /></button>
            </div>
          </nav> : null}
        </section>
      </div>

      {pendingDelete || pendingInvitationDelete ? <div className="modal-backdrop delete-modal-backdrop" role="presentation" onMouseDown={() => { if (!deleting) { setPendingDelete(null); setPendingInvitationDelete(null) } }}>
        <section className="delete-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-dialog-title" aria-describedby="delete-dialog-description" onMouseDown={(event) => event.stopPropagation()}>
          <span className="delete-dialog-icon"><TrashIcon size={24} weight="bold" /></span>
          <span className="section-kicker">{pendingInvitationDelete ? '删除邀请码' : '删除客户档案'}</span>
          <h2 id="delete-dialog-title">{pendingInvitationDelete ? `确定删除“${pendingInvitationDelete.code}”吗？` : <>确定删除“<PrivateText>{pendingDelete?.householdName}</PrivateText>”吗？</>}</h2>
          <p id="delete-dialog-description">{pendingInvitationDelete ? '确认后，这个邀请码会立即失效并从列表移除，客户将无法再使用它进入系统。' : '确认后，这位客户的家庭成员、资产、负债、收支和分析资料都会从本机与云端删除，且无法恢复。'}</p>
          {deleteError ? <p className="delete-dialog-error" role="alert">{deleteError}</p> : null}
          <div className="delete-dialog-actions">
            <button className="subtle-button" type="button" disabled={deleting} onClick={() => { setPendingDelete(null); setPendingInvitationDelete(null) }}>取消</button>
            <button className="danger-confirm-button" type="button" disabled={deleting} onClick={() => void handleDelete()}><TrashIcon size={17} /> {deleting ? '正在删除' : '确认永久删除'}</button>
          </div>
        </section>
      </div> : null}
    </div>
  )
}

interface CustomerRowActionsProps {
  customer?: CustomerProfile
  onSelect: (id: string) => void
  onStartIntake: () => void
  onOpenReport: () => void
  onOpenCashFlow: () => void
  onDelete: (customer: CustomerProfile) => void
  onDeleteInvitation?: () => void
}

function CustomerRowActions({ customer, onSelect, onStartIntake, onOpenReport, onOpenCashFlow, onDelete, onDeleteInvitation }: CustomerRowActionsProps) {
  const open = (next: () => void) => {
    if (!customer) return
    onSelect(customer.id)
    next()
  }
  const unavailableTitle = customer ? undefined : '客户提交资料后即可使用'

  return <div className="row-actions customer-row-actions">
    <button className="subtle-button compact-row-button" disabled={!customer} title={unavailableTitle} type="button" onClick={() => open(onStartIntake)}>继续录入</button>
    <button className="subtle-button compact-row-button" disabled={!customer} title={unavailableTitle} type="button" onClick={() => open(onOpenReport)}>查看报告</button>
    <button className="subtle-button compact-row-button" disabled={!customer} title={unavailableTitle} type="button" onClick={() => open(onOpenCashFlow)}><TableIcon size={15} /> 现金流</button>
    <button className="customer-delete-button" disabled={!customer && !onDeleteInvitation} title={customer ? undefined : onDeleteInvitation ? '删除未提交的邀请码' : unavailableTitle} type="button" onClick={() => customer ? onDelete(customer) : onDeleteInvitation?.()}><TrashIcon size={16} /> 删除</button>
  </div>
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

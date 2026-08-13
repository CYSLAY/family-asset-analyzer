import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import {
  ChartDonutIcon,
  ChartLineUpIcon,
  CheckCircleIcon,
  ClipboardTextIcon,
  SignOutIcon,
  UserCircleIcon,
  UsersThreeIcon,
} from '@phosphor-icons/react'
import { AccessGate } from './components/AccessGate'
import { CustomerDirectory } from './components/CustomerDirectory'
import { CashFlowManager } from './components/CashFlowManager'
import { IntakeWorkspace } from './components/IntakeWorkspace'
import jojoLogo from '../assets/branding/jojo-personal-logo.png'
import { clearAccessUser, getAccessSession, getAccessUser } from './lib/access'
import { putCustomer } from './lib/localDb'
import { createPublicIntakeSession, fetchPublicIntake, getPublicIntakeSession, pushPublicIntake } from './lib/publicIntake'
import { synchronizeWorkspace } from './lib/usernameSync'
import { useCustomerStore } from './stores/customerStore'
import { canSyncSelfServiceCustomer, createCustomer, type CustomerProfile } from './types/domain'

const AnalysisDashboard = lazy(() => import('./components/AnalysisDashboard').then((module) => ({ default: module.AnalysisDashboard })))

type AppView = 'intake' | 'customers' | 'cashflow' | 'analysis'
type WorkspaceMode = 'admin' | 'self_service'

const adminNavigation = [
  { view: 'customers' as const, label: '客户管理', icon: UsersThreeIcon },
  { view: 'cashflow' as const, label: '现金流管理', icon: ChartLineUpIcon },
]

const selfServiceNavigation = [
  { view: 'intake' as const, label: '资料填写', icon: ClipboardTextIcon },
  { view: 'analysis' as const, label: '我的报告', icon: ChartDonutIcon },
]

export function App() {
  const [accessUser, setAccessUser] = useState<string | null>(() => import.meta.env.DEV && new URLSearchParams(location.search).has('preview') ? '本地预览' : getAccessUser())
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode | null>(() => getAccessUser() ? 'admin' : null)
  const [workspaceSync, setWorkspaceSync] = useState<'idle' | 'syncing' | 'synced' | 'error'>('idle')
  const [publicReady, setPublicReady] = useState(false)
  const [view, setView] = useState<AppView>('customers')
  const { customers, selectedCustomerId, initialized, saveState, syncState, initialize, selectCustomer, syncCustomer } = useCustomerStore()
  const selectedCustomer = useMemo(() => customers.find((item) => item.id === selectedCustomerId) ?? null, [customers, selectedCustomerId])
  const selfService = workspaceMode === 'self_service'

  useEffect(() => {
    if (!initialized) void initialize()
  }, [initialize, initialized])

  useEffect(() => {
    const session = getAccessSession()
    if (workspaceMode !== 'admin' || !accessUser || !session || !initialized || workspaceSync !== 'idle') return
    setWorkspaceSync('syncing')
    void synchronizeWorkspace(accessUser, session.accessCode).then((syncedCustomers) => {
      const currentId = useCustomerStore.getState().selectedCustomerId
      useCustomerStore.setState({
        customers: syncedCustomers,
        selectedCustomerId: syncedCustomers.some((item) => item.id === currentId) ? currentId : null,
      })
      setWorkspaceSync('synced')
    }).catch(() => setWorkspaceSync('error'))
  }, [accessUser, initialized, workspaceMode, workspaceSync])

  useEffect(() => {
    if (workspaceMode !== 'self_service' || !initialized || publicReady) return
    let cancelled = false
    void (async () => {
      let cloudFailed = false
      let cloudFetched = false
      const session = getPublicIntakeSession() ?? createPublicIntakeSession()
      const localCustomer = useCustomerStore.getState().customers.find((item) => item.id === session.id)
      let remoteCustomer: CustomerProfile | null = null
      try {
        remoteCustomer = await fetchPublicIntake(session)
        cloudFetched = true
      } catch { cloudFailed = true }
      let customer: CustomerProfile | null = remoteCustomer && (!localCustomer || remoteCustomer.updatedAt >= localCustomer.updatedAt)
        ? remoteCustomer
        : localCustomer ? { ...localCustomer, source: 'self_service' } : null
      if (!customer) {
        customer = { ...createCustomer('', 'self_service'), id: session.id, householdName: '我的家庭' }
      }
      await putCustomer(customer)
      if (cloudFetched && canSyncSelfServiceCustomer(customer) && (!remoteCustomer || customer.updatedAt > remoteCustomer.updatedAt)) {
        try { await pushPublicIntake(session, customer) } catch { cloudFailed = true }
      }
      if (cancelled) return
      useCustomerStore.setState({ customers: [customer], selectedCustomerId: customer.id, syncState: cloudFailed ? 'error' : 'synced' })
      setPublicReady(true)
    })()
    return () => { cancelled = true }
  }, [initialized, publicReady, workspaceMode])

  if (!workspaceMode) return <AccessGate onAdminAllowed={(username) => { setAccessUser(username); setWorkspaceMode('admin'); setWorkspaceSync('idle'); setView('customers') }} onStartSelfService={() => { setWorkspaceMode('self_service'); setPublicReady(false); setView('intake') }} />
  if (selfService && !publicReady) return <main className="public-loading"><span /><strong>正在准备您的家庭财务档案</strong><p>资料只会显示在您的当前填写空间中。</p></main>

  function openMainView(next: AppView) {
    if (next === 'customers' && !selfService) selectCustomer('')
    if (next === 'analysis' && selfService && (!selectedCustomer || !selectedCustomer.primaryContactName.trim())) return
    setView(next)
  }

  function openReport() {
    if (selectedCustomer && (!selfService || selectedCustomer.primaryContactName.trim())) setView('analysis')
  }

  function exitWorkspace() {
    if (workspaceMode === 'admin') {
      clearAccessUser()
      setAccessUser(null)
      setWorkspaceSync('idle')
    }
    setWorkspaceMode(null)
    setPublicReady(false)
    selectCustomer('')
    setView(workspaceMode === 'admin' ? 'customers' : 'intake')
  }

  const navigation = selfService ? selfServiceNavigation : adminNavigation
  const modeLabel = selfService ? '家庭财务自测' : '家庭财务分析'
  const modeDescription = selfService ? '我的资料与报告' : '客户资料工作区'
  const selfServiceCloudEligible = Boolean(selectedCustomer && canSyncSelfServiceCustomer(selectedCustomer))
  const syncLabel = selfService
    ? !selfServiceCloudEligible ? '填写姓名后自动同步' : syncState === 'dirty' ? '等待自动同步' : syncState === 'syncing' ? '正在自动同步' : syncState === 'error' ? '云端同步待重试' : '资料已自动同步'
    : workspaceSync === 'synced' ? '云端工作区已连接' : workspaceSync === 'syncing' ? '正在连接云端' : workspaceSync === 'error' ? '云端连接失败' : '退出当前工作区'

  return <div className={selfService ? 'app-shell self-service-shell' : 'app-shell'}>
    <aside className="sidebar" aria-label="主导航">
      <div className="brand-block">
        <div className="brand-logo-frame"><img src={jojoLogo} alt="Jojo 标志" /></div>
        <div><strong>{modeLabel}</strong><span>{modeDescription}</span></div>
      </div>
      <nav className="nav-list">
        {navigation.map((item) => {
          const Icon = item.icon
          const active = view === item.view || !selfService && (view === 'analysis' || view === 'intake') && item.view === 'customers'
        const locked = selfService && item.view === 'analysis' && !selectedCustomer?.primaryContactName.trim()
        return <button aria-label={locked ? `${item.label}，请先填写姓名` : item.label} className={active ? 'nav-item is-active' : 'nav-item'} disabled={locked} key={item.view} type="button" onClick={() => openMainView(item.view)}><Icon size={21} weight={active ? 'fill' : 'regular'} /><span>{item.label}</span></button>
        })}
      </nav>
      <button aria-label="退出当前工作区" className="sync-card" type="button" onClick={exitWorkspace}>
        <UserCircleIcon size={20} /><div><strong>{selfService ? selectedCustomer?.primaryContactName || '我的家庭' : accessUser}</strong><span>{syncLabel}</span></div>
      </button>
    </aside>

    <main className="main-content">
      <header className="topbar">
        <div><span className="topbar-title">{view === 'intake' ? selfService ? '资料填写' : '客户管理' : view === 'customers' ? '客户管理' : view === 'cashflow' ? '现金流管理' : selfService ? '我的分析报告' : '财务分析报告'}</span>{selectedCustomer ? <span className="topbar-customer">{selectedCustomer.householdName}</span> : null}</div>
        <div className="topbar-actions">
          <div className={saveState === 'error' ? 'save-status has-error' : 'save-status'}><CheckCircleIcon size={18} weight="fill" /> {saveState === 'saving' ? '正在预保存' : saveState === 'error' ? '本地保存失败' : selfService ? syncLabel : '已预存在本机'}</div>
          {!selfService && selectedCustomer ? <button className="save-cloud-button" disabled={saveState === 'saving' || syncState === 'syncing'} type="button" onClick={() => void syncCustomer(selectedCustomer.id)}>{syncState === 'syncing' ? '正在同步' : syncState === 'synced' ? '云端已保存' : syncState === 'error' ? '重试同步' : '保存并同步'}</button> : null}
          <button aria-label={selfService ? '返回入口' : '退出管理工作区'} className="cloud-status-button" type="button" onClick={exitWorkspace}><SignOutIcon size={18} /><span>{selfService ? '返回入口' : '退出'}</span></button>
        </div>
      </header>

      <div className="page-wrap">
        {syncState === 'error' && selfService && selfServiceCloudEligible ? <div className="public-sync-warning" role="status">当前资料已保存在本机，云端连接恢复后会继续自动同步。</div> : null}
        {view === 'intake' ? <IntakeWorkspace selfService={selfService} onOpenReport={openReport} onOpenCustomers={() => { if (!selfService) { selectCustomer(''); setView('customers') } }} /> : null}
        {view === 'customers' && !selfService ? <CustomerDirectory onStartIntake={() => setView('intake')} onOpenReport={() => setView('analysis')} onOpenCashFlow={() => setView('cashflow')} /> : null}
        {view === 'cashflow' && !selfService ? <CashFlowManager onOpenCustomer={() => setView('customers')} /> : null}
        {view === 'analysis' ? <Suspense fallback={<div className="report-skeleton" aria-label="正在生成分析报告"><span /><span /><span /></div>}><AnalysisDashboard onChooseCustomer={() => { if (selfService) setView('intake'); else { selectCustomer(''); setView('customers') } }} onOpenCashFlow={!selfService ? () => setView('cashflow') : undefined} /></Suspense> : null}
      </div>
    </main>

    <nav className="mobile-nav" aria-label="移动端导航">
      {navigation.map((item) => {
        const Icon = item.icon
        const active = view === item.view || !selfService && (view === 'analysis' || view === 'intake') && item.view === 'customers'
        const locked = selfService && item.view === 'analysis' && !selectedCustomer?.primaryContactName.trim()
        return <button aria-label={locked ? `${item.label}，请先填写姓名` : item.label} className={active ? 'is-active' : ''} disabled={locked} key={item.view} type="button" onClick={() => openMainView(item.view)}><Icon size={21} /><span>{item.label}</span></button>
      })}
    </nav>
  </div>
}

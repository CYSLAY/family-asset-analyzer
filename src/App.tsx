import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import {
  CheckCircleIcon,
  ClipboardTextIcon,
  SignOutIcon,
  UserCircleIcon,
  UsersThreeIcon,
} from '@phosphor-icons/react'
import { AccessGate } from './components/AccessGate'
import { CustomerDirectory } from './components/CustomerDirectory'
import { IntakeWorkspace } from './components/IntakeWorkspace'
import jojoLogo from '../assets/branding/jojo-personal-logo.png'
import { clearAccessUser, getAccessSession, getAccessUser } from './lib/access'
import { synchronizeWorkspace } from './lib/usernameSync'
import { useCustomerStore } from './stores/customerStore'

const AnalysisDashboard = lazy(() => import('./components/AnalysisDashboard').then((module) => ({ default: module.AnalysisDashboard })))

type AppView = 'intake' | 'customers' | 'analysis'

const navigation = [
  { view: 'intake' as const, label: '信息录入', icon: ClipboardTextIcon },
  { view: 'customers' as const, label: '客户档案', icon: UsersThreeIcon },
]

export function App() {
  const [accessUser, setAccessUser] = useState<string | null>(() => import.meta.env.DEV && new URLSearchParams(location.search).has('preview') ? '本地预览' : getAccessUser())
  const [workspaceSync, setWorkspaceSync] = useState<'idle' | 'syncing' | 'synced' | 'error'>('idle')
  const [view, setView] = useState<AppView>('intake')
  const { customers, selectedCustomerId, initialized, saveState, syncState, initialize, selectCustomer, syncCustomer } = useCustomerStore()
  const selectedCustomer = useMemo(() => customers.find((item) => item.id === selectedCustomerId) ?? null, [customers, selectedCustomerId])

  useEffect(() => {
    if (!initialized) void initialize()
  }, [initialize, initialized])

  useEffect(() => {
    const session = getAccessSession()
    if (!accessUser || !session || !initialized || workspaceSync !== 'idle') return
    setWorkspaceSync('syncing')
    void synchronizeWorkspace(accessUser, session.accessCode).then((syncedCustomers) => {
      const currentId = useCustomerStore.getState().selectedCustomerId
      useCustomerStore.setState({
        customers: syncedCustomers,
        selectedCustomerId: syncedCustomers.some((item) => item.id === currentId) ? currentId : null,
      })
      setWorkspaceSync('synced')
    }).catch(() => setWorkspaceSync('error'))
  }, [accessUser, initialized, workspaceSync])

  if (!accessUser) return <AccessGate onAllowed={setAccessUser} />

  function openMainView(next: 'intake' | 'customers') {
    if (next === 'customers') selectCustomer('')
    setView(next)
  }

  function openReport() {
    if (selectedCustomer) setView('analysis')
  }

  return <div className="app-shell">
    <aside className="sidebar" aria-label="主导航">
      <div className="brand-block">
        <div className="brand-logo-frame">
          <img src={jojoLogo} alt={`${accessUser} 标志`} />
        </div>
        <div><strong>家庭财务分析</strong><span>客户资料工作区</span></div>
      </div>

      <nav className="nav-list">
        {navigation.map((item) => {
          const Icon = item.icon
          const active = view === item.view || view === 'analysis' && item.view === 'customers'
          return <button aria-label={item.label} className={active ? 'nav-item is-active' : 'nav-item'} key={item.view} type="button" onClick={() => openMainView(item.view)}>
            <Icon size={21} weight={active ? 'fill' : 'regular'} /><span>{item.label}</span>
          </button>
        })}
      </nav>

      <button aria-label="退出当前工作区" className="sync-card" type="button" onClick={() => { clearAccessUser(); setAccessUser(null) }}>
        <UserCircleIcon size={20} />
        <div><strong>{accessUser}</strong><span>{workspaceSync === 'synced' ? '云端工作区已连接' : workspaceSync === 'syncing' ? '正在连接云端' : workspaceSync === 'error' ? '云端连接失败' : '退出当前工作区'}</span></div>
      </button>
    </aside>

    <main className="main-content">
      <header className="topbar">
        <div>
          <span className="topbar-title">{view === 'intake' ? '信息录入' : view === 'customers' ? '客户档案' : '财务分析报告'}</span>
          {selectedCustomer ? <span className="topbar-customer">{selectedCustomer.householdName}</span> : null}
        </div>
        <div className="topbar-actions">
          <div className={saveState === 'error' ? 'save-status has-error' : 'save-status'}>
            <CheckCircleIcon size={18} weight="fill" /> {saveState === 'saving' ? '正在预保存' : saveState === 'error' ? '本地保存失败' : '已预存在本机'}
          </div>
          {selectedCustomer ? <button className="save-cloud-button" disabled={saveState === 'saving' || syncState === 'syncing'} type="button" onClick={() => void syncCustomer(selectedCustomer.id)}>
            {syncState === 'syncing' ? '正在同步' : syncState === 'synced' ? '云端已保存' : syncState === 'error' ? '重试同步' : '保存并同步'}
          </button> : null}
          <button className="cloud-status-button" type="button" onClick={() => { clearAccessUser(); setAccessUser(null) }}><SignOutIcon size={18} /><span>退出</span></button>
        </div>
      </header>

      <div className="page-wrap">
        {view === 'intake' ? <IntakeWorkspace onOpenReport={openReport} onOpenCustomers={() => { selectCustomer(''); setView('customers') }} /> : null}
        {view === 'customers' ? <CustomerDirectory onStartIntake={() => setView('intake')} onOpenReport={() => setView('analysis')} /> : null}
        {view === 'analysis' ? <Suspense fallback={<div className="report-skeleton" aria-label="正在生成分析报告"><span /><span /><span /></div>}><AnalysisDashboard onChooseCustomer={() => { selectCustomer(''); setView('customers') }} /></Suspense> : null}
      </div>
    </main>

    <nav className="mobile-nav" aria-label="移动端导航">
      {navigation.map((item) => {
        const Icon = item.icon
        const active = view === item.view || view === 'analysis' && item.view === 'customers'
        return <button aria-label={item.label} className={active ? 'is-active' : ''} key={item.view} type="button" onClick={() => openMainView(item.view)}><Icon size={21} /><span>{item.label}</span></button>
      })}
    </nav>
  </div>
}

import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import {
  ArrowRightIcon,
  BuildingsIcon,
  ChartDonutIcon,
  CheckCircleIcon,
  CurrencyCircleDollarIcon,
  HouseLineIcon,
  PiggyBankIcon,
  SignOutIcon,
  UserCircleIcon,
  UsersThreeIcon,
} from '@phosphor-icons/react'
import { CustomerDirectory } from './components/CustomerDirectory'
import { FinancialWorkspace, type FinancialSection } from './components/FinancialWorkspace'
import { useCustomerStore } from './stores/customerStore'
import { AccessGate } from './components/AccessGate'
import { clearAccessUser, getAccessSession, getAccessUser } from './lib/access'
import { synchronizeWorkspace } from './lib/usernameSync'

const navigation = [
  { label: '工作台', icon: HouseLineIcon, active: true },
  { label: '客户档案', icon: UsersThreeIcon },
  { label: '资产负债', icon: BuildingsIcon },
  { label: '收支储蓄', icon: PiggyBankIcon },
  { label: '家庭目标', icon: CurrencyCircleDollarIcon },
  { label: '分析报告', icon: ChartDonutIcon },
]

const AnalysisDashboard = lazy(() => import('./components/AnalysisDashboard').then((module) => ({ default: module.AnalysisDashboard })))

const tasks = [
  { title: '建立家庭成员档案', detail: '记录成员关系、年龄和收入稳定性', done: true },
  { title: '补充资产与负债', detail: '支持房产、金融资产和每笔负债', done: false },
  { title: '完成年度收支', detail: '按月或按年录入，系统统一换算', done: false },
]

type AppView = 'dashboard' | 'customers' | 'analysis' | FinancialSection

export function App() {
  const [accessUser, setAccessUser] = useState<string | null>(() => getAccessUser())
  const [workspaceSync, setWorkspaceSync] = useState<'idle' | 'syncing' | 'synced' | 'error'>('idle')
  const [view, setView] = useState<AppView>('dashboard')
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
        selectedCustomerId: syncedCustomers.some((item) => item.id === currentId) ? currentId : syncedCustomers.find((item) => !item.archivedAt)?.id ?? null,
      })
      setWorkspaceSync('synced')
    }).catch(() => setWorkspaceSync('error'))
  }, [accessUser, initialized, workspaceSync])

  if (!accessUser) return <AccessGate onAllowed={setAccessUser} />

  const activeLabel = view === 'dashboard' ? '工作台' : view === 'customers' ? '客户档案' : view === 'balance' ? '资产负债' : view === 'cashflow' ? '收支储蓄' : view === 'goals' ? '家庭目标' : '分析报告'
  const currentNavigation = navigation.map((item) => ({
    ...item,
    active: item.label === activeLabel,
  }))

  function openView(label: string) {
    if (label === '工作台') setView('dashboard')
    if (label === '客户档案') {
      selectCustomer('')
      setView('customers')
    }
    if (label === '资产负债') setView('balance')
    if (label === '收支储蓄') setView('cashflow')
    if (label === '家庭目标') setView('goals')
    if (label === '分析报告') setView('analysis')
  }

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="主导航">
        <div className="brand-block">
          <div className="brand-mark" aria-hidden="true">衡</div>
          <div>
            <strong>家庭资产分析</strong>
            <span>本地草稿</span>
          </div>
        </div>

        <nav className="nav-list">
          {currentNavigation.map((item) => {
            const Icon = item.icon
            return (
              <button className={item.active ? 'nav-item is-active' : 'nav-item'} key={item.label} type="button" onClick={() => openView(item.label)}>
                <Icon size={21} weight={item.active ? 'fill' : 'regular'} />
                <span>{item.label}</span>
              </button>
            )
          })}
        </nav>

        <button className="sync-card" type="button" onClick={() => { clearAccessUser(); setAccessUser(null) }}>
          <UserCircleIcon size={20} />
          <div>
            <strong>{accessUser}</strong>
            <span>{workspaceSync === 'synced' ? '资料已同步' : workspaceSync === 'syncing' ? '正在同步' : workspaceSync === 'error' ? '等待云端升级' : '退出当前工作区'}</span>
          </div>
        </button>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <span className="quiet-label">客户工作区</span>
            <button className="client-switch" type="button" onClick={() => { selectCustomer(''); setView('customers') }}>
              {selectedCustomer?.householdName ?? '选择客户'} <span>⌄</span>
            </button>
          </div>
          <div className="topbar-actions">
            <div className={saveState === 'error' ? 'save-status has-error' : 'save-status'}>
              <CheckCircleIcon size={18} weight="fill" /> {saveState === 'saving' ? '正在保存' : saveState === 'error' ? '保存失败' : '已保存到本机'}
            </div>
            {selectedCustomer ? <button className="save-cloud-button" disabled={saveState === 'saving' || syncState === 'syncing'} type="button" onClick={() => void syncCustomer(selectedCustomer.id)}>
              {syncState === 'syncing' ? '正在同步' : syncState === 'synced' ? '云端已保存' : syncState === 'error' ? '重试同步' : '保存并同步'}
            </button> : null}
            <button className="cloud-status-button" type="button" onClick={() => { clearAccessUser(); setAccessUser(null) }}>
              <SignOutIcon size={18} />
              <span>{accessUser} · 退出</span>
            </button>
          </div>
        </header>

        {view === 'customers' ? (
          <div className="page-wrap"><CustomerDirectory onOpenDashboard={() => setView('dashboard')} /></div>
        ) : view === 'balance' || view === 'cashflow' || view === 'goals' ? (
          <div className="page-wrap"><FinancialWorkspace section={view} onChooseCustomer={() => { selectCustomer(''); setView('customers') }} /></div>
        ) : view === 'analysis' ? (
          <div className="page-wrap"><Suspense fallback={<div className="report-skeleton" aria-label="正在生成分析报告"><span /><span /><span /></div>}><AnalysisDashboard onChooseCustomer={() => { selectCustomer(''); setView('customers') }} /></Suspense></div>
        ) : (
        <div className="page-wrap">
          <section className="intro-row">
            <div>
              <h1>{selectedCustomer ? `先看清${selectedCustomer.householdName}的财务全貌` : '先建立客户档案，再开始家庭财务分析'}</h1>
              <p>资料完成后，系统会解释现金储备、负债压力和年度结余，并给出可执行的改善顺序。</p>
            </div>
            <button className="primary-action" type="button" onClick={() => { if (selectedCustomer) selectCustomer(selectedCustomer.id); setView('customers') }}>
              {selectedCustomer ? '继续完善资料' : '新建客户档案'} <ArrowRightIcon size={18} />
            </button>
          </section>

          <section className="metric-strip" aria-label="家庭财务摘要">
            <article>
              <span>资料完成度</span>
              <strong>{selectedCustomer ? '18%' : '0%'}</strong>
              <small>{selectedCustomer ? '已建立家庭基本信息' : '等待新建客户'}</small>
            </article>
            <article>
              <span>总资产</span>
              <strong>待录入</strong>
              <small>包含固定与金融资产</small>
            </article>
            <article>
              <span>年度结余</span>
              <strong>待计算</strong>
              <small>完成收支后自动生成</small>
            </article>
          </section>

          <section className="work-grid">
            <article className="next-panel">
              <div className="section-heading">
                <div>
                  <h2>下一步</h2>
                  <p>按顺序补充资料，减少遗漏和重复填写。</p>
                </div>
                <span className="progress-value">1 / 3</span>
              </div>
              <div className="task-list">
                {tasks.map((task) => (
                  <button className={task.done ? 'task-row is-done' : 'task-row'} key={task.title} type="button">
                    <span className="task-index">{task.done ? <CheckCircleIcon size={20} weight="fill" /> : null}</span>
                    <span className="task-copy"><strong>{task.title}</strong><small>{task.detail}</small></span>
                    <ArrowRightIcon className="row-arrow" size={18} />
                  </button>
                ))}
              </div>
            </article>

            <aside className="insight-panel">
              <span className="quiet-label">分析准备</span>
              <h2>结论来自原始数据，不靠固定话术。</h2>
              <p>每项健康判断都会显示公式、参考区间、影响因素和建议优先级。</p>
              <div className="insight-foot"><span>当前状态</span><strong>等待完整数据</strong></div>
            </aside>
          </section>
        </div>
        )}
      </main>

      <nav className="mobile-nav" aria-label="移动端导航">
        {currentNavigation.map((item) => {
          const Icon = item.icon
          return <button className={item.active ? 'is-active' : ''} key={item.label} type="button" onClick={() => openView(item.label)}><Icon size={21} /><span>{item.label}</span></button>
        })}
      </nav>
    </div>
  )
}

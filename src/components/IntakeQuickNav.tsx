import {
  BuildingsIcon,
  ClipboardTextIcon,
  CurrencyCircleDollarIcon,
  FileTextIcon,
  TrendUpIcon,
  UsersThreeIcon,
  WalletIcon,
} from '@phosphor-icons/react'
import type { IntakeStepKey } from '../types/domain'

export type IntakeView = 'overview' | IntakeStepKey
export type IntakeNavTarget = IntakeView | 'report'

export const intakeStepMeta: Array<{ key: IntakeStepKey; title: string; description: string; icon: typeof UsersThreeIcon }> = [
  { key: 'profile', title: '客户资料', description: '联系人、所在城市与备注', icon: ClipboardTextIcon },
  { key: 'members', title: '家庭成员', description: '成员关系、年龄、工作及健康情况', icon: UsersThreeIcon },
  { key: 'fixed_assets', title: '固定资产', description: '房产、车辆及其他长期资产', icon: BuildingsIcon },
  { key: 'liquid_assets', title: '流动资产与负债', description: '现金、金融资产、贷款与月供', icon: WalletIcon },
  { key: 'cashflow', title: '生活收支', description: '按成员收入与家庭整体支出', icon: TrendUpIcon },
  { key: 'education', title: '教育期望', description: '教育路线、时间与资金准备', icon: CurrencyCircleDollarIcon },
]

interface Props {
  activeView: IntakeNavTarget
  filled: Set<IntakeStepKey>
  locked?: boolean
  onSelect: (target: IntakeNavTarget) => void
}

export function IntakeQuickNav({ activeView, filled, locked = false, onSelect }: Props) {
  return <nav className="intake-quick-nav" aria-label="客户资料快速切换">
    <button className={activeView === 'overview' ? 'quick-nav-item is-active' : 'quick-nav-item'} disabled={locked} type="button" onClick={() => onSelect('overview')}><FileTextIcon size={17} /><span>录入总览</span></button>
    {intakeStepMeta.map((item) => {
      const Icon = item.icon
      const itemLocked = locked && item.key !== 'profile'
      return <button aria-label={itemLocked ? `${item.title}，请先填写姓名` : item.title} className={activeView === item.key ? 'quick-nav-item is-active' : 'quick-nav-item'} disabled={itemLocked} type="button" key={item.key} onClick={() => onSelect(item.key)}><Icon size={17} /><span>{item.title}</span>{filled.has(item.key) ? <i aria-label="已填写" /> : null}</button>
    })}
    <button aria-label={locked ? '分析报告，请先填写姓名' : '分析报告'} className={activeView === 'report' ? 'quick-nav-item report is-active' : 'quick-nav-item report'} disabled={locked} type="button" onClick={() => onSelect('report')}><FileTextIcon size={17} /><span>分析报告</span></button>
  </nav>
}

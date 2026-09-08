import { useState, type FormEvent } from 'react'
import { ArrowLeftIcon, ArrowRightIcon, BriefcaseIcon, HouseLineIcon, KeyIcon, ShieldCheckIcon } from '@phosphor-icons/react'
import jojoLogo from '../../assets/branding/jojo-personal-logo.png'
import { isUsernameAllowed, normalizeUsername, saveAccessSession } from '../lib/access'
import { redeemClientInvitation } from '../lib/publicIntake'
import { confirmWorkspaceUsername } from '../lib/usernameSync'

interface Props {
  onAdminAllowed: (username: string) => void
  onStartSelfService: () => void
}

export function AccessGate({ onAdminAllowed, onStartSelfService }: Props) {
  const [screen, setScreen] = useState<'choice' | 'invite' | 'admin'>('choice')
  const [username, setUsername] = useState('')
  const [accessCode, setAccessCode] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    const normalized = normalizeUsername(username)
    if (!isUsernameAllowed(normalized)) {
      setError('该用户名不在访问名单中')
      return
    }
    setChecking(true)
    setError('')
    try {
      if (!await confirmWorkspaceUsername(normalized, accessCode)) {
        setError('用户名或访问密码不正确')
        return
      }
      onAdminAllowed(saveAccessSession(normalized, accessCode))
    } catch { setError('暂时无法验证，请检查网络后重试') }
    finally { setChecking(false) }
  }

  async function submitInvite(event: FormEvent) {
    event.preventDefault()
    setChecking(true)
    setError('')
    try {
      await redeemClientInvitation(inviteCode)
      onStartSelfService()
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : ''
      setError(message.includes('cloud_unavailable') ? '当前无法连接云端，请检查网络后重试' : '邀请码无效或 3 次登录机会已用完，请联系顾问')
    } finally {
      setChecking(false)
    }
  }

  if (screen === 'invite') return <main className="access-page">
    <section className="access-card invite-access-card">
      <button className="access-back-button" type="button" onClick={() => { setScreen('choice'); setInviteCode(''); setError('') }}><ArrowLeftIcon size={17} /> 返回模式选择</button>
      <div className="access-brand invite-brand"><img src={jojoLogo} alt="Jojo" /></div>
      <span className="quiet-label">家庭财务自测</span>
      <h1>输入客户邀请码</h1>
      <p>请输入顾问提供的邀请码，验证后即可开始填写。</p>
      <form onSubmit={submitInvite}>
        <label className="field-block"><span>邀请码</span><div className="invite-code-control"><KeyIcon aria-hidden="true" size={19} /><input autoCapitalize="none" autoComplete="off" autoCorrect="off" autoFocus maxLength={10} spellCheck={false} value={inviteCode} onChange={(event) => { setInviteCode(event.target.value); setError('') }} placeholder="请输入顾问提供的邀请码" /></div></label>
        {error ? <p className="access-error" role="alert">{error}</p> : null}
        <button className="primary-action" disabled={checking || !inviteCode.trim()} type="submit">{checking ? '正在验证' : '验证并开始填写'} <ArrowRightIcon size={18} /></button>
      </form>
      <div className="access-foot"><ShieldCheckIcon size={17} /><span>每个邀请码最多登录 3 次，客户资料与其他档案隔离保存</span></div>
    </section>
  </main>

  if (screen === 'admin') return <main className="access-page">
    <section className="access-card admin-access-card">
      <button className="access-back-button" type="button" onClick={() => { setScreen('choice'); setError('') }}><ArrowLeftIcon size={17} /> 返回模式选择</button>
      <div className="access-brand"><img src={jojoLogo} alt="Jojo" /></div>
      <span className="quiet-label">顾问管理</span>
      <h1>进入管理工作区</h1>
      <p>请输入管理员用户名和访问密码。</p>
      <form onSubmit={submit}>
        <label className="field-block"><span>用户名</span><input autoCapitalize="none" autoComplete="username" autoFocus value={username} onChange={(event) => { setUsername(event.target.value); setError('') }} placeholder="请输入用户名" /></label>
        <label className="field-block"><span>访问密码</span><input type="password" autoComplete="current-password" value={accessCode} onChange={(event) => { setAccessCode(event.target.value); setError('') }} placeholder="请输入访问密码" /></label>
        {error ? <p className="access-error" role="alert">{error}</p> : null}
        <button className="primary-action" disabled={checking || !username.trim() || !accessCode} type="submit">{checking ? '正在验证' : '进入管理工作区'} <ArrowRightIcon size={18} /></button>
      </form>
      <div className="access-foot"><ShieldCheckIcon size={17} /><span>管理员工作区受账号和访问密码保护</span></div>
    </section>
  </main>

  return <main className="access-page access-choice-page">
    <section className="access-choice-card">
      <div className="access-choice-heading">
        <div aria-label="JoJo · 你的家庭资产管理顾问" className="access-brand-lockup">
          <div className="access-brand"><img src={jojoLogo} alt="" /></div>
          <div className="access-brand-copy"><strong>JoJo <i aria-hidden="true">·</i></strong><span>你的家庭资产管理顾问</span></div>
        </div>
        <span className="quiet-label">家庭财务分析</span>
        <h1>选择使用方式</h1>
        <p>您可以自行梳理家庭资料并查看初步报告，也可以进入顾问管理工作区。</p>
      </div>
      <div className="access-mode-grid">
        <button className="access-mode-card self-service-mode" type="button" onClick={() => { setScreen('invite'); setError('') }}>
          <span className="access-mode-icon"><HouseLineIcon size={26} /></span>
          <span><small>客户邀请码</small><strong>家庭财务自测</strong><em>验证顾问提供的邀请码后，按自己的节奏填写并查看专属报告。</em></span>
          <ArrowRightIcon className="access-mode-arrow" size={20} />
        </button>
        <button className="access-mode-card" type="button" onClick={() => setScreen('admin')}>
          <span className="access-mode-icon"><BriefcaseIcon size={26} /></span>
          <span><small>管理员入口</small><strong>顾问管理</strong><em>管理顾问录入与客户自填档案，查看并解读分析报告。</em></span>
          <ArrowRightIcon className="access-mode-arrow" size={20} />
        </button>
      </div>
      <div className="access-choice-foot"><ShieldCheckIcon size={17} /><span>客户自填资料将加密传输，并与其他客户档案隔离保存</span></div>
    </section>
  </main>
}

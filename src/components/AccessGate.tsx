import { useState, type FormEvent } from 'react'
import { ArrowRightIcon, ShieldCheckIcon } from '@phosphor-icons/react'
import { isUsernameAllowed, normalizeUsername, saveAccessSession } from '../lib/access'
import { confirmWorkspaceUsername } from '../lib/usernameSync'

interface Props { onAllowed: (username: string) => void }

export function AccessGate({ onAllowed }: Props) {
  const [username, setUsername] = useState('')
  const [accessCode, setAccessCode] = useState('')
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
      onAllowed(saveAccessSession(normalized, accessCode))
    } catch { setError('暂时无法验证，请检查网络后重试') }
    finally { setChecking(false) }
  }

  return <main className="access-page">
    <section className="access-card">
      <div className="access-brand" aria-hidden="true">衡</div>
      <span className="quiet-label">家庭资产分析</span>
      <h1>进入客户工作区</h1>
      <p>请输入白名单用户名和访问密码。</p>
      <form onSubmit={submit}>
        <label className="field-block"><span>用户名</span><input autoCapitalize="none" autoComplete="username" autoFocus value={username} onChange={(event) => { setUsername(event.target.value); setError('') }} placeholder="请输入用户名" /></label>
        <label className="field-block"><span>访问密码</span><input type="password" inputMode="numeric" autoComplete="current-password" value={accessCode} onChange={(event) => { setAccessCode(event.target.value); setError('') }} placeholder="请输入访问密码" /></label>
        {error ? <p className="access-error" role="alert">{error}</p> : null}
        <button className="primary-action" disabled={checking || !username.trim() || !accessCode} type="submit">{checking ? '正在验证' : '进入工具'} <ArrowRightIcon size={18} /></button>
      </form>
      <div className="access-foot"><ShieldCheckIcon size={17} /><span>名单外用户无法查看客户工作区</span></div>
    </section>
  </main>
}

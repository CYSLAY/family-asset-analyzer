import { useEffect, useState } from 'react'
import { getConflicts, getCustomers, getLegacyCustomers, getLocalWorkspace, getRecoveryCustomers, putCustomer, resolveConflict, type CustomerConflict } from '../lib/localDb'
import { PrivateText } from '../lib/privacy'
import { useCustomerStore } from '../stores/customerStore'
import type { CustomerProfile } from '../types/domain'
import { migrateCustomerProfile } from '../lib/customerMigrations'

function VersionSummary({ customer, label }: { customer: CustomerProfile; label: string }) {
  return <div><strong>{label}</strong><p><PrivateText>{customer.primaryContactName} · {customer.city}</PrivateText></p><p>{customer.members.length} 位成员 · {customer.assets.length} 项资产 · {customer.liabilities.length} 项负债</p><p>资产合计 {customer.assets.reduce((total, item) => total + item.currentValue, 0).toLocaleString('zh-CN')} 元<br />负债合计 {customer.liabilities.reduce((total, item) => total + item.balance, 0).toLocaleString('zh-CN')} 元</p><p>备注：<PrivateText>{customer.notes || '无'}</PrivateText></p><small>本机记录时间 {new Date(customer.updatedAt).toLocaleString('zh-CN')}（不作为覆盖依据）</small></div>
}

export function DataRecoveryPanel({ advisor }: { advisor: boolean }) {
  const [conflicts, setConflicts] = useState<CustomerConflict[]>([])
  const [password, setPassword] = useState('')
  const [preview, setPreview] = useState<CustomerProfile[]>([])
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const customers = useCustomerStore(state => state.customers)
  useEffect(() => {
    let active = true
    const refresh = () => { void getConflicts().then(items => { if (active) setConflicts(items) }).catch(() => undefined) }
    refresh(); const timer = setInterval(refresh, 4000)
    return () => { active = false; clearInterval(timer) }
  }, [])
  async function run(action: () => Promise<void>) {
    setBusy(true); setMessage('')
    try { await action() } catch (error) { setMessage(error instanceof Error ? error.message : '操作未完成，请重试') }
    finally { setBusy(false) }
  }
  async function resolve(item: CustomerConflict, choice: 'local' | 'remote') {
    if (!window.confirm(`使用${choice === 'local' ? '本机' : '云端'}版本继续？两份原始内容都会保留在本机恢复区。`)) return
    await resolveConflict(item, choice)
    useCustomerStore.setState({ customers: await getCustomers() })
    setConflicts(await getConflicts())
    setMessage(choice === 'local' ? '本机版本已保留，将重新尝试同步。' : '已采用云端版本。原始副本保留在恢复区。')
  }
  return <section className="data-recovery-panel">
    {conflicts.length > 0 ? <div role="alert"><strong>有 {conflicts.length} 份档案需要处理同步冲突</strong><p>两台设备都修改过资料，系统未自动覆盖。</p>{conflicts.map(item => <div key={item.id} className="recovery-conflict"><PrivateText>{item.local.primaryContactName || '未命名客户'}</PrivateText><span>云端版本 {item.revision}</span><details><summary>比较两个版本</summary><div className="recovery-versions"><VersionSummary customer={item.local} label="本机版本" /><VersionSummary customer={item.remote} label="云端版本" /></div></details><button disabled={busy} onClick={() => void run(() => resolve(item, 'local'))}>保留本机修改</button><button disabled={busy} onClick={() => void run(() => resolve(item, 'remote'))}>使用云端版本</button></div>)}</div> : null}
    {advisor ? <details><summary>备份与资料恢复</summary><p>备份使用密码加密。恢复只生成新副本，不覆盖已有档案，也不会自动上传。</p><label>备份密码<input type="password" autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} placeholder="至少 8 位，请妥善保管" /></label><div className="recovery-actions"><button disabled={busy || password.length < 8} onClick={() => void run(async () => {
      const { createEncryptedBackup } = await import('../lib/backup')
      const text = await createEncryptedBackup(customers, password)
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
      const link = document.createElement('a'); link.href = url; link.download = `family-backup-${new Date().toISOString().slice(0, 10)}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
      setMessage('已发起备份下载，请确认文件已保存。')
    })}>下载加密备份</button><label>读取备份<input type="file" accept=".json" disabled={busy || password.length < 8} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void run(async () => { if (file.size > 20_000_000) throw Error('文件过大'); setPreview(await (await import('../lib/backup')).readEncryptedBackup(await file.text(), password)) }) }} /></label><button disabled={busy} onClick={() => void run(async () => setPreview(await getRecoveryCustomers()))}>读取恢复区</button><button disabled={busy} onClick={() => { if (window.confirm('旧版本本机资料没有账号归属标记。请仅在确认该设备资料属于您时继续。原始资料会保留不变。')) void run(async () => setPreview(await getLegacyCustomers())) }}>读取旧版本本机资料</button></div>
      {preview.length > 0 ? <div><p>发现 {preview.length} 份资料。将创建 {preview.length} 份顾问档案副本；现有档案保持不变。</p><button disabled={busy} onClick={() => void run(async () => {
        if (!window.confirm(`确认将 ${preview.length} 份资料作为新副本恢复到当前工作区？`)) return
        const workspace = getLocalWorkspace()
        for (const item of preview) {
          if (workspace !== getLocalWorkspace()) throw Error('工作区已切换，恢复已停止')
          const document = migrateCustomerProfile(item).customer
          await putCustomer({ ...document, id: crypto.randomUUID(), source: 'advisor', householdName: `${document.householdName}（恢复副本）`, updatedAt: new Date().toISOString(), archivedAt: null })
        }
        useCustomerStore.setState({ customers: await getCustomers() }); setPreview([]); setMessage('恢复完成，尚未上传云端。')
      })}>确认恢复为新副本</button><button onClick={() => setPreview([])}>取消</button></div> : null}
    </details> : null}
    {message ? <p role="status">{message}</p> : null}
  </section>
}

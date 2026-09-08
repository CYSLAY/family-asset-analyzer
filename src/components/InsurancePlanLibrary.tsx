import { useEffect, useState } from 'react'
import { INSURANCE_NAMES, type InsuranceInputs, type InsuranceProduct } from '../lib/insuranceCalculator'
import { deleteInsurancePlan, exportInsurancePlan, listInsurancePlans, saveInsurancePlan, type SavedInsurancePlan } from '../lib/insurancePlans'
import { PrivateControl, PrivateText } from '../lib/privacy'
import { useUnsavedChanges } from '../lib/unsavedChanges'

export function InsurancePlanLibrary({ advisor, product, inputs, valid, hasInvalidDraft, onLoad }: { advisor: string; product: InsuranceProduct; inputs: InsuranceInputs; valid: boolean; hasInvalidDraft: () => boolean; onLoad: (plan: SavedInsurancePlan) => void }) {
  const [name, setName] = useState('')
  const [plans, setPlans] = useState<SavedInsurancePlan[]>([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [unreadable, setUnreadable] = useState(0)
  useUnsavedChanges(Boolean(name.trim()))
  function refresh() {
    try { const saved = listInsurancePlans(advisor); setPlans(saved.plans); setUnreadable(saved.unreadable); setError('') }
    catch { setError('无法读取本机方案，请检查浏览器存储权限。已有数据不会被清除。') }
  }
  useEffect(() => { refresh(); window.addEventListener('storage', refresh); return () => window.removeEventListener('storage', refresh) }, [advisor])
  function save() {
    if (!valid || hasInvalidDraft()) { setError('请先修正无效参数，再保存方案。'); return }
    if (!name.trim()) { setError('请填写方案名称。'); return }
    try {
      saveInsurancePlan(advisor, name, product, inputs)
      refresh(); setNotice('已保存为独立副本，可在本机重新打开。'); setName('')
    } catch { setError('保存失败，请检查参数或浏览器存储空间。当前测算仍保留在页面。') }
  }
  return <section className="sic-panel sic-library" aria-label="本机方案库">
    <h2>我的测算方案</h2><p>保存当前产品的全部参数及逐年设置。每次保存为新副本，不覆盖已有方案、不上传客户档案。</p>
    <div className="sic-library-save"><label><span>方案名称</span><PrivateControl><input aria-label="方案名称" maxLength={80} value={name} onChange={event => setName(event.target.value)} placeholder="例如：5 年缴费 · 退休提款" /></PrivateControl></label><button type="button" className="sic-reset" disabled={!valid} onClick={save}>保存为新方案</button></div>
    {error && <p className="sic-error" role="alert">{error}</p>}{notice && <p className="sic-notice" role="status">{notice}</p>}
    {unreadable > 0 && <p role="alert">有 {unreadable} 份方案暂时无法读取，原始记录已保留，未被覆盖或删除。</p>}
    <details><summary>已保存方案（{plans.length}）</summary><ul className="sic-library-list">{plans.map(plan => <li key={plan.id}><div><strong><PrivateText>{plan.name}</PrivateText></strong><small>{INSURANCE_NAMES[plan.product]} · {plan.inputs.term} 年交 · {new Date(plan.createdAt).toLocaleString('zh-CN')}</small></div><div className="sic-library-actions"><button type="button" className="sic-reset" onClick={() => { if (window.confirm('打开此方案将替换当前产品的测算参数。尚未命名保存的修改不会加入方案库，是否继续？')) { onLoad(plan); setNotice('已打开保存的参数；后续修改不影响原方案。') } }}>打开</button><button type="button" className="sic-reset" onClick={() => { try { exportInsurancePlan(plan); setNotice('已导出方案文件，文件未加密，请妥善保管。') } catch { setError('导出失败，请检查浏览器下载权限后重试。') } }}>导出</button><button type="button" className="sic-reset" onClick={() => { if (window.confirm('删除这份本机方案？不会删除客户档案或当前测算；删除后只能通过已导出的文件找回参数。')) { try { deleteInsurancePlan(advisor, plan.id); refresh(); setNotice('已删除本机方案，当前测算未改变。') } catch { setError('删除失败，方案仍保留在本机。') } } }}>删除</button></div></li>)}</ul>{!plans.length && <p>尚未保存方案。</p>}</details>
    <small>本机保存不是云端备份。清除浏览器数据会移除方案；建议导出重要方案，文件包含名称及测算参数。</small>
  </section>
}

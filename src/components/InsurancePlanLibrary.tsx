import { useEffect, useState } from 'react'
import { INSURANCE_NAMES, type InsuranceInputs, type InsuranceProduct } from '../lib/insuranceCalculator'
import { deleteInsurancePlan, exportInsurancePlan, listInsurancePlans, parseInsurancePlan, saveInsurancePlan, type SavedInsurancePlan } from '../lib/insurancePlans'
import { PrivateControl, PrivateText } from '../lib/privacy'
import { useUnsavedChanges } from '../lib/unsavedChanges'
import { useCustomerStore } from '../stores/customerStore'

export function InsurancePlanLibrary({ advisor, product, inputs, valid, hasInvalidDraft, onLoad }: { advisor: string; product: InsuranceProduct; inputs: InsuranceInputs; valid: boolean; hasInvalidDraft: () => boolean; onLoad: (plan: SavedInsurancePlan) => void }) {
  const [name, setName] = useState('')
  const [plans, setPlans] = useState<SavedInsurancePlan[]>([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [unreadable, setUnreadable] = useState(0)
  const { customers, updateCustomer } = useCustomerStore()
  const [targetId, setTargetId] = useState('')
  const [exchangeRate, setExchangeRate] = useState('')
  async function apply(plan: SavedInsurancePlan) {
    try {
      const customer = useCustomerStore.getState().customers.find(item => item.id === targetId)
      if (!customer) throw Error('请先选择要应用的客户。')
      const fx = plan.inputs.currency.startsWith('RMB') ? 1 : Number(exchangeRate)
      if (!(fx > 0) || !Number.isFinite(fx)) throw Error('请填写 1 单位方案显示币种可兑换的人民币金额。')
      if (!window.confirm(`将${INSURANCE_NAMES[plan.product]}方案应用到所选客户？按 1 单位显示币种 = ${fx} 元人民币折算，从客户现金流起始年开始缴费；原有收支不变，替换的仅是储蓄险场景。`)) return
      const { createCashFlowPlanFromCustomer } = await import('../lib/cashFlowPlan')
      if (useCustomerStore.getState().customers.find(item => item.id === targetId) !== customer) throw Error('客户资料已变化，请重新应用。')
      await updateCustomer(customer.id, { cashFlowPlan: { ...(customer.cashFlowPlan ?? createCashFlowPlanFromCustomer(customer)), insuranceScenario: { version: 1, model: plan.model, name: plan.name, product: plan.product, inputs: structuredClone(plan.inputs), exchangeRateToRmb: fx } } })
      if (useCustomerStore.getState().saveState === 'error') throw Error('方案已在页面更新，但本机保存失败。请勿关闭页面，先下载备份。')
      setNotice('方案已应用到客户的现金流场景。请前往现金流管理查看，并保存同步。')
    } catch (error) { setError(error instanceof Error ? error.message : '方案应用失败。') }
  }
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
    <label>导入已导出的方案<input type="file" accept=".json" onChange={event => {
      const file = event.target.files?.[0]; event.target.value = ''
      if (!file) return
      void (async () => {
        try {
          if (file.size > 1_000_000) throw Error('方案文件过大。')
          const plan = parseInsurancePlan(await file.text())
          if (!window.confirm(`已读取${INSURANCE_NAMES[plan.product]}方案，${plan.inputs.term} 年缴费。确认保存为新的本机副本？不会覆盖任何已有方案。`)) return
          saveInsurancePlan(advisor, plan.name, plan.product, plan.inputs); refresh(); setNotice('已导入为新副本，可在已保存方案中打开。')
        } catch (error) { setError(error instanceof Error ? error.message : '无法导入方案。') }
      })()
    }} /></label>
    {error && <p className="sic-error" role="alert">{error}</p>}{notice && <p className="sic-notice" role="status">{notice}</p>}
    {unreadable > 0 && <p role="alert">有 {unreadable} 份方案暂时无法读取，原始记录已保留，未被覆盖或删除。</p>}
    <details><summary>已保存方案（{plans.length}）</summary><ul className="sic-library-list">{plans.map(plan => <li key={plan.id}><div><strong><PrivateText>{plan.name}</PrivateText></strong><small>{INSURANCE_NAMES[plan.product]} · {plan.inputs.term} 年交 · {new Date(plan.createdAt).toLocaleString('zh-CN')}</small></div><div className="sic-library-actions"><button type="button" className="sic-reset" onClick={() => { if (window.confirm('打开此方案将替换当前产品的测算参数。尚未命名保存的修改不会加入方案库，是否继续？')) { onLoad(plan); setNotice('已打开保存的参数；后续修改不影响原方案。') } }}>打开</button><button type="button" className="sic-reset" onClick={() => { try { exportInsurancePlan(plan); setNotice('已导出方案文件，文件未加密，请妥善保管。') } catch { setError('导出失败，请检查浏览器下载权限后重试。') } }}>导出</button><button type="button" className="sic-reset" onClick={() => { if (window.confirm('删除这份本机方案？不会删除客户档案或当前测算；删除后只能通过已导出的文件找回参数。')) { try { deleteInsurancePlan(advisor, plan.id); refresh(); setNotice('已删除本机方案，当前测算未改变。') } catch { setError('删除失败，方案仍保留在本机。') } } }}>删除</button></div></li>)}</ul>{!plans.length && <p>尚未保存方案。</p>}</details>
    <small>本机保存不是云端备份。清除浏览器数据会移除方案；建议导出重要方案，文件包含名称及测算参数。</small>
    <details><summary>应用方案到客户现金流</summary><p>只替换储蓄险假设，不改动客户的日常收入与支出。请先保存方案，再选择客户。</p><div className="sic-library-save"><label>目标客户<PrivateControl><select value={targetId} onChange={event => setTargetId(event.target.value)}><option value="">请选择客户</option>{customers.map(customer => <option key={customer.id} value={customer.id}>{customer.primaryContactName || customer.householdName}</option>)}</select></PrivateControl></label><label>折算汇率（人民币 / 显示币种）<input inputMode="decimal" value={exchangeRate} onChange={event => setExchangeRate(event.target.value)} placeholder="人民币方案自动使用 1" /></label></div>{plans.map(plan => <div className="sic-library-actions" key={plan.id}><PrivateText>{plan.name}</PrivateText><span>{INSURANCE_NAMES[plan.product]} · {plan.inputs.currency}</span><button className="sic-reset" disabled={!targetId} onClick={() => void apply(plan)}>确认应用此方案</button></div>)}</details>
  </section>
}

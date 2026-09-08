import { useEffect, useMemo, useState } from 'react'
import { z } from 'zod'
import { PlusIcon, TrashIcon } from '@phosphor-icons/react'
import { calculateMedical, combineMedical, displayCurrency, insuredCurrency, MEDICAL_FX, MEDICAL_PRODUCTS,
  type MedicalProduct, type MedicalYear } from '../lib/medicalCalculator'
import './MedicalProtectionCalculator.css'
import { useUnsavedChanges } from '../lib/unsavedChanges'

const cardSchema = z.object({ id: z.string(), product: z.enum(['CIM3', 'CIE3', 'CIP2']), amount: z.string().max(40), term: z.number(), currency: z.enum(['USD', 'HKD', 'HKD-U', 'RMB-U']) })
const draftSchema = z.object({ age: z.string().max(10), gender: z.enum(['M', 'F']), smoker: z.enum(['N', 'S']), region: z.enum(['A', 'B']),
  hkd: z.string().max(40), rmb: z.string().max(40), cards: z.array(cardSchema).max(30) }).refine(d => new Set(d.cards.map(c => c.id)).size === d.cards.length)
type Card = z.infer<typeof cardSchema>
type Draft = z.infer<typeof draftSchema>
const newCard = (): Card => ({ id: crypto.randomUUID(), product: 'CIM3', amount: '', term: 5, currency: 'USD' })
const defaults = (): Draft => ({ age: '', gender: 'M', smoker: 'N', region: 'A', hkd: String(MEDICAL_FX.hkdPerUsd), rmb: String(MEDICAL_FX.rmbPerUsd), cards: [newCard()] })
const money = (n: number) => n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const numeric = (text: string) => text.trim() && /^\d+(\.\d+)?$/.test(text.trim()) ? Number(text) : NaN
type Outcome = { result: ReturnType<typeof calculateMedical>; error?: never } | { result?: never; error: string }

export function MedicalProtectionCalculator({ advisor }: { advisor: string }) {
  const storageKey = `jojo-medical-v1:${advisor}`
  const [initial] = useState(() => {
    try {
      const saved = sessionStorage.getItem(storageKey)
      return { draft: saved ? draftSchema.parse(JSON.parse(saved)) : defaults(), blocked: false }
    } catch { return { draft: defaults(), blocked: true } }
  })
  const [draft, setDraft] = useState(initial.draft)
  const [storageError, setStorageError] = useState(initial.blocked ? '会话草稿无法读取，原记录未被覆盖。本次修改仅在当前页面保留。' : '')
  useUnsavedChanges(Boolean(storageError) && draft !== initial.draft)
  useEffect(() => {
    if (initial.blocked) return
    try { sessionStorage.setItem(storageKey, JSON.stringify(draft)); setStorageError('') }
    catch { setStorageError('浏览器无法暂存，本次修改仅在当前页面保留。') }
  }, [draft, initial.blocked, storageKey])
  const outcomes = useMemo<Outcome[]>(() => draft.cards.map(card => {
    try { return { result: calculateMedical({ age: numeric(draft.age), gender: draft.gender, smoker: draft.smoker, region: draft.region },
      { ...card, amount: numeric(card.amount) }, { hkdPerUsd: numeric(draft.hkd), rmbPerUsd: numeric(draft.rmb) }) } }
    catch (error) { return { error: error instanceof Error ? error.message : '暂时无法计算，请检查参数' } }
  }), [draft])
  const summary = outcomes.length && outcomes.every(o => o.result) ? combineMedical(outcomes.map(o => o.result!)) : null
  function updateCard(id: string, patch: Partial<Card>) { setDraft(d => ({ ...d, cards: d.cards.map(c => c.id === id ? { ...c, ...patch } : c) })) }
  function remove(card: Card) {
    if (card.amount.trim() && !window.confirm('移除这份保险及其投保信息？其他保险不受影响。')) return
    setDraft(d => ({ ...d, cards: d.cards.filter(c => c.id !== card.id) }))
  }
  return <section className="medical-calculator" aria-label="医疗保障计算工具">
    <header><h1>医疗保障计算</h1><p>组合多份危疾保障，核算年保费与缴费期总保费。不计任何折扣。</p></header>
    {storageError && <p className="medical-error" role="alert">{storageError}</p>}
    <section className="medical-panel" aria-labelledby="medical-profile-title">
      <h2 id="medical-profile-title">客户基础信息</h2>
      <div className="medical-fields">
        <label>投保翌年岁（ANB）<input inputMode="numeric" value={draft.age} placeholder="填写翌年生日年龄" aria-invalid={!!draft.age && (!Number.isInteger(numeric(draft.age)) || numeric(draft.age) < 1 || numeric(draft.age) > 75)} onChange={e => setDraft({ ...draft, age: e.target.value })} /></label>
        <label>性别<select value={draft.gender} onChange={e => setDraft({ ...draft, gender: e.target.value as Draft['gender'] })}><option value="M">男</option><option value="F">女</option></select></label>
        <label>吸烟情况<select value={draft.smoker} onChange={e => setDraft({ ...draft, smoker: e.target.value as Draft['smoker'] })}><option value="N">不吸烟</option><option value="S">吸烟</option></select></label>
        <label>地区类别<select value={draft.region} onChange={e => setDraft({ ...draft, region: e.target.value as Draft['region'] })}><option value="A">A 类</option><option value="B">B 类</option></select></label>
      </div>
      <p className="medical-note">地区类别沿用原表 A/B 定义，请按承保口径确认；CIE3 不使用此项。</p>
    </section>
    {draft.cards.map((card, index) => <section className="medical-panel" key={card.id} aria-label={`保险 ${index + 1}`}>
      <div className="medical-card-heading"><h2>保险 {index + 1}</h2><button type="button" aria-label={`移除保险 ${index + 1}`} onClick={() => remove(card)}><TrashIcon size={18} />移除</button></div>
      <div className="medical-fields">
        <label>保险产品<select value={card.product} onChange={e => { const product = e.target.value as MedicalProduct; updateCard(card.id, { product, term: (MEDICAL_PRODUCTS[product].terms as readonly number[]).includes(card.term) ? card.term : MEDICAL_PRODUCTS[product].terms[0] }) }}>
          {Object.entries(MEDICAL_PRODUCTS).map(([code, p]) => <option key={code} value={code}>{code} · {p.name}</option>)}
        </select></label>
        <label>投保额（{insuredCurrency(card.currency)}）<input inputMode="decimal" placeholder="填写保额" value={card.amount} aria-invalid={!!card.amount && (!Number.isFinite(numeric(card.amount)) || numeric(card.amount) <= 0)} onChange={e => updateCard(card.id, { amount: e.target.value })} /></label>
        <label>供款期<select value={card.term} onChange={e => updateCard(card.id, { term: Number(e.target.value) })}>{MEDICAL_PRODUCTS[card.product].terms.map(term => <option key={term} value={term}>{term} 年</option>)}</select></label>
        <label>保单 / 显示币种<select value={card.currency} onChange={e => updateCard(card.id, { currency: e.target.value as Card['currency'] })}><option value="USD">美元保单 · 美元显示</option><option value="HKD">港币保单 · 港币显示</option><option value="HKD-U">美元保单 · 港币显示</option><option value="RMB-U">美元保单 · 人民币显示</option></select></label>
      </div>
      <PolicyResult outcome={outcomes[index]} currency={displayCurrency(card.currency)} />
    </section>)}
    <button type="button" className="medical-add" disabled={draft.cards.length >= 30} onClick={() => setDraft(d => ({ ...d, cards: [...d.cards, newCard()] }))}><PlusIcon size={20} />新增保险{draft.cards.length >= 30 ? '（已达 30 份）' : ''}</button>
    <section className="medical-panel medical-combined" aria-labelledby="medical-summary-title">
      <h2 id="medical-summary-title">组合保费合计 <small>人民币</small></h2>
      {summary ? <><div className="medical-totals"><div><span>首年保费合计</span><strong>¥{money(summary.annual)}</strong></div><div><span>缴费期总保费</span><strong>¥{money(summary.total)}</strong></div></div>
        <details><summary>查看逐年组合保费</summary><div className="medical-table-scroll" tabIndex={0} role="region" aria-label="逐年组合保费表"><table><thead><tr><th>保单年度</th><th>年度保费（元）</th><th>累计保费（元）</th></tr></thead><tbody>{summary.years.map(r => <tr key={r.year}><th>{r.year}</th><td>{money(r.premium)}</td><td>{money(r.cumulative)}</td></tr>)}</tbody></table></div></details></>
        : <p className="medical-pending" role="status">{draft.cards.length ? '完善全部保险信息后显示合计，不计入不完整测算。' : '新增保险后开始测算。'}</p>}
      <details><summary>折算汇率与计算口径</summary><div className="medical-fields medical-fx"><label>1 美元兑港币<input inputMode="decimal" value={draft.hkd} onChange={e => setDraft({ ...draft, hkd: e.target.value })} /></label><label>1 美元兑人民币<input inputMode="decimal" value={draft.rmb} onChange={e => setDraft({ ...draft, rmb: e.target.value })} /></label></div><p className="medical-note">默认汇率取自原表 Notes，为测算假设，并非实时汇率。各保险从同一年度起投保，缴费期结束后不再计入年度保费；异币保费折算成人民币后汇总。</p></details>
    </section>
    <footer className="medical-note">数据来源：e-1-toolbox-2026-08-03.xlsx 的 CIM3 BCIM3、CIE3、CIP2 页及对应费率表。本工具仅包含三款危疾保障产品，不含胎儿版或住院报销险。保费未计推广、期满、EB 及保额档位折扣，不含另行收取的征费；以保险公司正式建议书及核保结果为准。现金价值及非保证利益按原表推算，非保证项目不代表承诺回报。草稿仅保留在当前浏览器会话，不上传客户档案。</footer>
  </section>
}

function PolicyResult({ outcome, currency }: { outcome: Outcome; currency: string }) {
  const [expanded, setExpanded] = useState(false)
  const [limit, setLimit] = useState(10)
  const detail = useMemo(() => {
    if (!expanded || !outcome.result) return { rows: [] as MedicalYear[], error: '' }
    try { return { rows: outcome.result.detail(), error: '' } }
    catch { return { rows: [] as MedicalYear[], error: '年度利益明细暂时无法核算，请以原表或正式建议书核对。' } }
  }, [expanded, outcome])
  if (!outcome.result) return <p className="medical-pending" role="status">{outcome.error}</p>
  return <><div className="medical-totals"><div><span>年保费 · {currency}</span><strong>{money(outcome.result.annual)}</strong></div><div><span>缴费期总保费 · {currency}</span><strong>{money(outcome.result.total)}</strong></div></div>
    <details open={expanded} onToggle={e => setExpanded(e.currentTarget.open)}><summary>查看年度明细</summary>
      {detail.error ? <p role="alert">{detail.error}</p> : <><label className="medical-period">显示年度<select value={limit} onChange={e => setLimit(Number(e.target.value))}><option value={10}>前 10 年</option><option value={20}>前 20 年</option><option value={100}>全部年度</option></select></label>
        <div className="medical-table-scroll" tabIndex={0} role="region" aria-label="保险年度明细表"><table><caption>金额单位：{currency}；年度末年龄与现金价值沿用原表。非保证利益可能调整。</caption><thead><tr>{['年度', '年龄', '年保费', '累计保费', '保证现金价值', '非保证现金价值', '现金价值合计', '保证保障金额', '非保证保障金额', '保障金额合计'].map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{detail.rows.slice(0, limit).map(r => <tr key={r.year}><th>{r.year}</th><td>{r.age}</td>{[r.premium, r.cumulative, r.guaranteedCash, r.bonusCash, r.cash, r.guaranteedBenefit, r.bonusBenefit, r.benefit].map((n, i) => <td key={i}>{money(n)}</td>)}</tr>)}</tbody></table></div></>}
    </details></>
}

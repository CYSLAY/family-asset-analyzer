import { useEffect, useMemo, useState } from 'react'
import { z } from 'zod'
import { PlusIcon, TrashIcon } from '@phosphor-icons/react'
import { calculateMedical, combineMedical, displayCurrency, insuredCurrency, MEDICAL_FX, MEDICAL_PRODUCTS,
  type MedicalProduct, type MedicalYear } from '../lib/medicalCalculator'
import './MedicalProtectionCalculator.css'
import { useUnsavedChanges } from '../lib/unsavedChanges'
import { ageNextBirthday, hongKongDate } from '../lib/insuranceAge'
import { HOSPITAL_PRODUCTS, HOSPITAL_SOURCES } from '../lib/hospitalCalculator'

const cardSchema = z.object({ id: z.string(), product: z.enum(['CIM3', 'CIE3', 'CIP2', 'VIP', 'MCVIP']), amount: z.string().max(40), term: z.number(), currency: z.enum(['USD', 'HKD', 'HKD-U', 'RMB-U']),
  plan: z.string().default('asia'), excess: z.number().default(0), outpatient: z.boolean().default(false), years: z.string().max(4).default('10') })
const draftSchema = z.object({ birthday: z.string().max(10).default(''), age: z.string().max(10), gender: z.enum(['M', 'F']), smoker: z.enum(['N', 'S']), region: z.enum(['A', 'B']),
  hkd: z.string().max(40), rmb: z.string().max(40), cards: z.array(cardSchema).max(30) }).refine(d => new Set(d.cards.map(c => c.id)).size === d.cards.length)
type Card = z.infer<typeof cardSchema>
type Draft = z.infer<typeof draftSchema>
const newCard = (): Card => ({ id: crypto.randomUUID(), product: 'CIM3', amount: '', term: 5, currency: 'USD', plan: 'asia', excess: 0, outpatient: false, years: '10' })
const defaults = (): Draft => ({ birthday: '', age: '', gender: 'M', smoker: 'N', region: 'A', hkd: String(MEDICAL_FX.hkdPerUsd), rmb: String(MEDICAL_FX.rmbPerUsd), cards: [newCard()] })
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
  const [today, setToday] = useState(() => hongKongDate())
  useEffect(() => {
    const refresh = () => setToday(hongKongDate())
    const timer = window.setInterval(refresh, 60000)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh) }
  }, [])
  const birthdayAge = useMemo(() => {
    if (!draft.birthday) return { value: '', error: '' }
    try { return { value: String(ageNextBirthday(draft.birthday, today)), error: '' } }
    catch (error) { return { value: '', error: error instanceof Error ? error.message : '请检查出生日期' } }
  }, [draft.birthday, today])
  const effectiveAge = draft.birthday ? birthdayAge.value : draft.age
  const [storageError, setStorageError] = useState(initial.blocked ? '会话草稿无法读取，原记录未被覆盖。本次修改仅在当前页面保留。' : '')
  useUnsavedChanges(Boolean(storageError) && draft !== initial.draft)
  useEffect(() => {
    if (initial.blocked) return
    try { sessionStorage.setItem(storageKey, JSON.stringify(draft)); setStorageError('') }
    catch { setStorageError('浏览器无法暂存，本次修改仅在当前页面保留。') }
  }, [draft, initial.blocked, storageKey])
  const outcomes = useMemo<Outcome[]>(() => draft.cards.map(card => {
    try {
      if (birthdayAge.error) throw Error(birthdayAge.error)
      return { result: calculateMedical({ age: numeric(effectiveAge), gender: draft.gender, smoker: draft.smoker, region: draft.region },
      { ...card, amount: numeric(card.amount), years: numeric(card.years) }, { hkdPerUsd: numeric(draft.hkd), rmbPerUsd: numeric(draft.rmb) }) } }
    catch (error) { return { error: error instanceof Error ? error.message : '暂时无法计算，请检查参数' } }
  }), [draft, effectiveAge, birthdayAge.error])
  const summary = outcomes.length && outcomes.every(o => o.result) ? combineMedical(outcomes.map(o => o.result!)) : null
  function updateCard(id: string, patch: Partial<Card>) { setDraft(d => ({ ...d, cards: d.cards.map(c => c.id === id ? { ...c, ...patch } : c) })) }
  function remove(card: Card) {
    if ((card.amount.trim() || card.product === 'VIP' || card.product === 'MCVIP') && !window.confirm('移除这份保险及其投保信息？其他保险不受影响。')) return
    setDraft(d => ({ ...d, cards: d.cards.filter(c => c.id !== card.id) }))
  }
  return <section className="medical-calculator" aria-label="医疗保障计算工具">
    <header><h1>医疗保障计算</h1><p>组合医疗与危疾保障，核算首年及累计保费。不计任何折扣。</p></header>
    {storageError && <p className="medical-error" role="alert">{storageError}</p>}
    <section className="medical-panel" aria-labelledby="medical-profile-title">
      <h2 id="medical-profile-title">客户基础信息</h2>
      <div className="medical-fields medical-profile-fields">
        <label>出生日期<input type="date" name="medical-birthday" autoComplete="off" max={today} value={draft.birthday} aria-invalid={!!birthdayAge.error} aria-describedby={birthdayAge.error ? 'medical-birthday-error' : 'medical-age-note'} onChange={e => setDraft({ ...draft, birthday: e.target.value })} /></label>
        <label>投保翌年岁（ANB）<input inputMode="numeric" value={effectiveAge} readOnly={!!draft.birthday} aria-describedby="medical-age-note" placeholder="填写翌年生日年龄" aria-invalid={!!effectiveAge && (!Number.isInteger(numeric(effectiveAge)) || numeric(effectiveAge) < 1 || numeric(effectiveAge) > 81)} onChange={e => { if (!draft.birthday) setDraft({ ...draft, age: e.target.value }) }} /></label>
        <label>性别<select value={draft.gender} onChange={e => setDraft({ ...draft, gender: e.target.value as Draft['gender'] })}><option value="M">男</option><option value="F">女</option></select></label>
        <label>吸烟情况<select value={draft.smoker} onChange={e => setDraft({ ...draft, smoker: e.target.value as Draft['smoker'] })}><option value="N">不吸烟</option><option value="S">吸烟</option></select></label>
        <label>地区类别<select value={draft.region} onChange={e => setDraft({ ...draft, region: e.target.value as Draft['region'] })}><option value="A">A 类</option><option value="B">B 类</option></select></label>
      </div>
      {birthdayAge.error && <p id="medical-birthday-error" className="medical-error" role="alert">{birthdayAge.error}</p>}
      <p id="medical-age-note" className="medical-note">{draft.birthday ? `按香港日期 ${today} 自动计算下次生日年龄；清空生日可手动填写。` : '生日为选填项；未填生日时，按手动填写的翌年岁测算。'} <a href="https://www.prudential.com.hk/sc/products/health/critical-illness/pruhealth-critical-illness-extended-care-iii/" target="_blank" rel="noreferrer">年龄口径参考</a></p>
      {draft.birthday.endsWith('-02-29') && <p className="medical-note">闰日生日在非闰年按 3 月 1 日切换年龄测算，正式投保请核对保险公司口径。</p>}
      <p className="medical-note">地区类别沿用原表 A/B 定义，请按承保口径确认；CIE3 不使用此项。VIP、MCVIP 标准费率不按性别、吸烟或 A/B 类别分档，个别核保加费另计。</p>
    </section>
    {draft.cards.map((card, index) => <section className="medical-panel" key={card.id} aria-label={`保险 ${index + 1}`}>
      <div className="medical-card-heading"><h2>保险 {index + 1}</h2><button type="button" aria-label={`移除保险 ${index + 1}`} onClick={() => remove(card)}><TrashIcon size={18} />移除</button></div>
      <div className={`medical-fields${card.product === 'VIP' || card.product === 'MCVIP' ? ' medical-hospital-fields' : ''}`}>
        <label>保险产品<select value={card.product} onChange={e => { const product = e.target.value as MedicalProduct; updateCard(card.id, product === 'VIP' || product === 'MCVIP' ? { product, plan: product === 'VIP' ? 'asia' : '2', excess: 0, outpatient: false } : { product, term: (MEDICAL_PRODUCTS[product].terms as readonly number[]).includes(card.term) ? card.term : MEDICAL_PRODUCTS[product].terms[0] }) }}>
          {Object.entries({ ...MEDICAL_PRODUCTS, ...HOSPITAL_PRODUCTS }).map(([code, p]) => <option key={code} value={code}>{code} · {p.name}</option>)}
        </select></label>
        {card.product === 'VIP' || card.product === 'MCVIP' ? <>
          <label>保障计划<select value={card.plan} onChange={e => updateCard(card.id, { plan: e.target.value, excess: card.product === 'MCVIP' && e.target.value === '1' ? 1 : card.excess })}>
            {card.product === 'VIP' ? <><option value="asia">亚洲</option><option value="world">全球（美国除外）</option></> : <><option value="1">计划 1 · 大中华（港澳台限指定疾病）</option><option value="2">计划 2 · 大中华</option><option value="3">计划 3 · 全球（美国除外）</option><option value="4">计划 4 · 全球</option></>}
          </select></label>
          <label>年度自付额（{insuredCurrency(card.currency)}）<select value={card.excess} onChange={e => updateCard(card.id, { excess: Number(e.target.value) })}>
            {card.product === 'VIP' ? (card.currency === 'HKD' ? [0, 20000, 50000, 96000] : [0, 2500, 6250, 12000]).map((v, i) => <option value={i} key={i}>{money(v)}</option>) : <><option value={0} disabled={card.plan === '1'}>0</option><option value={1}>{card.currency === 'HKD' ? '内地 10,000 / 其他地区 30,000' : '内地 1,250 / 其他地区 3,750'}</option></>}
          </select></label>
          <label>测算年数<input inputMode="numeric" value={card.years} onChange={e => updateCard(card.id, { years: e.target.value })} /></label>
          {card.product === 'MCVIP' && <label>门诊宝<select value={String(card.outpatient)} onChange={e => updateCard(card.id, { outpatient: e.target.value === 'true' })}><option value="false">不附加</option><option value="true">附加门诊宝</option></select></label>}
        </> : <><label>投保额（{insuredCurrency(card.currency)}）<input inputMode="decimal" placeholder="填写保额" value={card.amount} aria-invalid={!!card.amount && (!Number.isFinite(numeric(card.amount)) || numeric(card.amount) <= 0)} onChange={e => updateCard(card.id, { amount: e.target.value })} /></label>
        <label>供款期<select value={card.term} onChange={e => updateCard(card.id, { term: Number(e.target.value) })}>{MEDICAL_PRODUCTS[card.product].terms.map(term => <option key={term} value={term}>{term} 年</option>)}</select></label></>}
        <label>保单 / 显示币种<select value={card.currency} onChange={e => updateCard(card.id, { currency: e.target.value as Card['currency'] })}><option value="USD">美元保单 · 美元显示</option><option value="HKD">港币保单 · 港币显示</option><option value="HKD-U">美元保单 · 港币显示</option><option value="RMB-U">美元保单 · 人民币显示</option></select></label>
      </div>
      {card.product === 'VIP' || card.product === 'MCVIP' ? <HospitalResult outcome={outcomes[index]} card={card} /> : <PolicyResult outcome={outcomes[index]} currency={displayCurrency(card.currency)} />}
    </section>)}
    <button type="button" className="medical-add" disabled={draft.cards.length >= 30} onClick={() => setDraft(d => ({ ...d, cards: [...d.cards, newCard()] }))}><PlusIcon size={20} />新增保险{draft.cards.length >= 30 ? '（已达 30 份）' : ''}</button>
    <section className="medical-panel medical-combined" aria-labelledby="medical-summary-title">
      <h2 id="medical-summary-title">组合保费合计 <small>人民币</small></h2>
      {summary ? <><div className="medical-totals"><div><span>首年保费合计</span><strong>¥{money(summary.annual)}</strong></div><div><span>所选期间累计保费</span><strong>¥{money(summary.total)}</strong></div></div><p className="medical-note">危疾险按供款期、医疗险按各自测算年数汇总；医疗险测算期结束不代表保障或缴费责任终止。</p>
        <details><summary>查看逐年组合保费</summary><div className="medical-table-scroll" tabIndex={0} role="region" aria-label="逐年组合保费表"><table><thead><tr><th>保单年度</th><th>年度保费（元）</th><th>累计保费（元）</th></tr></thead><tbody>{summary.years.map(r => <tr key={r.year}><th>{r.year}</th><td>{money(r.premium)}</td><td>{money(r.cumulative)}</td></tr>)}</tbody></table></div></details></>
        : <p className="medical-pending" role="status">{draft.cards.length ? '完善全部保险信息后显示合计，不计入不完整测算。' : '新增保险后开始测算。'}</p>}
      <details><summary>折算汇率与计算口径</summary><div className="medical-fields medical-fx"><label>1 美元兑港币<input inputMode="decimal" value={draft.hkd} onChange={e => setDraft({ ...draft, hkd: e.target.value })} /></label><label>1 美元兑人民币<input inputMode="decimal" value={draft.rmb} onChange={e => setDraft({ ...draft, rmb: e.target.value })} /></label></div><p className="medical-note">默认汇率取自原表 Notes，为测算假设，并非实时汇率。各保险从同一年度起投保；医疗险仅累计所选测算期间，危疾险累计供款期。异币保费折算成人民币后汇总。</p></details>
    </section>
    <footer className="medical-note">危疾险数据来源：e-1-toolbox-2026-08-03.xlsx 的 CIM3 BCIM3、CIE3、CIP2 页及对应费率表；医疗险来源见产品下方原始保费表。保费按年缴标准计算，不计折扣、税务扣减、额外核保加费及征费，以保险公司正式建议书为准。现金价值及非保证利益按原表推算，非保证项目不代表承诺回报。草稿仅保留在当前浏览器会话，不上传客户档案。</footer>
  </section>
}

function HospitalResult({ outcome, card }: { outcome: Outcome; card: Card }) {
  const product = card.product === 'VIP' ? 'VIP' : 'MCVIP'
  const source = HOSPITAL_SOURCES[product]
  const result = outcome.result?.kind === 'hospital' ? outcome.result : null
  const currency = displayCurrency(card.currency)
  return <>
    {result ? <><div className="medical-totals"><div><span>首年标准保费 · {currency}</span><strong>{money(result.annual)}</strong></div><div><span>所选 {result.term} 年累计保费 · {currency}</span><strong>{money(result.total)}</strong></div></div>
      <details><summary>查看逐年保费及计算明细</summary><div className="medical-table-scroll" tabIndex={0} role="region" aria-label="医疗险逐年保费表"><table><caption>按现行参考费率逐年龄测算，非未来续保报价；单位：{currency}</caption><thead><tr>{['年度', '缴费时翌年岁', '基本计划保费', '门诊宝保费', '年保费', '累计保费'].map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{result.detail().map(r => <tr key={r.year}><th>{r.year}</th><td>{r.age}</td><td>{money(r.basePremium)}</td><td>{money(r.outpatientPremium)}</td><td>{money(r.premium)}</td><td>{money(r.cumulative)}</td></tr>)}</tbody></table></div></details></> : <p className="medical-pending" role="status">{outcome.error}</p>}
    <p className="medical-note"><a href={source.url} target="_blank" rel="noreferrer">{product} 原始保费表</a> · {source.version} 生效版。按年龄、计划及自付额查表；不额外叠加年增长率。续保费率可能调整。</p>
    {product === 'MCVIP' && <p className="medical-note">MCVIP 美元费率按原表港币金额 ÷ 8 换算，门诊宝保费另加一次。合计后再折算显示币种并保留两位小数，分项显示可能存在 0.01 的舍入差异。</p>}
  </>
}

function PolicyResult({ outcome, currency }: { outcome: Outcome; currency: string }) {
  const [expanded, setExpanded] = useState(false)
  const [limit, setLimit] = useState(10)
  const detail = useMemo(() => {
    if (!expanded || !outcome.result || outcome.result.kind !== 'critical') return { rows: [] as MedicalYear[], error: '' }
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

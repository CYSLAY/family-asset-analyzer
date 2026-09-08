import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDownIcon, ArrowsOutIcon, ArrowCounterClockwiseIcon, XIcon } from '@phosphor-icons/react'
import { calculateInsurance, CURRENCIES, defaultInsuranceInputs, INSURANCE_NAMES, WORKBOOK_FX,
  type InsuranceInputs, type InsuranceProduct } from '../lib/insuranceCalculator'
import './SavingsInsuranceCalculator.css'
import { InsurancePlanLibrary } from './InsurancePlanLibrary'
import { CashFlowFillDialog } from './CashFlowFillDialog'

type Drafts = Record<InsuranceProduct, InsuranceInputs>
const money = (n: number) => n.toLocaleString('zh-CN', { maximumFractionDigits: 2 })
const percent = (n: number) => `${(n * 100).toFixed(2)}%`
const makeDefaults = (): Drafts => Object.fromEntries((['TRST', 'PRMESP'] as const).map(p => [p,
  { ...defaultInsuranceInputs(p), hkdRate: WORKBOOK_FX.hkd, rmbRate: WORKBOOK_FX.rmb }])) as Drafts

export function SavingsInsuranceCalculator({ advisor }: { advisor: string }) {
  const storageKey = `jojo-insurance-calculator-v1:${advisor}`
  const [drafts, setDrafts] = useState<Drafts>(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) ?? 'null')
      const defaults = makeDefaults()
      return saved ? { TRST: { ...defaults.TRST, ...saved.TRST }, PRMESP: { ...defaults.PRMESP, ...saved.PRMESP } } : defaults
    } catch { return makeDefaults() }
  })
  const [product, setProduct] = useState<InsuranceProduct>('TRST')
  const [loadedRevision, setLoadedRevision] = useState(0)
  const [years, setYears] = useState(10)
  const [expanded, setExpanded] = useState(false)
  const [guarantees, setGuarantees] = useState(true)
  const [hideEmpty, setHideEmpty] = useState(false)
  const [returnMode, setReturnMode] = useState('IRR')
  const [active, setActive] = useState<{ year: number; field: 'extras' | 'rates' } | null>(null)
  const [undo, setUndo] = useState<{ field: 'extras' | 'rates'; values: Record<number, number | undefined>; applied: number } | null>(null)
  const [previousInputs, setPreviousInputs] = useState<InsuranceInputs | null>(null)
  const [notice, setNotice] = useState('')
  const [fillRequest, setFillRequest] = useState<{ field: 'extras' | 'rates'; year: number; inputs: InsuranceInputs } | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const workspace = useRef<HTMLElement>(null)
  const p = drafts[product]
  const outcome = useMemo(() => {
    try { return { result: calculateInsurance(product, p), error: '' } }
    catch (error) { return { result: null, error: error instanceof Error ? error.message : '请检查测算参数。' } }
  }, [product, p])
  const result = outcome.result
  const financing = product === 'PRMESP' && p.financingRate > 0
  const prepaidEligible = product === 'TRST' && p.term === 5 && ['USD', 'HKD-U', 'RMB-U'].includes(p.currency)

  useEffect(() => {
    try { sessionStorage.setItem(storageKey, JSON.stringify(drafts)) }
    catch { setNotice('浏览器未允许暂存，离开页面后参数可能无法保留。') }
  }, [drafts, storageKey])
  useEffect(() => {
    if (!expanded) return
    dialog.current?.showModal()
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [expanded])

  function update(patch: Partial<InsuranceInputs>) {
    setPreviousInputs(p)
    setDrafts(current => ({ ...current, [product]: { ...current[product], ...patch } }))
  }
  function switchProduct(next: InsuranceProduct) {
    setProduct(next); setActive(null); setUndo(null); setPreviousInputs(null); setNotice('')
  }
  function fillBelow() {
    if (workspace.current?.querySelector('[aria-invalid="true"]')) { setNotice('请先修正无效数字，再进行填充。'); return }
    if (active && result) setFillRequest({ ...active, inputs: p })
  }
  function updateOverride(field: 'extras' | 'rates', year: number, value: number) {
    if (undo?.field === field && Object.hasOwn(undo.values, year)) {
      const values = { ...undo.values }; delete values[year]
      setUndo(Object.keys(values).length ? { ...undo, values } : null)
    }
    update({ [field]: { ...p[field], [year]: value } })
  }
  function confirmFill(end: number) {
    if (!active || !result) return
    if (!fillRequest || fillRequest.inputs !== p) return
    const value = p[active.field][active.year] ?? 0
    if (end <= active.year) return
    setUndo({ field: active.field, values: Object.fromEntries(Array.from({ length: end - active.year }, (_, i) => [active.year + i + 1, p[active.field][active.year + i + 1]])), applied: value })
    const next = { ...p[active.field] }
    for (let y = active.year + 1; y <= end; y++) next[y] = value
    update({ [active.field]: next })
    setNotice(`已向下填充 ${end - active.year} 个年度。`)
    setFillRequest(null)
  }
  function numberField(key: keyof InsuranceInputs, label: string, suffix = '', hint?: string) {
    return <label className="sic-field"><span>{label}</span><span className="sic-control"><NumericInput ariaLabel={label} value={p[key] as number} onCommit={v => update({ [key]: v })} /><em>{suffix}</em></span>{hint && <small>{hint}</small>}</label>
  }
  function toggle(key: keyof InsuranceInputs, label: string, disabled = false) {
    return <label className="sic-check"><input type="checkbox" checked={Boolean(p[key])} disabled={disabled} onChange={e => update({ [key]: e.target.checked })} /><span>{label}</span></label>
  }
  const visibleRows = result?.rows.filter(r => r.year <= years) ?? []
  const showWithdrawals = !hideEmpty || result?.rows.some(r => r.withdrawal || r.extra)
  const errorPanel = outcome.error ? <div className="sic-error" role="alert">{outcome.error.includes('!') ? '当前组合无法完成计算，请撤销本次修改后重新输入。' : outcome.error}{previousInputs && <button type="button" className="sic-reset" onClick={() => { setDrafts(current => ({ ...current, [product]: previousInputs })); setPreviousInputs(null) }}>撤销本次修改</button>}</div> : null
  const table = <>
    {errorPanel}
    <div className="sic-table-controls">
      <div className="sic-periods" aria-label="显示年期">
        {[5, 10].map(y => <button type="button" key={y} aria-pressed={years === y} onClick={() => setYears(y)}>{y} 年</button>)}
        <select aria-label="更长年期" value={years > 10 ? years : ''} onChange={e => { if (e.target.value) setYears(Number(e.target.value)) }}>
          <option value="" disabled>长期周期</option>{[20, 30, 40, 55, 98].map(y => <option key={y} value={y}>{y === 98 ? '全部年期' : `${y} 年`}</option>)}
        </select>
      </div>
      <div className="sic-table-switches">
        <label><input type="checkbox" checked={guarantees} onChange={e => setGuarantees(e.target.checked)} />保证／非保证</label>
        <button type="button" aria-pressed={hideEmpty} title="隐藏全为空的提款列，再次点击展开；金额仍会保留。" onClick={() => setHideEmpty(v => !v)}>{hideEmpty ? '展开空白列' : '隐藏空白列'}</button>
        <select aria-label="回报率显示方式" value={returnMode} onChange={e => setReturnMode(e.target.value)}><option value="IRR">IRR</option><option value="YoY">逐年回报率</option></select>
      </div>
    </div>
    <div className="sic-edit-toolbar">
      <span>{active ? `第 ${active.year} 年 · ${active.field === 'extras' ? '额外提款' : '指定融资利率'}` : financing ? '离开输入格后自动重算；指定利率为 0 时沿用基础融资利率。' : '点击浅色金额格可编辑额外提款，离开输入格后自动重算。'}</span>
      <div><button type="button" disabled={!active || !result || active.year >= result.rows.at(-1)!.year} onClick={fillBelow}><ArrowDownIcon />向下填充</button>
        <button type="button" disabled={!undo} onClick={() => { if (undo) {
          const values = { ...p[undo.field] }
          for (const [year, oldValue] of Object.entries(undo.values)) {
            if (values[Number(year)] !== undo.applied) continue
            if (oldValue === undefined) delete values[Number(year)]
            else values[Number(year)] = oldValue
          }
          update({ [undo.field]: values }); setUndo(null); setNotice('已撤销填充，保留之后单独修改的参数和金额。')
        } }}><ArrowCounterClockwiseIcon />撤销</button></div>
    </div>
    <div className="sic-table-scroll" tabIndex={0} aria-label="逐年测算明细，可横向滚动">
      <table className="sic-table">
        <caption>金额单位：{result?.currency ?? '所选币种'}元 · 第 0 年为投保时点，末年为退保时点</caption>
        <thead><tr><th scope="col">年期</th><th scope="col">翌年岁</th><th scope="col">{financing ? '自付供款及利息' : '供款金额'}</th>
          {showWithdrawals && <><th scope="col">额外提款 · 可编辑</th><th scope="col">当年提取</th><th scope="col">累计提取</th></>}
          <th scope="col" className="sic-balance">保单余额</th><th scope="col">{returnMode === 'IRR' ? 'IRR' : '逐年回报率'}</th>
          {guarantees && <><th scope="col">保证余额</th><th scope="col">非保证余额</th></>}
          {financing && <><th scope="col">指定利率 · 可编辑</th><th scope="col">当年利息</th><th scope="col">累计利息</th></>}
        </tr></thead>
        <tbody>{visibleRows.map(r => <tr key={r.year}>
          <th scope="row">{r.year === 0 ? '0 · 投保' : r.year}</th><td>{r.age}</td><td>{money(r.contribution)}</td>
          {showWithdrawals && <><td className="sic-edit-cell">{product === 'PRMESP' && r.year === 0 ? '—' : <NumericInput ariaLabel={`第 ${r.year} 年额外提款`} value={p.extras[r.year] ?? 0} onFocus={() => setActive({ year: r.year, field: 'extras' })} onCommit={v => updateOverride('extras', r.year, v)} />}</td><td>{money(r.withdrawal)}</td><td>{money(r.cumulative)}</td></>}
          <td className="sic-balance">{money(r.balance)}</td><td>{(returnMode === 'IRR' ? r.irr : r.yoy) === 0 ? '—' : percent(returnMode === 'IRR' ? r.irr : r.yoy)}</td>
          {guarantees && <><td>{money(r.guaranteed)}</td><td>{money(r.nonGuaranteed)}</td></>}
          {financing && <><td className="sic-edit-cell">{r.year === 0 ? '—' : <NumericInput ariaLabel={`第 ${r.year} 年指定融资利率`} value={p.rates[r.year] ?? 0} onFocus={() => setActive({ year: r.year, field: 'rates' })} onCommit={v => updateOverride('rates', r.year, v)} />}</td><td>{money(r.interest)}</td><td>{money(r.cumulativeInterest)}</td></>}
        </tr>)}</tbody>
      </table>
    </div>
    <p className="sic-table-foot">显示第 0–{visibleRows.at(-1)?.year ?? 0} 年，共 {visibleRows.length} 行。IRR 依原表口径显示；“—”表示原表尚未显示回报率，并非保证收益为零。</p>
  </>

  return <section key={loadedRevision} ref={workspace} className="sic-workspace" aria-labelledby="sic-title">
    <header className="sic-heading"><div><h1 id="sic-title">储蓄险计算</h1><p>设置缴费与提款方案，查看逐年现金价值及回报。</p></div><button className="sic-reset" type="button" onClick={() => { if (window.confirm('恢复当前产品的参考参数？只清除本次测算设置，不影响客户资料。')) { update(makeDefaults()[product]); setActive(null); setUndo(null); setNotice('已恢复参考参数。') } }}>恢复参考参数</button></header>
    <InsurancePlanLibrary key={advisor} advisor={advisor} product={product} inputs={p} valid={Boolean(result)} hasInvalidDraft={() => Boolean(workspace.current?.querySelector('[aria-invalid="true"]'))} onLoad={saved => {
      setDrafts(current => ({ ...current, [saved.product]: structuredClone(saved.inputs) }))
      switchProduct(saved.product)
      setLoadedRevision(revision => revision + 1)
    }} />
    <div className="sic-product-tabs" role="group" aria-label="选择储蓄险产品">{(['TRST', 'PRMESP'] as const).map(id => <button type="button" key={id} aria-pressed={product === id} onClick={() => switchProduct(id)}><strong>{INSURANCE_NAMES[id]}</strong><span>{id === 'TRST' ? '3 年 / 5 年缴费，可选预缴' : '1 年缴费，可设融资'}</span></button>)}</div>
    <section className="sic-panel" aria-labelledby="sic-base-title"><h2 id="sic-base-title">投保与缴费</h2><div className="sic-fields">
      {numberField('age', '投保翌年岁', '岁', '沿用原表 ANB 年龄口径')}
      {numberField('surrenderAge', '退保翌年岁', '岁')}
      <label className="sic-field sic-currency-field"><span>保单币种 / 显示币种</span><select value={p.currency} onChange={e => update({ currency: e.target.value, prepaid: p.prepaid && p.term === 5 && ['USD', 'HKD-U', 'RMB-U'].includes(e.target.value) })}>{Object.entries(CURRENCIES).filter(([c]) => product === 'TRST' || ['USD', 'HKD-U', 'RMB-U'].includes(c)).map(([c, label]) => <option key={c} value={c}>{label}</option>)}</select></label>
      <label className="sic-field"><span>缴费年限</span><select value={p.term} onChange={e => update({ term: Number(e.target.value), prepaid: p.prepaid && Number(e.target.value) === 5, ...(Number(e.target.value) === 3 ? { promotion: false, maturity: false, eb: false, egs: false, bigCase: false } : {}) })}>{(product === 'TRST' ? [3, 5] : [1]).map(t => <option key={t} value={t}>{t === 1 ? '1 年 · 一次缴清' : `${t} 年 · 分年缴费`}</option>)}</select></label>
      {numberField('amount', product === 'TRST' ? '每年储蓄金额' : '储蓄金额', '元', '按所选显示币种输入；实际供款由原表计算')}
      {numberField('fulfillment', '总现金价值实现率', '%', '按原表调整，最低不低于保证现金价值')}
    </div>{product === 'TRST' && <div className="sic-prepaid">{toggle('prepaid', '一笔过预缴 5 年保费', !prepaidEligible)}<small>保留 5 年产品口径，首年一次预缴；不是独立的 1 年期产品。</small></div>}</section>

    <div className="sic-advanced-grid">
      <details className="sic-panel"><summary>重复储蓄计划<span>{p.repeats ? `${p.repeats} 次` : '未启用'}</span></summary><div className="sic-fields sic-two">
        <label className="sic-field"><span>重复次数</span><select value={p.repeats} onChange={e => update({ repeats: Number(e.target.value) })}>{[0, 1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n === 0 ? '不重复' : `额外 ${n} 次`}</option>)}</select><small>每个缴费周期结束后，再开启下一份计划</small></label>
        {numberField('growth', '重复储蓄增长率', '%')}
      </div></details>
      <details className="sic-panel"><summary>提款安排<span>{p.withdrawal ? '已设置' : '按需设置'}</span></summary><div className="sic-fields sic-two">
        {numberField('withdrawalAge', '提款开始翌年岁', '岁')}{numberField('withdrawal', '首年提款', '元')}
        {numberField('inflation', '提款递增率（通胀率）', '%')}{numberField('withdrawalYears', '提取年期', '年', '0 表示持续提取至退保年度')}
      </div><p className="sic-hint">{result?.maxWithdrawal != null ? `原表最高首年提款测算：${money(result.maxWithdrawal)} 元。` : '当前参数不适用最高提款测算。'}逐年额外提款可在下方表格设置。</p></details>
      <details className="sic-panel"><summary>优惠设置<span>依参考表测算</span></summary><div className="sic-offers">
        {toggle('promotion', '推广优惠', product === 'TRST' && p.term !== 5)}
        {product === 'TRST' ? <>{toggle('maturity', '期满优惠', p.term !== 5)}{toggle('eb', 'EB 优惠', p.term !== 5)}{toggle('egs', '特选 EGS 客户', p.term !== 5)}{toggle('bigCase', '大额保单优惠码', p.term !== 5)}</> : toggle('amd', 'AMD 特别优惠')}
      </div><p className="sic-hint">优惠按 2026-08-03 表格规则计算，资格及有效期须另行核实。</p></details>
      {product === 'PRMESP' && <details className="sic-panel"><summary>保费融资<span>{financing ? '已启用' : '未启用'}</span></summary><div className="sic-fields sic-two">
        {numberField('financingRatio', '保费融资比率', '%')}{numberField('financingRate', '保费融资年利率', '%', '0 表示不启用融资')}
      </div><p className="sic-hint">沿用原表：贷款金额 = 折算保费 × 85% × 融资比率。可在表格指定各年利率；提款或退保时按原表偿还本金。</p></details>}
      <details className="sic-panel"><summary>汇率假设<span>可调整</span></summary><div className="sic-fields sic-two">{numberField('hkdRate', '1 美元折合港币', '元')}{numberField('rmbRate', '1 美元折合人民币', '元')}</div><p className="sic-hint">初始值来自参考表，不是实时汇率。仅用于美元保单的显示币种换算。</p></details>
    </div>

    {outcome.error ? (!expanded && errorPanel) : result && <>
      {result.lowNotional && result.lowNotional !== '0' ? <p className="sic-error" role="status">当前名义金额低于参考表的最低要求，请提高储蓄金额。</p> : null}
      <section className="sic-results" aria-label="测算摘要">
        <div><span>{financing ? '累计自付供款及利息' : '总供款'}</span><strong>{money(result.totalContribution)}</strong><small>{result.currency}元</small></div>
        <div><span>总提取（含退保余额）</span><strong>{money(result.totalWithdrawal)}</strong><small>{result.currency}元{financing ? ' · 已计偿还融资本金' : ''}</small></div>
        <div className="sic-result-accent"><span>内部回报率 IRR</span><strong>{percent(result.irr)}</strong><small>按实际供款及提取现金流计算</small></div>
        <div><span>优惠金额</span><strong>{money(result.rebate)}</strong><small>{result.currency}元 · 参考表口径</small></div>
      </section>
      <div className="sic-result-meta"><span>名义金额：{money(result.notional)}（保单币种）</span>{financing && <span>融资贷款：{money(result.loan)} {result.currency}元</span>}<span>本金及非保证收益均包含在余额中</span></div>
      <section className="sic-panel sic-table-panel"><header><h2>逐年测算明细</h2><button type="button" onClick={() => setExpanded(true)}><ArrowsOutIcon />放大表格</button></header>{!expanded && table}</section>
    </>}
    <p className="sic-notice" role="status">{notice}</p>
    <footer className="sic-sources"><p>数据来源：e-1-toolbox-2026-08-03.xlsx，TRST / PRMESP 工作表。非保证现金价值与优惠均为演示假设，实际以正式利益说明及保单条款为准；提前退保可能产生损失。</p><p>草稿与命名方案保存在本机。只有确认应用到客户后，方案才进入客户现金流；使用同一参考表计算，并单独说明币种折算。</p></footer>
    {expanded && <dialog className="sic-dialog" ref={dialog} onCancel={() => setExpanded(false)} onClose={() => setExpanded(false)} aria-labelledby="sic-dialog-title"><header><div><h2 id="sic-dialog-title">{INSURANCE_NAMES[product]} · 逐年明细</h2><span>修改与页面同步 · 按 Esc 关闭</span></div><button type="button" autoFocus aria-label="关闭放大表格" onClick={() => setExpanded(false)}><XIcon /></button></header>{table}</dialog>}
    {fillRequest && result && <CashFlowFillDialog label={fillRequest.field === 'extras' ? '额外提款' : '指定融资利率'} sourceYear={fillRequest.year} lastYear={result.rows.at(-1)!.year} visibleLastYear={Math.min(years, result.rows.at(-1)!.year)} value={fillRequest.inputs[fillRequest.field][fillRequest.year] ?? 0} unit={fillRequest.field === 'rates' ? '%' : result.currency + '元'} values={result.rows.map(row => ({ year: row.year, value: fillRequest.inputs[fillRequest.field][row.year] ?? 0 }))} stale={fillRequest.inputs !== p} onClose={() => setFillRequest(null)} onConfirm={confirmFill} />}
  </section>
}

function NumericInput({ value, onCommit, ariaLabel, onFocus }: { value: number; onCommit: (value: number) => void; ariaLabel: string; onFocus?: () => void }) {
  const [text, setText] = useState(String(value))
  const [invalid, setInvalid] = useState(false)
  useEffect(() => { setText(String(value)); setInvalid(false) }, [value])
  return <><input type="text" inputMode="decimal" aria-label={ariaLabel} aria-invalid={invalid} value={text} onFocus={onFocus} onChange={e => setText(e.target.value)}
    onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) e.currentTarget.blur() }} onBlur={() => {
      const next = Number(text.replaceAll(',', '').trim())
      if (!text.trim() || !Number.isFinite(next)) { setInvalid(true); return }
      setInvalid(false); onCommit(next)
    }} />{invalid && <small role="alert">请输入有效数字；结果暂按修改前数值计算。</small>}</>
}

import { useEffect, useRef, useState } from 'react'

interface Props {
  label: string
  sourceYear: number
  lastYear: number
  visibleLastYear: number
  initialTarget?: number
  value: number
  unit?: string
  values: { year: number; value: number }[]
  stale: boolean
  onClose: () => void
  onConfirm: (targetYear: number) => void
}

export function CashFlowFillDialog({ label, sourceYear, lastYear, visibleLastYear, initialTarget, value, unit = '元', values, stale, onClose, onConfirm }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const [scope, setScope] = useState(initialTarget ? 'custom' : 'visible')
  const [customYear, setCustomYear] = useState(initialTarget ?? sourceYear + 1)
  const target = scope === 'all' ? lastYear : scope === 'visible' ? visibleLastYear : customYear
  const count = Math.max(0, target - sourceYear)
  const replaced = values.filter(row => row.year > sourceYear && row.year <= target && row.value !== 0 && row.value !== value).length
  useEffect(() => {
    ref.current?.showModal()
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [])
  return <dialog ref={ref} className="cashflow-fill-dialog" aria-labelledby="cashflow-fill-title" aria-describedby="cashflow-fill-description" onCancel={event => { event.preventDefault(); onClose() }}>
    <h2 id="cashflow-fill-title">向下填充</h2>
    <p id="cashflow-fill-description">将「{label}」{sourceYear} 年的 {value.toLocaleString('zh-CN')} {unit}复制到下方，仅修改本列。</p>
    <label>填充范围<select autoFocus value={scope} onChange={event => setScope(event.target.value)} aria-label="填充范围"><option value="visible">当前显示年份</option><option value="all">全部未来年份</option><option value="custom">选择结束年份</option></select></label>
    {scope === 'custom' && <label>结束年份<select value={customYear} onChange={event => setCustomYear(Number(event.target.value))} aria-label="结束年份">{Array.from({ length: Math.max(0, lastYear - sourceYear) }, (_, index) => sourceYear + index + 1).map(year => <option key={year} value={year}>{year} 年</option>)}</select></label>}
    <p className="cashflow-fill-preview" role="status">{count ? `${sourceYear + 1}–${target} 年，共 ${count} 格；替换 ${replaced} 个不同的非零金额。` : '当前范围没有下方年份，请选择其他范围。'}<br />填充后可撤销最近一次操作。</p>
    {stale && <p role="alert">数据已变化，请取消后重新选择，避免覆盖新修改。</p>}
    <div className="cashflow-fill-actions"><button type="button" className="subtle-button" onClick={onClose}>取消</button><button type="button" className="primary-action compact" disabled={!count || stale || !Number.isFinite(value) || value < 0} onClick={() => onConfirm(target)}>确认填充</button></div>
  </dialog>
}

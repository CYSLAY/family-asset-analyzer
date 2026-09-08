/** Bounded interpreter for the supplied workbook. No eval, macros, links or network.
 * References remain lazy so large VLOOKUP ranges do not calculate unused cells.
 * Unsupported syntax fails visibly instead of falling back to cached results.
 */
export type CellValue = string | number | boolean
type Node = { kind: 'literal'; value: CellValue } | { kind: 'ref'; sheet?: string; a: string; b?: string }
  | { kind: 'call'; name: string; args: Node[] } | { kind: 'op'; op: string; args: Node[] }
type Reference = { sheet: string; c: number; r: number; width: number; height: number }
type Value = CellValue | Reference | Value[]
export type SheetCells = Record<string, CellValue>
const parsed = new Map<string, Node>()

export function columnIndex(name: string): number {
  return [...name.toUpperCase()].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0)
}
function columnName(n: number): string {
  let result = ''
  while (n > 0) { n--; result = String.fromCharCode(65 + n % 26) + result; n = Math.floor(n / 26) }
  return result
}
function coordinate(a: string) {
  const match = /^([A-Z]+)(\d+)$/.exec(a.replaceAll('$', '').toUpperCase())
  if (!match) throw Error(`不支持的单元格：${a}`)
  return { c: columnIndex(match[1]), r: Number(match[2]) }
}
function parse(formula: string): Node {
  const existing = parsed.get(formula)
  if (existing) return existing
  const tokens = formula.slice(1).match(/"(?:[^"]|"")*"|'[^']+'|\d*\.\d+(?:[Ee][+-]?\d+)?|\d+(?:[Ee][+-]?\d+)?|\$?[A-Za-z_][A-Za-z_0-9.$]*|<>|<=|>=|[()+\-*/^%,:!&=<>]/g) ?? []
  let position = 0
  const take = () => tokens[position++]
  const accept = (s: string) => tokens[position] === s ? (position++, true) : false
  const required = (s: string) => { if (!accept(s)) throw Error(`公式缺少 ${s}：${formula}`) }
  function expression(min = 0): Node {
    const t = take()
    let node: Node
    if (t === '-' || t === '+') node = { kind: 'op', op: `u${t}`, args: [expression(5)] }
    else if (t === '(') {
      const args = [expression()]
      while (accept(',')) args.push(expression())
      required(')')
      node = args.length === 1 ? args[0] : { kind: 'call', name: 'UNION', args }
    } else if (t?.startsWith('"')) node = { kind: 'literal', value: t.slice(1, -1).replaceAll('""', '"') }
    else if (/^(\d|\.)/.test(t ?? '')) node = { kind: 'literal', value: Number(t) }
    else if (accept('(')) {
      const args: Node[] = []
      if (!accept(')')) { do { args.push(expression()) } while (accept(',')); required(')') }
      node = { kind: 'call', name: t.toUpperCase(), args }
    } else if (/^(TRUE|FALSE)$/i.test(t)) node = { kind: 'literal', value: t.toUpperCase() === 'TRUE' }
    else {
      let sheet: string | undefined
      let a = t
      if (accept('!')) { sheet = a.replace(/^'|'$/g, ''); a = take() }
      const b = accept(':') ? take() : undefined
      coordinate(a)
      if (b) coordinate(b)
      node = { kind: 'ref', sheet, a, b }
    }
    while (true) {
      if (accept('%')) { node = { kind: 'op', op: '%', args: [node] }; continue }
      const op = tokens[position]
      const precedence: Record<string, number> = { '=': 1, '<>': 1, '<': 1, '>': 1, '<=': 1, '>=': 1, '&': 2, '+': 3, '-': 3, '*': 4, '/': 4, '^': 5 }
      const p = precedence[op]
      if (p === undefined || p < min) break
      take()
      node = { kind: 'op', op, args: [node, expression(p + 1)] }
    }
    return node
  }
  const result = expression()
  if (position !== tokens.length) throw Error(`不支持的公式：${formula}`)
  parsed.set(formula, result)
  return result
}

/** Excel-compatible periodic IRR, with a deterministic fallback for Newton failure. */
export function periodicIrr(values: number[], guess = .05): number {
  if (!values.some(v => v < 0) || !values.some(v => v > 0)) throw Error('现金流不足以计算 IRR')
  const npv = (r: number) => values.reduce((s, v, i) => s + v / (1 + r) ** i, 0)
  let rate = guess
  for (let step = 0; step < 100; step++) {
    const n = npv(rate)
    const derivative = values.reduce((s, v, i) => s - i * v / (1 + rate) ** (i + 1), 0)
    const next = rate - n / derivative
    if (!Number.isFinite(next) || next <= -.999999 || next > 1e6) break
    if (Math.abs(next - rate) < 1e-12) return next
    rate = next
  }
  let left = -.9999, right = 1
  while (npv(left) * npv(right) > 0 && right < 1e6) right *= 2
  if (npv(left) * npv(right) > 0) throw Error('IRR 无可用解')
  for (let step = 0; step < 160; step++) {
    const mid = (left + right) / 2
    if (npv(left) * npv(mid) <= 0) right = mid; else left = mid
  }
  return (left + right) / 2
}

export class InsuranceFormulaEngine {
  private cache = new Map<string, CellValue>()
  private active = new Set<string>()
  constructor(private sheets: Record<string, SheetCells>, private overrides: Record<string, SheetCells> = {}) {}
  cell(sheet: string, address: string): CellValue {
    const a = address.replaceAll('$', '').toUpperCase()
    const key = `${sheet}!${a}`
    if (this.cache.has(key)) return this.cache.get(key)!
    if (this.active.has(key)) throw Error(`循环引用：${key}`)
    const source = this.overrides[sheet]?.[a] ?? this.sheets[sheet]?.[a] ?? 0
    this.active.add(key)
    try {
      const result = typeof source === 'string' && source.startsWith('=') ? this.scalar(this.evaluate(parse(source), sheet)) : source
      if (typeof result === 'number' && !Number.isFinite(result)) throw Error('计算结果超出范围')
      this.cache.set(key, result)
      return result
    } catch (error) { throw Error(`${key}：${error instanceof Error ? error.message : error}`) }
    finally { this.active.delete(key) }
  }
  number(sheet: string, address: string) { return this.numeric(this.cell(sheet, address)) }
  private scalar(value: Value): CellValue {
    if (Array.isArray(value)) return this.scalar(value[0] ?? 0)
    if (typeof value === 'object') return this.cell(value.sheet, `${columnName(value.c)}${value.r}`)
    return value
  }
  private numeric(value: Value): number {
    const v = this.scalar(value)
    if (v === '') return 0
    const n = Number(v)
    if (!Number.isFinite(n)) throw Error(`非数值：${v}`)
    return n
  }
  private flatten(value: Value): CellValue[] {
    if (Array.isArray(value)) return value.flatMap(v => this.flatten(v))
    if (typeof value !== 'object') return [value]
    const result: CellValue[] = []
    for (let r = 0; r < value.height; r++) for (let c = 0; c < value.width; c++) {
      result.push(this.cell(value.sheet, `${columnName(value.c + c)}${value.r + r}`))
    }
    return result
  }
  private evaluate(node: Node, sheet: string): Value {
    if (node.kind === 'literal') return node.value
    if (node.kind === 'ref') {
      const a = coordinate(node.a), b = node.b ? coordinate(node.b) : a
      return { sheet: node.sheet ?? sheet, ...a, width: b.c - a.c + 1, height: b.r - a.r + 1 }
    }
    const value = (i: number) => this.evaluate(node.args[i], sheet)
    const num = (i: number) => this.numeric(value(i))
    const str = (i: number) => String(this.scalar(value(i)))
    if (node.kind === 'op') {
      if (node.op === 'u-') return -num(0)
      if (node.op === 'u+') return num(0)
      if (node.op === '%') return num(0) / 100
      if (node.op === '&') return str(0) + str(1)
      if (['=', '<>', '<', '>', '<=', '>='].includes(node.op)) {
        const normalize = (v: Value) => { const s = this.scalar(v); return typeof s === 'string' ? s.toLowerCase() : s }
        const a = normalize(value(0)), b = normalize(value(1))
        switch (node.op) { case '=': return a === b; case '<>': return a !== b; case '<': return a < b; case '>': return a > b; case '<=': return a <= b; default: return a >= b }
      }
      const a = num(0), b = num(1)
      switch (node.op) { case '+': return a + b; case '-': return a - b; case '*': return a * b; case '/': if (!b) throw Error('除数为零'); return a / b; case '^': return a ** b; default: throw Error(`不支持 ${node.op}`) }
    }
    switch (node.name) {
      case 'IF': return this.scalar(value(0)) ? value(1) : node.args[2] ? value(2) : false
      case 'AND': return node.args.every((_, i) => Boolean(this.scalar(value(i))))
      case 'OR': return node.args.some((_, i) => Boolean(this.scalar(value(i))))
      case 'NOT': return !this.scalar(value(0))
      case 'ISERROR': try { this.scalar(value(0)); return false } catch { return true }
      case 'LOWER': return str(0).toLowerCase()
      case 'TRIM': return str(0).trim().replace(/ +/g, ' ')
      case 'FIND': { const index = str(1).indexOf(str(0)); if (index < 0) throw Error('未找到文本'); return index + 1 }
      case 'CONCATENATE': return node.args.map((_, i) => str(i)).join('')
      case 'FIXED': return num(0).toFixed(num(1))
      case 'UNION': return node.args.map((_, i) => value(i))
      case 'SUM': case 'MAX': case 'MIN': {
        const values = node.args.flatMap((_, i) => this.flatten(value(i))).filter(v => typeof v === 'number') as number[]
        return node.name === 'SUM' ? values.reduce((a, b) => a + b, 0) : node.name === 'MAX' ? values.length ? Math.max(...values) : 0 : values.length ? Math.min(...values) : 0
      }
      case 'ROUNDUP': case 'ROUNDDOWN': {
        const n = num(0), scale = 10 ** num(1)
        return Math.sign(n) * (node.name === 'ROUNDUP' ? Math.ceil(Math.abs(n) * scale) : Math.floor(Math.abs(n) * scale)) / scale
      }
      case 'COLUMN': case 'ROW': {
        const ref = value(0)
        if (typeof ref !== 'object' || Array.isArray(ref)) throw Error('需要单元格引用')
        return node.name === 'COLUMN' ? ref.c : ref.r
      }
      case 'OFFSET': {
        const ref = value(0)
        if (typeof ref !== 'object' || Array.isArray(ref)) throw Error('需要单元格引用')
        const next = { ...ref, r: ref.r + num(1), c: ref.c + num(2), height: num(3), width: num(4) }
        if (next.height < 1 || next.height > 1000 || next.width < 1 || next.width > 250) throw Error('引用范围无效')
        return next
      }
      case 'VLOOKUP': {
        const sought = this.scalar(value(0)), ref = value(1), col = num(2)
        if (typeof ref !== 'object' || Array.isArray(ref) || col < 1 || col > ref.width) throw Error('查表范围无效')
        const approximate = node.args[3] ? Boolean(this.scalar(value(3))) : true
        let found = -1
        for (let r = 0; r < ref.height; r++) {
          const key = this.cell(ref.sheet, `${columnName(ref.c)}${ref.r + r}`)
          if (String(key).toLowerCase() === String(sought).toLowerCase()) { found = r; break }
          if (approximate && typeof key === typeof sought && key <= sought) found = r
        }
        if (found < 0) throw Error(`无对应数据：${sought}`)
        return this.cell(ref.sheet, `${columnName(ref.c + col - 1)}${ref.r + found}`)
      }
      case 'IRR': return periodicIrr(this.flatten(value(0)).filter(v => typeof v === 'number') as number[], node.args[1] ? num(1) : .1)
      case 'RATE': {
        const periods = num(0), payment = num(1), present = num(2), future = node.args[3] ? num(3) : 0
        if (payment !== 0) throw Error('不支持的 RATE 年金形式')
        return (-future / present) ** (1 / periods) - 1
      }
      default: throw Error(`不支持的函数：${node.name}`)
    }
  }
}

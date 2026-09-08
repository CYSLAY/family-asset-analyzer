// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defaultInsuranceInputs } from './insuranceCalculator'
import { deleteInsurancePlan, listInsurancePlans, parseInsurancePlan, saveInsurancePlan } from './insurancePlans'

afterEach(() => { localStorage.clear(); vi.restoreAllMocks() })
describe('insurance plan library', () => {
  it('persists complete independent snapshots, even with duplicate names', () => {
    const inputs = defaultInsuranceInputs('TRST')
    inputs.extras = { 10: 500 }
    const first = saveInsurancePlan('jojo', '退休方案', 'TRST', inputs)
    inputs.extras[10] = 800
    saveInsurancePlan('jojo', '退休方案', 'TRST', inputs)
    const saved = listInsurancePlans('jojo').plans
    expect(saved).toHaveLength(2)
    expect(saved.find(plan => plan.id === first.id)?.inputs.extras[10]).toBe(500)
    sessionStorage.clear()
    expect(listInsurancePlans('jojo').plans).toHaveLength(2)
  })
  it('isolates advisors and deletes only the requested snapshot', () => {
    const first = saveInsurancePlan('alice', 'A', 'TRST', defaultInsuranceInputs('TRST'))
    saveInsurancePlan('bob', 'B', 'PRMESP', defaultInsuranceInputs('PRMESP'))
    deleteInsurancePlan('bob', first.id)
    expect(listInsurancePlans('alice').plans).toHaveLength(1)
    deleteInsurancePlan('alice', first.id)
    expect(listInsurancePlans('alice').plans).toHaveLength(0)
    expect(listInsurancePlans('bob').plans).toHaveLength(1)
  })
  it('preserves corrupt records and rejects invalid versions and numeric fields', () => {
    const key = 'jojo-insurance-plan-v1:jojo:broken'
    localStorage.setItem(key, '{broken')
    expect(listInsurancePlans('jojo').unreadable).toBe(1)
    expect(localStorage.getItem(key)).toBe('{broken')
    const plan = saveInsurancePlan('jojo', 'A', 'TRST', defaultInsuranceInputs('TRST'))
    expect(() => parseInsurancePlan(JSON.stringify({ ...plan, version: 2 }))).toThrow()
    expect(() => saveInsurancePlan('jojo', 'B', 'TRST', { ...plan.inputs, age: NaN })).toThrow()
    expect(() => saveInsurancePlan('jojo', '', 'TRST', plan.inputs)).toThrow()
    expect(() => saveInsurancePlan('jojo', 'B', 'TRST', { ...plan.inputs, extras: { 999: 20 } })).toThrow()
  })
  it('reports quota failure instead of pretending a save succeeded', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw Error('quota') })
    expect(() => saveInsurancePlan('jojo', 'A', 'TRST', defaultInsuranceInputs('TRST'))).toThrow('quota')
  })
})

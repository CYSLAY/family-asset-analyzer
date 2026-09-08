// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SavingsInsuranceCalculator } from './SavingsInsuranceCalculator'

afterEach(() => { cleanup(); sessionStorage.clear(); vi.restoreAllMocks() })
describe('advisor calculator editing', () => {
  it('fills only rows below the selected cell and can undo', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<SavingsInsuranceCalculator advisor="qa" />)
    const source = screen.getByRole('textbox', { name: '第 5 年额外提款' })
    fireEvent.focus(source)
    fireEvent.change(source, { target: { value: '10' } })
    fireEvent.blur(source)
    fireEvent.click(screen.getByRole('button', { name: '向下填充' }))
    expect((screen.getByRole('textbox', { name: '第 4 年额外提款' }) as HTMLInputElement).value).toBe('0')
    expect((screen.getByRole('textbox', { name: '第 6 年额外提款' }) as HTMLInputElement).value).toBe('10')
    const age = screen.getByRole('textbox', { name: '投保翌年岁' })
    fireEvent.change(age, { target: { value: '42' } })
    fireEvent.blur(age)
    fireEvent.click(screen.getByRole('button', { name: '撤销' }))
    expect((age as HTMLInputElement).value).toBe('42')
    expect((screen.getByRole('textbox', { name: '第 6 年额外提款' }) as HTMLInputElement).value).toBe('0')
    expect((screen.getByRole('textbox', { name: '第 5 年额外提款' }) as HTMLInputElement).value).toBe('10')
  })
  it('retains separate product drafts and clears inapplicable five-year offers', () => {
    render(<SavingsInsuranceCalculator advisor="qa" />)
    fireEvent.click(screen.getByRole('checkbox', { name: '一笔过预缴 5 年保费' }))
    fireEvent.change(screen.getByRole('combobox', { name: '缴费年限' }), { target: { value: '3' } })
    expect((screen.getByRole('checkbox', { name: '一笔过预缴 5 年保费' }) as HTMLInputElement).checked).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: /世誉财富/ }))
    expect((screen.getByRole('combobox', { name: '缴费年限' }) as HTMLSelectElement).value).toBe('1')
    fireEvent.click(screen.getByRole('button', { name: /信守明天/ }))
    expect((screen.getByRole('combobox', { name: '缴费年限' }) as HTMLSelectElement).value).toBe('3')
  })
  it('removes stale results after invalid inputs and offers recovery', () => {
    render(<SavingsInsuranceCalculator advisor="qa" />)
    const field = screen.getByRole('textbox', { name: '退保翌年岁' })
    fireEvent.change(field, { target: { value: '30' } })
    fireEvent.blur(field)
    expect(screen.queryByRole('region', { name: '测算摘要' })).toBeNull()
    expect(screen.getByRole('alert').textContent).toContain('退保')
    fireEvent.click(screen.getByRole('button', { name: '撤销本次修改' }))
    expect(screen.getByRole('region', { name: '测算摘要' })).toBeTruthy()
  })
  it('declining a bulk fill does not change data', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<SavingsInsuranceCalculator advisor="qa" />)
    fireEvent.focus(screen.getByRole('textbox', { name: '第 5 年额外提款' }))
    fireEvent.click(screen.getByRole('button', { name: '向下填充' }))
    expect(window.confirm).toHaveBeenCalledOnce()
    expect((screen.getByRole('button', { name: '撤销' }) as HTMLButtonElement).disabled).toBe(true)
  })
})

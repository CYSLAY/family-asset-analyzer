// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/localDb', () => ({
  deleteCustomerPermanently: vi.fn(),
  getCustomers: vi.fn(async () => []),
  putCustomer: vi.fn(async () => undefined),
}))

import { createCustomer } from '../types/domain'
import { useCustomerStore } from '../stores/customerStore'
import { CashFlowManager } from './CashFlowManager'
import { createCashFlowPlanFromCustomer } from '../lib/cashFlowPlan'

HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }

afterEach(() => {
  cleanup()
  useCustomerStore.setState({ customers: [], selectedCustomerId: null })
})

describe('CashFlowManager customer navigation', () => {
  it('fills selected display range and undo preserves later edits', async () => {
    const customer = createCustomer('测试')
    customer.cashFlowPlan = createCashFlowPlanFromCustomer(customer, 2026)
    customer.cashFlowPlan.incomes = [{ id: 'salary', label: '测试收入', annualAmount: 100, growthRate: 0, startYear: 2026, endYear: 2080 }]
    useCustomerStore.setState({ customers: [customer], selectedCustomerId: customer.id })
    render(<CashFlowManager onOpenCustomer={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: '将2026年测试收入的金额应用到下方年份' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('2027–2030 年，共 4 格')
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '确认填充' })) })
    expect(useCustomerStore.getState().customers[0].cashFlowPlan!.incomes[0].yearlyAmounts).toEqual({ 2027: 100, 2028: 100, 2029: 100, 2030: 100 })
    await act(async () => { fireEvent.change(screen.getByRole('spinbutton', { name: '2027年测试收入' }), { target: { value: '777' } }) })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '撤销填充' })) })
    expect(useCustomerStore.getState().customers[0].cashFlowPlan!.incomes[0].yearlyAmounts).toEqual({ 2027: 777 })
  })
  it('supports touch-friendly custom range and cancels without modifying', () => {
    const customer = createCustomer('测试')
    customer.cashFlowPlan = createCashFlowPlanFromCustomer(customer, 2026)
    customer.cashFlowPlan.incomes = [{ id: 'salary', label: '测试收入', annualAmount: 100, growthRate: 0, startYear: 2026, endYear: 2080 }]
    useCustomerStore.setState({ customers: [customer], selectedCustomerId: customer.id })
    render(<CashFlowManager onOpenCustomer={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: '将2030年测试收入的金额应用到下方年份' }))
    expect(screen.getByRole('button', { name: '确认填充' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('填充范围'), { target: { value: 'custom' } })
    fireEvent.change(screen.getByLabelText('结束年份'), { target: { value: '2033' } })
    expect(screen.getByRole('dialog')).toHaveTextContent('2031–2033 年，共 3 格')
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(useCustomerStore.getState().customers[0].cashFlowPlan).toBe(customer.cashFlowPlan)
  })
  it.each([
    [false, '返回客户档案'],
    [true, '返回我的资料'],
  ])('returns to the selected customer profile in selfService=%s', (selfService, label) => {
    const customer = createCustomer('陈女士', selfService ? 'self_service' : 'advisor')
    useCustomerStore.setState({ customers: [customer], selectedCustomerId: customer.id })
    const onOpenCustomer = vi.fn()

    render(<CashFlowManager selfService={selfService} onOpenCustomer={onOpenCustomer} />)
    fireEvent.click(screen.getByRole('button', { name: label }))

    expect(onOpenCustomer).toHaveBeenCalledOnce()
  })
})

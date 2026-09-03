// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/localDb', () => ({
  deleteCustomerPermanently: vi.fn(),
  getCustomers: vi.fn(async () => []),
  putCustomer: vi.fn(async () => undefined),
}))

import { createCustomer } from '../types/domain'
import { useCustomerStore } from '../stores/customerStore'
import { CashFlowManager } from './CashFlowManager'

afterEach(() => {
  cleanup()
  useCustomerStore.setState({ customers: [], selectedCustomerId: null })
})

describe('CashFlowManager customer navigation', () => {
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

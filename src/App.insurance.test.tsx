// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const access = vi.hoisted(() => ({ user: null as string | null }))
vi.mock('./lib/access', () => ({ getAccessUser: () => access.user, getAccessSession: () => null, clearAccessUser: vi.fn() }))
vi.mock('./lib/localDb', () => ({ getQueuedCustomers: vi.fn(async () => []), getConflicts: vi.fn(async () => []), setLocalWorkspace: vi.fn(), getLocalWorkspace: () => 'test', putCustomer: vi.fn(async () => undefined), getCustomers: vi.fn(async () => []) }))
vi.mock('./lib/publicIntake', () => ({
  getPublicIntakeSession: () => ({ id: 'qa-client' }), fetchPublicIntake: vi.fn(async () => null),
  pushPublicIntake: vi.fn(async () => undefined), clearPublicIntakeSession: vi.fn(),
}))
vi.mock('./components/AccessGate', () => ({ AccessGate: ({ onStartSelfService }: { onStartSelfService: () => void }) => <button onClick={onStartSelfService}>客户自测测试入口</button> }))
vi.mock('./components/CustomerDirectory', () => ({ CustomerDirectory: () => <div>客户列表</div> }))
vi.mock('./components/IntakeWorkspace', () => ({ IntakeWorkspace: () => <div>资料填写区域</div> }))

import { App } from './App'
import { useCustomerStore } from './stores/customerStore'
afterEach(() => { cleanup(); access.user = null; useCustomerStore.setState({ customers: [], selectedCustomerId: null, initialized: true }) })
describe('insurance tool visibility', () => {
  it('adds the tool to advisor navigation', () => {
    access.user = 'qa-advisor'
    useCustomerStore.setState({ initialized: true })
    render(<App />)
    expect(within(screen.getByLabelText('主导航')).getByRole('button', { name: '储蓄险计算' })).toBeTruthy()
    expect(within(screen.getByLabelText('主导航')).getByRole('button', { name: '医疗保障计算' })).toBeTruthy()
  })
  it('never includes the tool in customer self-service navigation', async () => {
    useCustomerStore.setState({ initialized: true })
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: '客户自测测试入口' }))
    await waitFor(() => expect(screen.getByText('资料填写区域')).toBeTruthy())
    expect(screen.queryByRole('button', { name: '储蓄险计算' })).toBeNull()
    expect(screen.queryByRole('button', { name: '医疗保障计算' })).toBeNull()
  })
})

// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { IntakeQuickNav } from './IntakeQuickNav'

afterEach(cleanup)

describe('IntakeQuickNav', () => {
  it('在报告页显示完整录入导航并标记报告为当前项', () => {
    render(<IntakeQuickNav activeView="report" filled={new Set(['profile', 'cashflow'])} onSelect={() => undefined} />)

    expect(screen.getAllByRole('button')).toHaveLength(8)
    expect(screen.getByRole('button', { name: '分析报告' }).classList.contains('is-active')).toBe(true)
    expect(screen.getByRole('button', { name: '客户资料' })).not.toBeNull()
    expect(screen.getByRole('button', { name: '流动资产与负债' })).not.toBeNull()
  })

  it('点击资料模块时返回对应的录入目标', () => {
    const onSelect = vi.fn()
    render(<IntakeQuickNav activeView="report" filled={new Set()} onSelect={onSelect} />)

    fireEvent.click(screen.getByRole('button', { name: '生活收支' }))
    expect(onSelect).toHaveBeenCalledWith('cashflow')
  })
})

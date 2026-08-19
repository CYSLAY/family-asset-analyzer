// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PrivateControl, PrivateText, PrivacyModeProvider } from './privacy'

describe('privacy mode', () => {
  it('replaces private text without changing the original value', () => {
    const customerName = '陈女士家庭'
    const { rerender } = render(<PrivacyModeProvider enabled><PrivateText>{customerName}</PrivateText></PrivacyModeProvider>)

    expect(screen.getByText('******')).toHaveAttribute('aria-label', '隐私信息已隐藏')
    expect(screen.queryByText(customerName)).not.toBeInTheDocument()

    rerender(<PrivacyModeProvider enabled={false}><PrivateText>{customerName}</PrivateText></PrivacyModeProvider>)
    expect(screen.getByText(customerName)).toBeInTheDocument()
    expect(customerName).toBe('陈女士家庭')
  })

  it('removes the real form control while privacy mode is active', () => {
    const { rerender } = render(<PrivacyModeProvider enabled><PrivateControl><input aria-label="客户姓名" value="陈女士" readOnly /></PrivateControl></PrivacyModeProvider>)

    expect(screen.queryByDisplayValue('陈女士')).not.toBeInTheDocument()
    expect(screen.getByLabelText('隐私信息已隐藏')).toHaveValue('******')
    expect(screen.getByLabelText('隐私信息已隐藏')).toHaveAttribute('readonly')

    rerender(<PrivacyModeProvider enabled={false}><PrivateControl><input aria-label="客户姓名" value="陈女士" readOnly /></PrivateControl></PrivacyModeProvider>)
    expect(screen.getByLabelText('客户姓名')).toHaveValue('陈女士')
  })
})

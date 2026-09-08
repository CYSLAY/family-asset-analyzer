// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { confirmLeavingUnsaved, useUnsavedChanges } from './unsavedChanges'

function Draft({ dirty }: { dirty: boolean }) { useUnsavedChanges(dirty); return null }
afterEach(() => { cleanup(); vi.restoreAllMocks() })
it('blocks navigation when declined and removes the guard after save or unmount', () => {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
  const view = render(<Draft dirty />)
  expect(confirmLeavingUnsaved()).toBe(false)
  const event = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(event)
  expect(event.defaultPrevented).toBe(true)
  view.rerender(<Draft dirty={false} />)
  expect(confirmLeavingUnsaved()).toBe(true)
  expect(confirm).toHaveBeenCalledOnce()
  view.rerender(<Draft dirty />)
  view.unmount()
  expect(confirmLeavingUnsaved()).toBe(true)
})

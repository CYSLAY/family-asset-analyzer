import { useEffect } from 'react'

const pending = new Set<symbol>()
export function confirmLeavingUnsaved() {
  return pending.size === 0 || window.confirm('还有未保存的修改。离开后这些修改将丢失，是否继续？')
}
export function useUnsavedChanges(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return
    const key = Symbol('unsaved')
    pending.add(key)
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => { pending.delete(key); window.removeEventListener('beforeunload', warn) }
  }, [dirty])
}

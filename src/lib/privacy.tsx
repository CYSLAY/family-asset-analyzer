import { createContext, isValidElement, useContext, type ReactNode } from 'react'

const PrivacyModeContext = createContext(false)

export const PRIVACY_MASK = '******'

export function customerAvatarInitial(primaryContactName: string, householdName = '') {
  const source = primaryContactName.trim() || householdName.trim()
  return Array.from(source)[0] || '家'
}

export function PrivacyModeProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  return <PrivacyModeContext.Provider value={enabled}>{children}</PrivacyModeContext.Provider>
}

export function usePrivacyMode() {
  return useContext(PrivacyModeContext)
}

export function PrivateText({ children, className = '', mask = PRIVACY_MASK }: { children: ReactNode; className?: string; mask?: string }) {
  const enabled = usePrivacyMode()
  return <span className={className} aria-label={enabled ? '隐私信息已隐藏' : undefined}>{enabled ? mask : children}</span>
}

export function PrivateControl({ children, mask = PRIVACY_MASK }: { children: ReactNode; mask?: string }) {
  const enabled = usePrivacyMode()
  const multiline = isValidElement(children) && children.type === 'textarea'
  return <span className={`privacy-control${multiline ? ' is-multiline' : ''}`}>
    {enabled
      ? multiline
        ? <textarea aria-label="隐私信息已隐藏" className="privacy-mask-control" readOnly value={mask} />
        : <input aria-label="隐私信息已隐藏" className="privacy-mask-control" readOnly value={mask} />
      : children}
  </span>
}

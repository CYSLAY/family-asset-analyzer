const configuredUsernames = import.meta.env.VITE_ALLOWED_USERNAMES

export const allowedUsernames = (configuredUsernames || 'jojo')
  .split(',')
  .map((name: string) => name.trim().toLowerCase())
  .filter(Boolean)

const ACCESS_SESSION_KEY = 'family-asset-access-user'

export interface AccessSession { username: string; accessCode: string; expiresAt: string }

export function normalizeUsername(username: string) {
  return username.trim().toLowerCase()
}

export function isUsernameAllowed(username: string) {
  return allowedUsernames.includes(normalizeUsername(username))
}

export function getAccessSession(): AccessSession | null {
  try {
    const raw = sessionStorage.getItem(ACCESS_SESSION_KEY)
    if (!raw) return null
    const value = JSON.parse(raw) as AccessSession
    if (/^ws_[a-f0-9]{64}$/.test(value.accessCode) && Date.parse(value.expiresAt) > Date.now() && isUsernameAllowed(value.username)) return value
    sessionStorage.removeItem(ACCESS_SESSION_KEY)
    return null
  } catch { return null }
}

export function getAccessUser() {
  return getAccessSession()?.username ?? null
}

export function saveAccessSession(username: string, accessCode: string, expiresAt: string) {
  const normalized = normalizeUsername(username)
  sessionStorage.setItem(ACCESS_SESSION_KEY, JSON.stringify({ username: normalized, accessCode, expiresAt }))
  return normalized
}

export function clearAccessUser() {
  sessionStorage.removeItem(ACCESS_SESSION_KEY)
}

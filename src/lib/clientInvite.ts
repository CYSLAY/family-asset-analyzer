export function getClientInviteCode(year = new Date().getFullYear()) {
  return `rich${year}`
}

export function isClientInviteCodeValid(value: string, year = new Date().getFullYear()) {
  return value.trim().toLowerCase() === getClientInviteCode(year)
}

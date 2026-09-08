// PostgreSQL JSONB may reorder object keys. Object key order is not a data change.
export function sameDocument(a: unknown, b: unknown) {
  const stable = (value: unknown) => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item)
  return stable(a) === stable(b)
}

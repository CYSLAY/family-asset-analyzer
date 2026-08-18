export function customerDeletionIds(records: Array<{ id: string }>) {
  return new Set(records.map((record) => record.id))
}

export function isDeletedRecordError(error: unknown) {
  if (error instanceof Error) return error.message.includes('record_deleted')
  if (!error || typeof error !== 'object' || !('message' in error)) return false
  return typeof error.message === 'string' && error.message.includes('record_deleted')
}

import { describe, expect, it } from 'vitest'
import { customerDeletionIds, isDeletedRecordError } from './customerDeletion'

describe('customer deletion synchronization', () => {
  it('deduplicates cloud deletion markers by customer id', () => {
    expect([...customerDeletionIds([{ id: 'a' }, { id: 'a' }, { id: 'b' }])]).toEqual(['a', 'b'])
  })

  it('recognizes a server-side deletion rejection', () => {
    expect(isDeletedRecordError(new Error('record_deleted'))).toBe(true)
    expect(isDeletedRecordError({ message: 'record_deleted', code: 'P0001' })).toBe(true)
    expect(isDeletedRecordError(new Error('network_error'))).toBe(false)
  })
})

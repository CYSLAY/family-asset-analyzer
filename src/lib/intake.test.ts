import { describe, expect, it } from 'vitest'
import { createCustomer, intakeCompletion, isIntakeComplete, intakeStepKeys } from '../types/domain'

describe('intake completion compatibility', () => {
  it('keeps legacy customers without progress metadata readable', () => {
    const legacy = createCustomer('旧客户')
    delete legacy.intakeCompletedSteps
    expect(isIntakeComplete(legacy)).toBe(false)
    expect(intakeCompletion(legacy)).toBe(0)
    expect(legacy.primaryContactName).toBe('旧客户')
    expect(legacy.members).toHaveLength(1)
  })

  it('opens the report only after every module is confirmed', () => {
    const customer = createCustomer('完整客户')
    customer.intakeCompletedSteps = intakeStepKeys.slice()
    expect(isIntakeComplete(customer)).toBe(true)
    expect(intakeCompletion(customer)).toBe(100)
  })
})

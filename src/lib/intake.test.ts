import { describe, expect, it } from 'vitest'
import { createAsset, createCustomer, hasIntakeStepData, intakeCompletion, isIntakeComplete } from '../types/domain'

describe('automatic intake status', () => {
  it('keeps legacy customers readable and derives status from their data', () => {
    const legacy = createCustomer('旧客户')
    delete legacy.intakeCompletedSteps
    expect(isIntakeComplete(legacy)).toBe(false)
    expect(hasIntakeStepData(legacy, 'profile')).toBe(true)
    expect(hasIntakeStepData(legacy, 'members')).toBe(true)
    expect(intakeCompletion(legacy)).toBe(33)
    expect(legacy.primaryContactName).toBe('旧客户')
    expect(legacy.members).toHaveLength(1)
  })

  it('marks a module filled only after a meaningful field contains data', () => {
    const customer = createCustomer('测试客户')
    const blankAsset = createAsset()
    blankAsset.category = 'property'
    customer.assets = [blankAsset]
    expect(hasIntakeStepData(customer, 'fixed_assets')).toBe(false)
    customer.assets[0].currentValue = 100000
    expect(hasIntakeStepData(customer, 'fixed_assets')).toBe(true)
    expect(intakeCompletion(customer)).toBe(50)
  })
})

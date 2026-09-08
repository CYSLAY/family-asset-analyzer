import { describe, expect, it } from 'vitest'
import { canSyncSelfServiceCustomer, createAsset, createCustomer, hasIntakeStepData, intakeCompletion, isIntakeComplete } from '../types/domain'

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

  it('does not count the self-service placeholder household name as entered data', () => {
    const customer = createCustomer('', 'self_service')
    customer.householdName = '我的家庭'
    expect(hasIntakeStepData(customer, 'profile')).toBe(false)
    expect(intakeCompletion(customer)).toBe(0)
    expect(canSyncSelfServiceCustomer(customer)).toBe(false)
    customer.city = '香港'
    expect(intakeCompletion(customer)).toBeGreaterThan(10)
    expect(canSyncSelfServiceCustomer(customer)).toBe(false)
    customer.primaryContactName = '测试客户'
    expect(canSyncSelfServiceCustomer(customer)).toBe(false)
    customer.assets = [{ ...createAsset(), currentValue: 10000 }]
    expect(canSyncSelfServiceCustomer(customer)).toBe(true)
  })
})

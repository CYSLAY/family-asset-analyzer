import { describe, expect, it } from 'vitest'
import { createEducationGoal } from '../types/domain'
import { estimateEducationGoalCash, estimateEducationStage } from './educationCosts'

describe('education cost estimates', () => {
  it('使用参考图的美国本科现价总计', () => {
    const estimate = estimateEducationStage({ stage: '本科', durationYears: 4, route: '留学', destination: '美国' })
    expect(estimate.cashTotal).toBe(1453942)
  })

  it('根据已选路线汇总阶段现金和额外培训费', () => {
    const goal = createEducationGoal()
    goal.extraTrainingCostAnnual = 10000
    goal.stagePlans = [
      { stage: '幼儿园', durationYears: 3, route: '私立' },
      { stage: '小学', durationYears: 6, route: '公立' },
    ]
    expect(estimateEducationGoalCash(goal)).toEqual({ routeCashTotal: 954720, extraTrainingTotal: 90000, cashTotal: 1044720, selectedYears: 9 })
  })

  it('未选择路线时不生成虚假费用', () => {
    expect(estimateEducationStage({ stage: '小学', durationYears: 6, route: '' })).toMatchObject({ annualTotal: 0, cashTotal: 0 })
  })
})

import { describe, it, expect } from 'vitest'
import { BAN_COUNT_BY_ROUND, BUDGET_BY_ROUND, TIME_LIMIT_BY_ROUND } from './draftPools.js'

describe('round-scaled draft tables', () => {
  it('ban count escalates 1 -> 2 -> 3 across rounds', () => {
    expect(BAN_COUNT_BY_ROUND).toEqual({ 1: 1, 2: 2, 3: 3 })
  })

  it('budget grows every round', () => {
    expect(BUDGET_BY_ROUND[1]).toBeLessThan(BUDGET_BY_ROUND[2])
    expect(BUDGET_BY_ROUND[2]).toBeLessThan(BUDGET_BY_ROUND[3])
  })

  it('per-player clock grows every round', () => {
    expect(TIME_LIMIT_BY_ROUND[1]).toBeLessThan(TIME_LIMIT_BY_ROUND[2])
    expect(TIME_LIMIT_BY_ROUND[2]).toBeLessThan(TIME_LIMIT_BY_ROUND[3])
  })
})

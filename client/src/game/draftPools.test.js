import { describe, it, expect } from 'vitest'
import { BUDGET_BY_ROUND, TIME_LIMIT_BY_ROUND, TIME_INCREMENT_BY_ROUND, PLACEMENT_TIME_BY_ROUND } from './draftPools.js'

describe('round-scaled draft tables', () => {
  it('budget grows every round', () => {
    expect(BUDGET_BY_ROUND[1]).toBeLessThan(BUDGET_BY_ROUND[2])
    expect(BUDGET_BY_ROUND[2]).toBeLessThan(BUDGET_BY_ROUND[3])
  })

  it('per-player clock grows every round', () => {
    expect(TIME_LIMIT_BY_ROUND[1]).toBeLessThan(TIME_LIMIT_BY_ROUND[2])
    expect(TIME_LIMIT_BY_ROUND[2]).toBeLessThan(TIME_LIMIT_BY_ROUND[3])
  })

  it('per-move clock increment grows every round', () => {
    expect(TIME_INCREMENT_BY_ROUND[1]).toBeLessThan(TIME_INCREMENT_BY_ROUND[2])
    expect(TIME_INCREMENT_BY_ROUND[2]).toBeLessThan(TIME_INCREMENT_BY_ROUND[3])
  })

  it('placement timer grows every round', () => {
    expect(PLACEMENT_TIME_BY_ROUND[1]).toBeLessThan(PLACEMENT_TIME_BY_ROUND[2])
    expect(PLACEMENT_TIME_BY_ROUND[2]).toBeLessThan(PLACEMENT_TIME_BY_ROUND[3])
  })
})

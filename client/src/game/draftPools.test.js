import { describe, it, expect } from 'vitest'
import { BUDGET_BY_ROUND, TIME_LIMIT_BY_ROUND, TIME_INCREMENT_BY_ROUND, ANALYSIS_TIME_SECONDS } from './draftPools.js'

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

  it('gives a positive free-look window before the first move', () => {
    expect(ANALYSIS_TIME_SECONDS).toBeGreaterThan(0)
  })
})

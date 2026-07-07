import { describe, it, expect } from 'vitest'
import { generatePiecePool, generateCardPool } from './draftPools.js'

const N = 1500

describe('generatePiecePool', () => {
  for (const round of [1, 2, 3]) {
    it(`round ${round}: always totals exactly 10 pieces`, () => {
      for (let i = 0; i < N; i++) {
        const pool = generatePiecePool(round)
        const total = Object.values(pool).reduce((a, b) => a + b, 0)
        expect(total).toBe(10)
      }
    })

    it(`round ${round}: always has at least 4 non-pawn pieces (dull all-pawn rolls are excluded)`, () => {
      for (let i = 0; i < N; i++) {
        const pool = generatePiecePool(round)
        const nonPawnCount = Object.entries(pool)
          .filter(([type]) => type !== 'pawn')
          .reduce((sum, [, count]) => sum + count, 0)
        expect(nonPawnCount).toBeGreaterThanOrEqual(4)
      }
    })
  }

  it('round 1 never offers a rook or queen', () => {
    for (let i = 0; i < N; i++) {
      const pool = generatePiecePool(1)
      expect(pool.rook).toBeUndefined()
      expect(pool.queen).toBeUndefined()
    }
  })

  it('round 2 never offers a queen', () => {
    for (let i = 0; i < N; i++) {
      expect(generatePiecePool(2).queen).toBeUndefined()
    }
  })

  it('round 3 can offer every piece type, with composition varying between rolls', () => {
    const shapes = new Set()
    for (let i = 0; i < N; i++) shapes.add(JSON.stringify(generatePiecePool(3)))
    expect(shapes.size).toBeGreaterThan(50)
  })
})

describe('generateCardPool', () => {
  for (const round of [1, 2, 3]) {
    it(`round ${round}: never returns an empty pool`, () => {
      for (let i = 0; i < N; i++) {
        expect(generateCardPool(round).length).toBeGreaterThan(0)
      }
    })
  }

  it('varies which cards appear across rolls', () => {
    const shapes = new Set()
    for (let i = 0; i < N; i++) shapes.add([...generateCardPool(1)].sort().join(','))
    expect(shapes.size).toBeGreaterThan(5)
  })
})

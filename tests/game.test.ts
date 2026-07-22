import { describe, expect, it } from 'vitest'

import {
  LIAR_UNCAUGHT_POINTS,
  TRUTH_CATCH_POINTS,
  assignRoles,
  calculateScoreDeltas,
  resolveDisplayNames,
  shuffledIndexes,
} from '../convex/lib/game'

describe('shuffledIndexes', () => {
  it('creates a complete randomized statement order', () => {
    const values = [0.8, 0.1, 0.6]
    const indexes = shuffledIndexes(4, () => values.shift() ?? 0)

    expect(indexes).toEqual([2, 1, 0, 3])
    expect([...indexes].sort((a, b) => a - b)).toEqual([0, 1, 2, 3])
  })
})

describe('resolveDisplayNames', () => {
  it('uses first names when they are unique in the room', () => {
    expect(resolveDisplayNames(['Ada Lovelace', 'Grace Hopper'])).toEqual([
      'Ada',
      'Grace',
    ])
  })

  it('uses full names only for conflicting first names', () => {
    expect(
      resolveDisplayNames(['Ada Lovelace', 'Ada Byron', 'Grace Hopper']),
    ).toEqual(['Ada Lovelace', 'Ada Byron', 'Grace'])
  })

  it('keeps identical full names identical', () => {
    expect(resolveDisplayNames(['Hitesh Rohira', 'Hitesh Rohira'])).toEqual([
      'Hitesh Rohira',
      'Hitesh Rohira',
    ])
  })
})

describe('assignRoles', () => {
  it.each([
    [3, 1],
    [4, 2],
    [5, 2],
    [10, 4],
    [15, 5],
    [20, 7],
  ])('assigns at least one liar to %i players', (players, expectedLiars) => {
    const roles = assignRoles(players, () => 0.5)

    expect(roles).toHaveLength(players)
    expect(roles.filter((role) => role === 'lie')).toHaveLength(expectedLiars)
  })

  it('rejects room sizes outside the game rules', () => {
    expect(() => assignRoles(2)).toThrow('between 3 and 20')
    expect(() => assignRoles(21)).toThrow('between 3 and 20')
  })
})

describe('calculateScoreDeltas', () => {
  it('rewards correct truth votes and liar misdirection', () => {
    const scores = calculateScoreDeltas(
      [
        { id: 'liar', role: 'lie' },
        { id: 'truth-1', role: 'truth' },
        { id: 'truth-2', role: 'truth' },
      ],
      [
        { voterId: 'truth-1', targetPlayerId: 'liar' },
        { voterId: 'truth-2', targetPlayerId: 'truth-1' },
      ],
    )

    expect(scores.get('liar')).toBe(LIAR_UNCAUGHT_POINTS)
    expect(scores.get('truth-1')).toBe(TRUTH_CATCH_POINTS)
    expect(scores.get('truth-2')).toBe(0)
  })

  it('gives a liar no points when every truth player catches them', () => {
    const scores = calculateScoreDeltas(
      [
        { id: 'liar', role: 'lie' },
        { id: 'truth-1', role: 'truth' },
        { id: 'truth-2', role: 'truth' },
      ],
      [
        { voterId: 'truth-1', targetPlayerId: 'liar' },
        { voterId: 'truth-2', targetPlayerId: 'liar' },
      ],
    )

    expect(scores.get('liar')).toBe(0)
    expect(scores.get('truth-1')).toBe(TRUTH_CATCH_POINTS)
    expect(scores.get('truth-2')).toBe(TRUTH_CATCH_POINTS)
  })

  it('rewards a completely uncaught lie more than catching it', () => {
    const scores = calculateScoreDeltas(
      [
        { id: 'liar', role: 'lie' },
        { id: 'truth-1', role: 'truth' },
        { id: 'truth-2', role: 'truth' },
      ],
      [
        { voterId: 'truth-1', targetPlayerId: 'truth-2' },
        { voterId: 'truth-2', targetPlayerId: 'truth-1' },
      ],
    )

    expect(scores.get('liar')).toBe(2 * LIAR_UNCAUGHT_POINTS)
    expect(scores.get('liar')).toBeGreaterThan(TRUTH_CATCH_POINTS)
    expect(scores.get('truth-1')).toBe(0)
    expect(scores.get('truth-2')).toBe(0)
  })
})

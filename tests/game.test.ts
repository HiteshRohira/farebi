import { describe, expect, it } from 'vitest'

import {
  assignRoles,
  calculateScoreDeltas,
  resolveDisplayNames,
} from '../convex/lib/game'

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
  ])('assigns at least one liar to %i players', (players, expectedLiars) => {
    const roles = assignRoles(players, () => 0.5)

    expect(roles).toHaveLength(players)
    expect(roles.filter((role) => role === 'lie')).toHaveLength(expectedLiars)
  })

  it('rejects room sizes outside the game rules', () => {
    expect(() => assignRoles(2)).toThrow('between 3 and 5')
    expect(() => assignRoles(6)).toThrow('between 3 and 5')
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

    expect(scores.get('liar')).toBe(40)
    expect(scores.get('truth-1')).toBe(10)
    expect(scores.get('truth-2')).toBe(0)
  })
})

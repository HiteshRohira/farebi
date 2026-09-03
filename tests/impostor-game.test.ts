import { describe, expect, it } from 'vitest'

import { IMPOSTOR_WORD_PAIRS } from '../convex/data/impostor_words'
import {
  assignImpostorRoles,
  chooseImpostorWords,
  resolveImpostorVote,
} from '../convex/lib/impostor_game'

describe('impostor word catalogue', () => {
  it('contains unique, genuinely different pairs', () => {
    expect(IMPOSTOR_WORD_PAIRS.length).toBeGreaterThanOrEqual(50)
    expect(new Set(IMPOSTOR_WORD_PAIRS.map((pair) => pair.id)).size).toBe(
      IMPOSTOR_WORD_PAIRS.length,
    )
    expect(
      IMPOSTOR_WORD_PAIRS.every(
        (pair) =>
          pair.words[0].trim().length > 0 &&
          pair.words[1].trim().length > 0 &&
          pair.words[0].toLocaleLowerCase() !==
            pair.words[1].toLocaleLowerCase(),
      ),
    ).toBe(true)
  })
})

describe('assignImpostorRoles', () => {
  it('assigns the requested number of impostors', () => {
    const roles = assignImpostorRoles(7, 2, () => 0.4)

    expect(roles).toHaveLength(7)
    expect(roles.filter((role) => role === 'impostor')).toHaveLength(2)
  })

  it('requires at least one regular player', () => {
    expect(() => assignImpostorRoles(3, 3)).toThrow('one regular player')
  })
})

describe('chooseImpostorWords', () => {
  const pairs = [
    { id: 'first', words: ['Coffee', 'Tea'] as const },
    { id: 'second', words: ['Beach', 'Pool'] as const },
  ]

  it('avoids the previous pair when another is available', () => {
    expect(chooseImpostorWords(pairs, 'first', () => 0)).toEqual({
      pairId: 'second',
      commonWord: 'Beach',
      impostorWord: 'Pool',
    })
  })

  it('can swap which word is shared', () => {
    expect(chooseImpostorWords(pairs, undefined, () => 0.9)).toEqual({
      pairId: 'second',
      commonWord: 'Pool',
      impostorWord: 'Beach',
    })
  })
})

describe('resolveImpostorVote', () => {
  const players = [
    { id: 'a', role: 'player' as const },
    { id: 'b', role: 'player' as const },
    { id: 'x', role: 'impostor' as const },
  ]

  it('ends the game when the final impostor is voted out', () => {
    const result = resolveImpostorVote(
      players,
      [
        { voterId: 'a', targetPlayerId: 'x' },
        { voterId: 'b', targetPlayerId: 'x' },
        { voterId: 'x', targetPlayerId: 'a' },
      ],
      'eliminate_none',
    )

    expect(result.eliminatedIds).toEqual(['x'])
    expect(result.gameComplete).toBe(true)
  })

  it('removes nobody after a tie when configured that way', () => {
    const result = resolveImpostorVote(
      players,
      [
        { voterId: 'a', targetPlayerId: 'x' },
        { voterId: 'b', targetPlayerId: 'a' },
        { voterId: 'x', targetPlayerId: 'b' },
      ],
      'eliminate_none',
    )

    expect(result.eliminatedIds).toEqual([])
    expect(result.gameComplete).toBe(false)
  })

  it('removes every tied player when configured that way', () => {
    const result = resolveImpostorVote(
      players,
      [
        { voterId: 'a', targetPlayerId: 'x' },
        { voterId: 'b', targetPlayerId: 'a' },
        { voterId: 'x', targetPlayerId: 'b' },
      ],
      'eliminate_all',
    )

    expect(result.eliminatedIds).toEqual(['a', 'b', 'x'])
    expect(result.gameComplete).toBe(true)
  })

  it('continues while another impostor remains', () => {
    const result = resolveImpostorVote(
      [...players, { id: 'y', role: 'impostor' as const }],
      [
        { voterId: 'a', targetPlayerId: 'x' },
        { voterId: 'b', targetPlayerId: 'x' },
        { voterId: 'x', targetPlayerId: 'a' },
        { voterId: 'y', targetPlayerId: 'x' },
      ],
      'eliminate_none',
    )

    expect(result.eliminatedIds).toEqual(['x'])
    expect(result.gameComplete).toBe(false)
  })
})

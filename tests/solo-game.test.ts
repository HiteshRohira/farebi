import { describe, expect, it } from 'vitest'

import { CELEBRITIES } from '../src/lib/celebrities'
import { createCelebrityDeck } from '../src/lib/solo-game'

describe('createCelebrityDeck', () => {
  it('contains every built-in celebrity exactly once', () => {
    const deck = createCelebrityDeck(() => 0.5)

    expect(deck).toHaveLength(CELEBRITIES.length)
    expect(new Set(deck.map((celebrity) => celebrity.name)).size).toBe(
      CELEBRITIES.length,
    )
  })

  it('does not repeat the previous draw at the start of a new deck', () => {
    const previousName = createCelebrityDeck(() => 0).at(-1)!.name
    const nextDeck = createCelebrityDeck(() => 0, previousName)

    expect(nextDeck.at(-1)?.name).not.toBe(previousName)
  })
})

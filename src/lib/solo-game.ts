import { CELEBRITIES } from '@/lib/celebrities'
import type { Celebrity } from '@/lib/celebrities'

export function createCelebrityDeck(
  random: () => number = Math.random,
  previousName?: string,
): Array<Celebrity> {
  const deck = [...CELEBRITIES]

  for (let index = deck.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1))
    ;[deck[index], deck[target]] = [deck[target], deck[index]]
  }

  if (previousName && deck.at(-1)?.name === previousName && deck.length > 1) {
    ;[deck[0], deck[deck.length - 1]] = [deck[deck.length - 1], deck[0]]
  }

  return deck
}

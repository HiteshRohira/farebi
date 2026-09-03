import type { ImpostorWordPair } from '../data/impostor_words'

export type ImpostorRole = 'player' | 'impostor'
export type ImpostorTieRule = 'eliminate_all' | 'eliminate_none'

export function assignImpostorRoles(
  playerCount: number,
  impostorCount = 1,
  random: () => number = Math.random,
): Array<ImpostorRole> {
  if (playerCount < 3 || playerCount > 20) {
    throw new Error('Impostor requires between 3 and 20 players.')
  }
  if (
    !Number.isInteger(impostorCount) ||
    impostorCount < 1 ||
    impostorCount >= playerCount
  ) {
    throw new Error(
      'Choose at least one impostor and leave one regular player.',
    )
  }

  const roles: Array<ImpostorRole> = Array.from(
    { length: playerCount },
    (_, index) => (index < impostorCount ? 'impostor' : 'player'),
  )
  for (let index = roles.length - 1; index > 0; index -= 1) {
    const swapWith = Math.floor(random() * (index + 1))
    ;[roles[index], roles[swapWith]] = [roles[swapWith], roles[index]]
  }
  return roles
}

export function chooseImpostorWords(
  pairs: ReadonlyArray<ImpostorWordPair>,
  previousPairId?: string,
  random: () => number = Math.random,
) {
  if (!pairs.length)
    throw new Error('At least one impostor word pair is required.')
  const choices =
    pairs.length > 1 && previousPairId
      ? pairs.filter((pair) => pair.id !== previousPairId)
      : [...pairs]
  const pair = choices[Math.floor(random() * choices.length)]
  const swap = random() >= 0.5
  return {
    pairId: pair.id,
    commonWord: pair.words[swap ? 1 : 0],
    impostorWord: pair.words[swap ? 0 : 1],
  }
}

export function resolveImpostorVote<TPlayerId extends string>(
  players: Array<{ id: TPlayerId; role: ImpostorRole }>,
  votes: Array<{ voterId: TPlayerId; targetPlayerId: TPlayerId }>,
  tieRule: ImpostorTieRule,
) {
  const voteCounts = new Map<TPlayerId, number>(
    players.map((player) => [player.id, 0]),
  )
  for (const vote of votes) {
    if (voteCounts.has(vote.targetPlayerId)) {
      voteCounts.set(
        vote.targetPlayerId,
        (voteCounts.get(vote.targetPlayerId) ?? 0) + 1,
      )
    }
  }

  const highestCount = Math.max(...voteCounts.values())
  const tiedIds = [...voteCounts.entries()]
    .filter(([, count]) => count === highestCount)
    .map(([id]) => id)
  const eliminatedIds =
    tiedIds.length > 1 && tieRule === 'eliminate_none' ? [] : tiedIds
  const eliminated = new Set(eliminatedIds)
  const gameComplete = !players.some(
    (player) => player.role === 'impostor' && !eliminated.has(player.id),
  )

  return { voteCounts, tiedIds, eliminatedIds, gameComplete }
}

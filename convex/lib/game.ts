export type Role = 'truth' | 'lie'

export const LIAR_UNCAUGHT_POINTS = 20
export const TRUTH_CATCH_POINTS = 10

export function shuffledIndexes(
  count: number,
  random: () => number = Math.random,
) {
  const indexes = Array.from({ length: count }, (_, index) => index)
  for (let index = indexes.length - 1; index > 0; index -= 1) {
    const swapWith = Math.floor(random() * (index + 1))
    const value = indexes[index]
    indexes[index] = indexes[swapWith]!
    indexes[swapWith] = value!
  }
  return indexes
}

export function resolveDisplayNames(names: Array<string>) {
  const normalizedNames = names.map((name) => name.trim() || 'Player')
  const firstNames = normalizedNames.map((name) => name.split(/\s+/)[0])
  const firstNameCounts = new Map<string, number>()

  for (const firstName of firstNames) {
    const key = firstName.toLocaleLowerCase()
    firstNameCounts.set(key, (firstNameCounts.get(key) ?? 0) + 1)
  }

  return normalizedNames.map((fullName, index) => {
    const firstName = firstNames[index]
    return (firstNameCounts.get(firstName.toLocaleLowerCase()) ?? 0) > 1
      ? fullName
      : firstName
  })
}

export function assignRoles(
  playerCount: number,
  random: () => number = Math.random,
): Array<Role> {
  if (playerCount < 3 || playerCount > 20) {
    throw new Error('A game requires between 3 and 20 players.')
  }

  const liarCount = Math.max(1, Math.ceil(playerCount / 3))
  const roles: Array<Role> = Array.from({ length: playerCount }, (_, index) =>
    index < liarCount ? 'lie' : 'truth',
  )

  for (let index = roles.length - 1; index > 0; index -= 1) {
    const swapWith = Math.floor(random() * (index + 1))
    const role = roles[index]
    roles[index] = roles[swapWith]!
    roles[swapWith] = role!
  }
  return roles
}

export function calculateScoreDeltas<TPlayerId extends string>(
  players: Array<{ id: TPlayerId; role: Role }>,
  votes: Array<{ voterId: TPlayerId; targetPlayerId: TPlayerId }>,
) {
  const liars = new Set(
    players
      .filter((player) => player.role === 'lie')
      .map((player) => player.id),
  )
  const truthPlayers = players.filter((player) => player.role === 'truth')

  return new Map(
    players.map((player) => {
      if (player.role === 'lie') {
        const votesCatchingThisLiar = truthPlayers.filter((truthPlayer) =>
          votes.some(
            (vote) =>
              vote.voterId === truthPlayer.id &&
              vote.targetPlayerId === player.id,
          ),
        ).length
        return [
          player.id,
          (truthPlayers.length - votesCatchingThisLiar) * LIAR_UNCAUGHT_POINTS,
        ] as const
      }
      const vote = votes.find((item) => item.voterId === player.id)
      return [
        player.id,
        vote && liars.has(vote.targetPlayerId) ? TRUTH_CATCH_POINTS : 0,
      ] as const
    }),
  )
}

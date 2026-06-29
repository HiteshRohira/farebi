export type Role = 'truth' | 'lie'

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
  if (playerCount < 3 || playerCount > 5) {
    throw new Error('A game requires between 3 and 5 players.')
  }

  const liarCount = Math.max(1, Math.floor(playerCount / 2))
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
  const incorrectTruthVotes = votes.filter((vote) => {
    const voter = players.find((player) => player.id === vote.voterId)
    return voter?.role === 'truth' && !liars.has(vote.targetPlayerId)
  }).length

  return new Map(
    players.map((player) => {
      if (player.role === 'lie') {
        return [player.id, 30 + incorrectTruthVotes * 10] as const
      }
      const vote = votes.find((item) => item.voterId === player.id)
      return [
        player.id,
        vote && liars.has(vote.targetPlayerId) ? 10 : 0,
      ] as const
    }),
  )
}

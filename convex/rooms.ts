import { v } from 'convex/values'

import type { Doc, Id } from './_generated/dataModel'
import type { MutationCtx, QueryCtx } from './_generated/server'
import { internalMutation, mutation, query } from './_generated/server'
import { IMPOSTOR_WORD_PAIRS } from './data/impostor_words'
import {
  getCurrentUser,
  requireCurrentUser,
  requirePlayer,
  upsertCurrentUser,
} from './lib/auth'
import {
  assignRoles,
  calculateScoreDeltas,
  createCelebrityTurns,
  nextTurnOrder,
  resolveDisplayNames,
  shuffledIndexes,
} from './lib/game'
import {
  assignImpostorRoles,
  chooseImpostorWords,
  resolveImpostorVote,
} from './lib/impostor_game'

type GameType = 'truth_or_lie' | 'celebrity' | 'impostor'

const DEFAULT_WRITING_SECONDS = 5 * 60
const DEFAULT_DISCUSSION_VOTING_SECONDS = 10 * 60
const MIN_PHASE_SECONDS = 0.5 * 60
const MAX_PHASE_SECONDS = 30 * 60
const DEFAULT_LIAR_COUNT = 1
const DEFAULT_IMPOSTOR_COUNT = 1
const DEFAULT_IMPOSTOR_VOTING_VISIBILITY = 'anonymous' as const
const DEFAULT_IMPOSTOR_TIE_RULE = 'eliminate_none' as const
const PHASE_EXTENSION_MS = 30 * 1_000
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const ROOM_INACTIVITY_MS = 24 * 60 * 60 * 1_000

type RoomCtx = MutationCtx | QueryCtx

function roomActivity(now = Date.now()) {
  return {
    lastActivityAt: now,
    expiresAt: now + ROOM_INACTIVITY_MS,
  }
}

function isRoomActive(room: Doc<'rooms'>, now = Date.now()) {
  const expiresAt = room.expiresAt ?? room.createdAt + ROOM_INACTIVITY_MS
  return !room.endedAt && room.status !== 'finished' && expiresAt > now
}

async function getActiveMembership(
  ctx: RoomCtx,
  userId: Id<'users'>,
): Promise<{ player: Doc<'players'>; room: Doc<'rooms'> } | null> {
  const memberships = await ctx.db
    .query('players')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .collect()
  const candidates: Array<{
    player: Doc<'players'>
    room: Doc<'rooms'>
  }> = []
  for (const player of memberships.filter((item) => !item.leftAt)) {
    const room = await ctx.db.get(player.roomId)
    if (room && isRoomActive(room)) candidates.push({ player, room })
  }
  return (
    candidates.sort((a, b) => b.player.createdAt - a.player.createdAt).at(0) ??
    null
  )
}

async function getActivePlayers(ctx: RoomCtx, roomId: Id<'rooms'>) {
  const players = await ctx.db
    .query('players')
    .withIndex('by_room', (q) => q.eq('roomId', roomId))
    .collect()
  return players.filter((player) => !player.leftAt)
}

async function joinTargetRoom(
  ctx: MutationCtx,
  userId: Id<'users'>,
  room: Doc<'rooms'>,
) {
  if (!isRoomActive(room)) throw new Error('This room has ended or expired.')

  const existing = await ctx.db
    .query('players')
    .withIndex('by_room_and_user', (q) =>
      q.eq('roomId', room._id).eq('userId', userId),
    )
    .unique()
  if (existing?.kickedAt) {
    throw new Error('The host removed you from this room.')
  }
  if (existing && !existing.leftAt) {
    await ctx.db.patch(room._id, roomActivity())
    return existing
  }

  if (room.gameType === 'impostor' && room.status !== 'waiting') {
    throw new Error('This Impostor game has already started.')
  }

  const players = await getActivePlayers(ctx, room._id)
  if (players.length >= room.maxPlayers) throw new Error('This room is full.')

  if (existing) {
    await ctx.db.patch(existing._id, {
      leftAt: undefined,
      joinedForNextRound: room.status !== 'waiting',
    })
    await ctx.db.patch(room._id, roomActivity())
    return existing
  }

  const playerId = await ctx.db.insert('players', {
    roomId: room._id,
    userId,
    score: 0,
    hasSubmitted: false,
    hasVoted: false,
    joinedForNextRound: room.status !== 'waiting',
    createdAt: Date.now(),
  })
  await ctx.db.patch(room._id, roomActivity())
  return await ctx.db.get(playerId)
}

async function endRoomDocument(ctx: MutationCtx, room: Doc<'rooms'>) {
  const now = Date.now()
  await ctx.db.patch(room._id, {
    status: 'finished',
    endedAt: now,
    phaseEndsAt: undefined,
    expiresAt: undefined,
    lastActivityAt: now,
  })
}

async function closeOtherActiveMemberships(
  ctx: MutationCtx,
  userId: Id<'users'>,
  keepRoomId: Id<'rooms'>,
) {
  const memberships = await ctx.db
    .query('players')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .collect()
  for (const player of memberships) {
    if (player.roomId === keepRoomId || player.leftAt) continue
    const room = await ctx.db.get(player.roomId)
    if (!room || !isRoomActive(room)) continue
    if (room.hostId === userId) {
      await endRoomDocument(ctx, room)
    } else {
      await ctx.db.patch(player._id, { leftAt: Date.now() })
      await settlePhaseAfterPlayerRemoval(ctx, room)
    }
  }
}

function validateDurations(
  writingDurationSeconds: number,
  discussionVotingDurationSeconds: number,
) {
  const durations = [
    ['Writing', writingDurationSeconds],
    ['Discussion and voting', discussionVotingDurationSeconds],
  ] as const
  for (const [label, value] of durations) {
    if (
      !Number.isInteger(value) ||
      value % 6 !== 0 ||
      value < MIN_PHASE_SECONDS ||
      value > MAX_PHASE_SECONDS
    ) {
      throw new Error(
        `${label} time must be between 0.5 and 30 minutes, in 0.1-minute increments.`,
      )
    }
  }
}

function durationMs(
  room: Doc<'rooms'>,
  field: 'writingDurationSeconds' | 'discussionVotingDurationSeconds',
) {
  if (field === 'writingDurationSeconds') {
    return (room.writingDurationSeconds ?? DEFAULT_WRITING_SECONDS) * 1_000
  }

  return (
    (room.discussionVotingDurationSeconds ??
      DEFAULT_DISCUSSION_VOTING_SECONDS) * 1_000
  )
}

function makeRoomCode() {
  return Array.from({ length: 6 }, () =>
    CODE_ALPHABET.charAt(Math.floor(Math.random() * CODE_ALPHABET.length)),
  ).join('')
}

async function findRoomByCode(ctx: MutationCtx, code: string) {
  return await ctx.db
    .query('rooms')
    .withIndex('by_code', (q) => q.eq('code', code.trim().toUpperCase()))
    .unique()
}

async function finishVoting(
  ctx: MutationCtx,
  room: Doc<'rooms'>,
  players: Array<Doc<'players'>>,
) {
  const activePlayers = players.filter((player) => player.role !== undefined)
  const votes = await ctx.db
    .query('votes')
    .withIndex('by_room', (q) => q.eq('roomId', room._id))
    .collect()
  const activePlayerIds = new Set(activePlayers.map((player) => player._id))
  const activeVotes = votes.filter(
    (vote) =>
      activePlayerIds.has(vote.voterId) &&
      activePlayerIds.has(vote.targetPlayerId),
  )
  const scoreDeltas = calculateScoreDeltas(
    activePlayers.map((player) => ({
      id: player._id,
      role: player.role!,
    })),
    activeVotes.map((vote) => ({
      voterId: vote.voterId,
      targetPlayerId: vote.targetPlayerId,
    })),
  )

  for (const player of activePlayers) {
    await ctx.db.patch(player._id, {
      score: player.score + (scoreDeltas.get(player._id) ?? 0),
    })
  }

  await ctx.db.patch(room._id, {
    status: 'results',
    phaseEndsAt: undefined,
    ...roomActivity(),
  })
}

async function finishWriting(
  ctx: MutationCtx,
  room: Doc<'rooms'>,
  players: Array<Doc<'players'>>,
) {
  for (const player of players.filter((item) => item.role !== undefined)) {
    if (!player.statement) {
      await ctx.db.patch(player._id, {
        statement: 'No statement submitted.',
        hasSubmitted: true,
      })
    }
  }
  await ctx.db.patch(room._id, {
    status: 'voting',
    phaseEndsAt:
      Date.now() + durationMs(room, 'discussionVotingDurationSeconds'),
    ...roomActivity(),
  })
}

async function startCelebrityGuessing(
  ctx: MutationCtx,
  room: Doc<'rooms'>,
  players: Array<Doc<'players'>>,
) {
  if (players.length < 2) {
    await ctx.db.patch(room._id, {
      status: 'results',
      celebrityTurnIndex: undefined,
      phaseEndsAt: undefined,
      ...roomActivity(),
    })
    return
  }

  const namedPlayers = []
  for (const player of players) {
    const profile = await ctx.db.get(player.userId)
    namedPlayers.push({ player, name: profile?.name ?? 'Player' })
  }
  const turns = createCelebrityTurns(
    namedPlayers.map((item) => ({ id: item.player._id, name: item.name })),
  )
  for (const turn of turns) {
    await ctx.db.patch(turn.guesserId, {
      celebrityTurnOrder: turn.turnOrder,
      celebrityTargetPlayerId: turn.targetPlayerId,
    })
  }
  await ctx.db.patch(room._id, {
    status: 'celebrity_guessing',
    celebrityTurnIndex: 0,
    phaseEndsAt: undefined,
    ...roomActivity(),
  })
}

async function deleteImpostorVotes(ctx: MutationCtx, roomId: Id<'rooms'>) {
  const votes = await ctx.db
    .query('impostorVotes')
    .withIndex('by_room', (q) => q.eq('roomId', roomId))
    .collect()
  for (const vote of votes) await ctx.db.delete(vote._id)
}

async function finishImpostorVoting(
  ctx: MutationCtx,
  room: Doc<'rooms'>,
  players: Array<Doc<'players'>>,
) {
  const round = room.impostorRound ?? 1
  const activePlayers = players.filter(
    (player) =>
      player.impostorRole !== undefined &&
      player.impostorEliminatedRound === undefined,
  )
  const activeIds = new Set(activePlayers.map((player) => player._id))
  const votes = await ctx.db
    .query('impostorVotes')
    .withIndex('by_room_and_round', (q) =>
      q.eq('roomId', room._id).eq('round', round),
    )
    .collect()
  const validVotes = votes.filter(
    (vote) =>
      activeIds.has(vote.voterId) &&
      activeIds.has(vote.targetPlayerId) &&
      vote.voterId !== vote.targetPlayerId,
  )
  if (validVotes.length !== activePlayers.length) return

  const resolution = resolveImpostorVote(
    activePlayers.map((player) => ({
      id: player._id,
      role: player.impostorRole!,
    })),
    validVotes.map((vote) => ({
      voterId: vote.voterId,
      targetPlayerId: vote.targetPlayerId,
    })),
    room.impostorTieRule ?? DEFAULT_IMPOSTOR_TIE_RULE,
  )
  for (const playerId of resolution.eliminatedIds) {
    await ctx.db.patch(playerId, { impostorEliminatedRound: round })
  }

  await ctx.db.patch(room._id, {
    status: resolution.gameComplete ? 'results' : 'impostor_playing',
    impostorRound: resolution.gameComplete ? round : round + 1,
    impostorLastVoteRound: round,
    impostorLastEliminatedPlayerIds: resolution.eliminatedIds,
    phaseEndsAt: undefined,
    ...roomActivity(),
  })
}

async function settlePhaseAfterPlayerRemoval(
  ctx: MutationCtx,
  room: Doc<'rooms'>,
) {
  const players = await getActivePlayers(ctx, room._id)
  if (room.status === 'writing') {
    const playing = players.filter((player) => player.role !== undefined)
    if (playing.every((player) => player.hasSubmitted)) {
      await finishWriting(ctx, room, players)
      return
    }
  } else if (room.status === 'voting') {
    const playing = players.filter((player) => player.role !== undefined)
    if (playing.every((player) => player.hasVoted)) {
      await finishVoting(ctx, room, players)
      return
    }
  } else if (room.status === 'celebrity_submitting') {
    const playing = players.filter((player) => !player.joinedForNextRound)
    if (playing.every((player) => player.hasSubmitted)) {
      await startCelebrityGuessing(ctx, room, playing)
      return
    }
  } else if (room.status === 'celebrity_guessing') {
    const currentTurn = room.celebrityTurnIndex ?? 0
    const currentPlayer = players.find(
      (player) => player.celebrityTurnOrder === currentTurn,
    )
    if (!currentPlayer) {
      const nextTurn = nextTurnOrder(
        players.map((player) => player.celebrityTurnOrder),
        currentTurn,
      )
      await ctx.db.patch(
        room._id,
        nextTurn === undefined
          ? {
              status: 'results',
              celebrityTurnIndex: undefined,
              ...roomActivity(),
            }
          : { celebrityTurnIndex: nextTurn, ...roomActivity() },
      )
      return
    }
  } else if (room.status === 'impostor_playing') {
    const round = room.impostorRound ?? 1
    const playing = players.filter(
      (player) =>
        player.impostorRole !== undefined &&
        player.impostorEliminatedRound === undefined,
    )
    const playingIds = new Set(playing.map((player) => player._id))
    const votes = await ctx.db
      .query('impostorVotes')
      .withIndex('by_room_and_round', (q) =>
        q.eq('roomId', room._id).eq('round', round),
      )
      .collect()
    for (const vote of votes) {
      if (
        !playingIds.has(vote.voterId) ||
        !playingIds.has(vote.targetPlayerId)
      ) {
        await ctx.db.delete(vote._id)
      }
    }
    if (!playing.some((player) => player.impostorRole === 'impostor')) {
      await ctx.db.patch(room._id, {
        status: 'results',
        phaseEndsAt: undefined,
        ...roomActivity(),
      })
      return
    }
    await finishImpostorVoting(ctx, room, playing)
    return
  }

  await ctx.db.patch(room._id, roomActivity())
}

export const createRoom = mutation({
  args: {
    maxPlayers: v.optional(v.number()),
    gameType: v.optional(
      v.union(
        v.literal('truth_or_lie'),
        v.literal('celebrity'),
        v.literal('impostor'),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const userId = await upsertCurrentUser(ctx)
    const activeMembership = await getActiveMembership(ctx, userId)
    if (activeMembership) {
      await closeOtherActiveMemberships(ctx, userId, activeMembership.room._id)
      return {
        roomId: activeMembership.room._id,
        code: activeMembership.room.code,
        resumed: true,
      }
    }
    const maxPlayers = args.maxPlayers ?? 20
    if (!Number.isInteger(maxPlayers) || maxPlayers < 3 || maxPlayers > 20) {
      throw new Error('Room size must be between 3 and 20 players.')
    }

    let code = makeRoomCode()
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const existing = await ctx.db
        .query('rooms')
        .withIndex('by_code', (q) => q.eq('code', code))
        .unique()
      if (!existing) break
      code = makeRoomCode()
    }

    const now = Date.now()
    const roomId = await ctx.db.insert('rooms', {
      code,
      hostId: userId,
      status: 'waiting',
      gameType: args.gameType,
      maxPlayers,
      liarCount: DEFAULT_LIAR_COUNT,
      writingDurationSeconds: DEFAULT_WRITING_SECONDS,
      discussionVotingDurationSeconds: DEFAULT_DISCUSSION_VOTING_SECONDS,
      impostorCount: DEFAULT_IMPOSTOR_COUNT,
      impostorVotingVisibility: DEFAULT_IMPOSTOR_VOTING_VISIBILITY,
      impostorTieRule: DEFAULT_IMPOSTOR_TIE_RULE,
      createdAt: now,
      ...roomActivity(now),
    })
    await ctx.db.insert('players', {
      roomId,
      userId,
      score: 0,
      hasSubmitted: false,
      hasVoted: false,
      createdAt: now,
    })
    return { roomId, code, resumed: false }
  },
})

export const joinRoom = mutation({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const userId = await upsertCurrentUser(ctx)
    const room = await findRoomByCode(ctx, args.code)
    if (!room) throw new Error('Room not found.')
    const existing = await ctx.db
      .query('players')
      .withIndex('by_room_and_user', (q) =>
        q.eq('roomId', room._id).eq('userId', userId),
      )
      .unique()
    if (!isRoomActive(room)) {
      if (existing) return { roomId: room._id, code: room.code }
      throw new Error('This room has ended or expired.')
    }

    const activeMembership = await getActiveMembership(ctx, userId)
    if (activeMembership && activeMembership.room._id !== room._id) {
      throw new Error(
        'You already have an active room. Leave or end it before joining another.',
      )
    }

    await joinTargetRoom(ctx, userId, room)
    await closeOtherActiveMemberships(ctx, userId, room._id)
    return { roomId: room._id, code: room.code }
  },
})

export const switchRoom = mutation({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const userId = await upsertCurrentUser(ctx)
    const targetRoom = await findRoomByCode(ctx, args.code)
    if (!targetRoom) throw new Error('Room not found.')
    if (!isRoomActive(targetRoom)) {
      throw new Error('This room has ended or expired.')
    }
    if (targetRoom.gameType === 'impostor' && targetRoom.status !== 'waiting') {
      const existingTargetMembership = await ctx.db
        .query('players')
        .withIndex('by_room_and_user', (q) =>
          q.eq('roomId', targetRoom._id).eq('userId', userId),
        )
        .unique()
      if (!existingTargetMembership || existingTargetMembership.leftAt) {
        throw new Error('This Impostor game has already started.')
      }
    }

    const activeMembership = await getActiveMembership(ctx, userId)
    if (activeMembership?.room._id === targetRoom._id) {
      return { roomId: targetRoom._id, code: targetRoom.code }
    }

    if (activeMembership) {
      if (activeMembership.room.hostId === userId) {
        await endRoomDocument(ctx, activeMembership.room)
      } else {
        await ctx.db.patch(activeMembership.player._id, {
          leftAt: Date.now(),
        })
        await settlePhaseAfterPlayerRemoval(ctx, activeMembership.room)
      }
    }

    await joinTargetRoom(ctx, userId, targetRoom)
    await closeOtherActiveMemberships(ctx, userId, targetRoom._id)
    return { roomId: targetRoom._id, code: targetRoom.code }
  },
})

export const getCurrentRoom = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx)
    if (!user) return null
    const membership = await getActiveMembership(ctx, user._id)
    if (!membership) return null
    const players = await getActivePlayers(ctx, membership.room._id)
    return {
      id: membership.room._id,
      code: membership.room.code,
      status: membership.room.status,
      gameType: membership.room.gameType ?? 'truth_or_lie',
      isHost: membership.room.hostId === user._id,
      playerCount: players.length,
      maxPlayers: membership.room.maxPlayers,
    }
  },
})

export const leaveRoom = mutation({
  args: { roomId: v.id('rooms') },
  handler: async (ctx, args) => {
    const { user, player } = await requirePlayer(ctx, args.roomId)
    const room = await ctx.db.get(args.roomId)
    if (!room) throw new Error('Room not found.')
    if (isRoomActive(room) && room.hostId === user._id) {
      throw new Error('Hosts must end the room before leaving.')
    }
    await ctx.db.patch(player._id, {
      leftAt: Date.now(),
      ...(room.status === 'impostor_playing' && player.impostorRole
        ? { impostorEliminatedRound: room.impostorRound ?? 1 }
        : {}),
    })
    if (isRoomActive(room)) await settlePhaseAfterPlayerRemoval(ctx, room)
  },
})

export const endRoom = mutation({
  args: { roomId: v.id('rooms') },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx)
    const room = await ctx.db.get(args.roomId)
    if (!room) throw new Error('Room not found.')
    if (room.hostId !== user._id)
      throw new Error('Only the host can end the room.')
    if (!room.endedAt) await endRoomDocument(ctx, room)
  },
})

export const kickPlayer = mutation({
  args: {
    roomId: v.id('rooms'),
    playerId: v.id('players'),
  },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx)
    const room = await ctx.db.get(args.roomId)
    if (!room || !isRoomActive(room)) throw new Error('Room not found.')
    if (room.hostId !== user._id) {
      throw new Error('Only the host can remove players.')
    }

    const player = await ctx.db.get(args.playerId)
    if (!player || player.roomId !== room._id || player.leftAt) {
      throw new Error('This player is no longer in the room.')
    }
    if (player.userId === room.hostId) {
      throw new Error('The host cannot remove themselves.')
    }

    const now = Date.now()
    await ctx.db.patch(player._id, {
      leftAt: now,
      kickedAt: now,
      ...(room.status === 'impostor_playing' && player.impostorRole
        ? { impostorEliminatedRound: room.impostorRound ?? 1 }
        : {}),
    })
    await settlePhaseAfterPlayerRemoval(ctx, room)
  },
})

export const getRoom = query({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx)
    const room = await ctx.db
      .query('rooms')
      .withIndex('by_code', (q) => q.eq('code', args.code.trim().toUpperCase()))
      .unique()
    if (!room) return null
    const roomIsActive = isRoomActive(room)
    const status = roomIsActive ? room.status : ('finished' as const)

    const currentPlayer = await ctx.db
      .query('players')
      .withIndex('by_room_and_user', (q) =>
        q.eq('roomId', room._id).eq('userId', user._id),
      )
      .unique()
    if (!currentPlayer) {
      throw new Error('You are not a player in this room.')
    }
    if (currentPlayer.leftAt && roomIsActive) {
      return {
        code: room.code,
        unavailableReason: currentPlayer.kickedAt
          ? ('removed' as const)
          : ('left' as const),
      }
    }

    const allPlayers = await ctx.db
      .query('players')
      .withIndex('by_room', (q) => q.eq('roomId', room._id))
      .collect()
    const players = roomIsActive
      ? allPlayers.filter((player) => !player.leftAt)
      : allPlayers

    const gameType: GameType = room.gameType ?? 'truth_or_lie'
    const hideIdentities = status === 'voting' && gameType === 'truth_or_lie'
    const orderedPlayers = hideIdentities
      ? [...players].sort(
          (a, b) =>
            (a.statementOrder ?? Number.MAX_SAFE_INTEGER) -
              (b.statementOrder ?? Number.MAX_SAFE_INTEGER) ||
            a._id.localeCompare(b._id),
        )
      : players
    const revealNames =
      gameType === 'celebrity' ||
      gameType === 'impostor' ||
      status === 'waiting' ||
      status === 'results' ||
      status === 'finished'

    const profiles = []
    for (const player of orderedPlayers) {
      const profile = await ctx.db.get(player.userId)
      profiles.push(profile)
    }
    const displayNames = revealNames
      ? resolveDisplayNames(
          profiles.map((profile) => profile?.name ?? 'Player'),
        )
      : []
    const adminDisplayNames =
      room.hostId === user._id
        ? resolveDisplayNames(
            profiles.map((profile) => profile?.name ?? 'Player'),
          )
        : []
    const displayNameByPlayerId = new Map(
      orderedPlayers.map((player, index) => [
        player._id,
        revealNames
          ? displayNames[index]
          : room.hostId === user._id
            ? adminDisplayNames[index]
            : 'Player',
      ]),
    )

    const impostorRound = room.impostorRound ?? 1
    const currentImpostorVotes =
      gameType === 'impostor' && status === 'impostor_playing'
        ? await ctx.db
            .query('impostorVotes')
            .withIndex('by_room_and_round', (q) =>
              q.eq('roomId', room._id).eq('round', impostorRound),
            )
            .collect()
        : []
    const lastImpostorVotes =
      gameType === 'impostor' && room.impostorLastVoteRound !== undefined
        ? await ctx.db
            .query('impostorVotes')
            .withIndex('by_room_and_round', (q) =>
              q.eq('roomId', room._id).eq('round', room.impostorLastVoteRound!),
            )
            .collect()
        : []

    const celebrityPlayersById = new Map(
      allPlayers.map((player) => [player._id, player]),
    )
    const activeCelebrityPlayer =
      status === 'celebrity_guessing'
        ? players.find(
            (player) =>
              player.celebrityTurnOrder === (room.celebrityTurnIndex ?? 0),
          )
        : undefined
    const visiblePlayers = []
    for (const [index, player] of orderedPlayers.entries()) {
      const profile = profiles[index]
      const celebrityTarget = player.celebrityTargetPlayerId
        ? celebrityPlayersById.get(player.celebrityTargetPlayerId)
        : undefined
      const canSeeCelebrityTarget =
        status === 'results' ||
        status === 'finished' ||
        (status === 'celebrity_guessing' &&
          activeCelebrityPlayer?._id === player._id &&
          currentPlayer._id !== player._id)
      const targetImageUrl = celebrityTarget?.celebrityImageStorageId
        ? await ctx.storage.getUrl(celebrityTarget.celebrityImageStorageId)
        : celebrityTarget?.celebrityImageUrl
      visiblePlayers.push({
        id: player._id,
        ...(revealNames
          ? { name: displayNames[index], avatar: profile?.avatar }
          : {}),
        ...(room.hostId === user._id
          ? { adminName: adminDisplayNames[index] }
          : {}),
        isHost: player.userId === room.hostId,
        isCurrent: player._id === currentPlayer._id,
        hasSubmitted: player.hasSubmitted,
        hasVoted: player.hasVoted,
        isPlaying:
          gameType === 'celebrity'
            ? !(player.joinedForNextRound ?? false)
            : gameType === 'impostor'
              ? player.impostorRole !== undefined &&
                player.impostorEliminatedRound === undefined
              : player.role !== undefined,
        joinedForNextRound: player.joinedForNextRound ?? false,
        statement:
          status === 'waiting' || status === 'writing'
            ? undefined
            : player.statement,
        role:
          status === 'results' || status === 'finished'
            ? player.role
            : player._id === currentPlayer._id && status === 'writing'
              ? player.role
              : undefined,
        score: player.score,
        celebrityName:
          player._id === currentPlayer._id || status === 'results'
            ? player.celebrityName
            : undefined,
        celebrityImageUrl:
          player._id === currentPlayer._id || status === 'results'
            ? player.celebrityImageStorageId
              ? await ctx.storage.getUrl(player.celebrityImageStorageId)
              : player.celebrityImageUrl
            : undefined,
        celebrityTurnOrder: player.celebrityTurnOrder,
        celebrityWasGuessed: player.celebrityWasGuessed,
        impostorRole:
          gameType === 'impostor' &&
          (status === 'results' ||
            status === 'finished' ||
            player.impostorEliminatedRound !== undefined)
            ? player.impostorRole
            : undefined,
        impostorEliminatedRound: player.impostorEliminatedRound,
        celebrityTarget: canSeeCelebrityTarget
          ? {
              name: celebrityTarget?.celebrityName,
              imageUrl: targetImageUrl ?? undefined,
              wasGuessed: celebrityTarget?.celebrityWasGuessed,
            }
          : undefined,
      })
    }

    const impostorLastResult =
      gameType === 'impostor' && room.impostorLastVoteRound !== undefined
        ? {
            round: room.impostorLastVoteRound,
            eliminated: (room.impostorLastEliminatedPlayerIds ?? []).map(
              (playerId) => {
                const player = allPlayers.find((item) => item._id === playerId)
                return {
                  id: playerId,
                  name: displayNameByPlayerId.get(playerId) ?? 'Player',
                  wasImpostor: player?.impostorRole === 'impostor',
                }
              },
            ),
            voteCounts: players
              .filter(
                (player) =>
                  player.impostorRole !== undefined &&
                  (player.impostorEliminatedRound === undefined ||
                    player.impostorEliminatedRound >=
                      room.impostorLastVoteRound!),
              )
              .map((player) => ({
                playerId: player._id,
                name: displayNameByPlayerId.get(player._id) ?? 'Player',
                count: lastImpostorVotes.filter(
                  (vote) => vote.targetPlayerId === player._id,
                ).length,
              }))
              .sort(
                (a, b) => b.count - a.count || a.name.localeCompare(b.name),
              ),
            ballots:
              (room.impostorVotingVisibility ??
                DEFAULT_IMPOSTOR_VOTING_VISIBILITY) === 'revealed'
                ? lastImpostorVotes.map((vote) => ({
                    voterName:
                      displayNameByPlayerId.get(vote.voterId) ?? 'Player',
                    targetName:
                      displayNameByPlayerId.get(vote.targetPlayerId) ??
                      'Player',
                  }))
                : undefined,
          }
        : undefined

    return {
      id: room._id,
      code: room.code,
      status,
      gameType,
      gameTypeLocked: room.gameType !== undefined,
      maxPlayers: room.maxPlayers,
      liarCount: room.liarCount ?? DEFAULT_LIAR_COUNT,
      writingDurationSeconds:
        room.writingDurationSeconds ?? DEFAULT_WRITING_SECONDS,
      discussionVotingDurationSeconds:
        room.discussionVotingDurationSeconds ??
        DEFAULT_DISCUSSION_VOTING_SECONDS,
      phaseEndsAt: room.phaseEndsAt,
      endedAt:
        room.endedAt ??
        (roomIsActive
          ? undefined
          : (room.expiresAt ?? room.createdAt + ROOM_INACTIVITY_MS)),
      isHost: room.hostId === user._id,
      currentPlayerId: currentPlayer._id,
      celebrityTurnIndex: room.celebrityTurnIndex ?? 0,
      activeCelebrityPlayerId: activeCelebrityPlayer?._id,
      impostorCount: room.impostorCount ?? DEFAULT_IMPOSTOR_COUNT,
      impostorVotingVisibility:
        room.impostorVotingVisibility ?? DEFAULT_IMPOSTOR_VOTING_VISIBILITY,
      impostorTieRule: room.impostorTieRule ?? DEFAULT_IMPOSTOR_TIE_RULE,
      impostorRound,
      impostorWord:
        gameType === 'impostor' && currentPlayer.impostorRole
          ? currentPlayer.impostorRole === 'impostor'
            ? room.impostorDifferentWord
            : room.impostorCommonWord
          : undefined,
      impostorCommonWord:
        gameType === 'impostor' &&
        (status === 'results' || status === 'finished')
          ? room.impostorCommonWord
          : undefined,
      impostorDifferentWord:
        gameType === 'impostor' &&
        (status === 'results' || status === 'finished')
          ? room.impostorDifferentWord
          : undefined,
      impostorVotesCast: currentImpostorVotes.length,
      impostorEligibleVoters: players.filter(
        (player) =>
          player.impostorRole !== undefined &&
          player.impostorEliminatedRound === undefined,
      ).length,
      impostorCurrentPlayerHasVoted: currentImpostorVotes.some(
        (vote) => vote.voterId === currentPlayer._id,
      ),
      impostorLastResult,
      players: visiblePlayers,
    }
  },
})

export const startGame = mutation({
  args: {
    roomId: v.id('rooms'),
    gameType: v.union(
      v.literal('truth_or_lie'),
      v.literal('celebrity'),
      v.literal('impostor'),
    ),
    liarCount: v.optional(v.number()),
    writingDurationSeconds: v.optional(v.number()),
    discussionVotingDurationSeconds: v.optional(v.number()),
    impostorCount: v.optional(v.number()),
    impostorVotingVisibility: v.optional(
      v.union(v.literal('anonymous'), v.literal('revealed')),
    ),
    impostorTieRule: v.optional(
      v.union(v.literal('eliminate_all'), v.literal('eliminate_none')),
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx)
    const room = await ctx.db.get(args.roomId)
    if (!room) throw new Error('Room not found.')
    if (room.hostId !== user._id)
      throw new Error('Only the host can start the game.')
    if (room.status !== 'waiting')
      throw new Error('The game has already started.')

    const players = await getActivePlayers(ctx, room._id)
    if (players.length < 3) throw new Error('At least 3 players are required.')
    if (args.gameType === 'impostor') {
      const impostorCount = args.impostorCount ?? room.impostorCount ?? 1
      if (
        !Number.isInteger(impostorCount) ||
        impostorCount < 1 ||
        impostorCount >= players.length
      ) {
        throw new Error(
          `Choose between 1 and ${players.length - 1} impostors for this game.`,
        )
      }
      const roles = assignImpostorRoles(players.length, impostorCount)
      const words = chooseImpostorWords(
        IMPOSTOR_WORD_PAIRS,
        room.impostorWordPairId,
      )
      await deleteImpostorVotes(ctx, room._id)
      for (const [index, player] of players.entries()) {
        await ctx.db.patch(player._id, {
          role: undefined,
          statement: undefined,
          statementOrder: undefined,
          hasSubmitted: false,
          hasVoted: false,
          joinedForNextRound: false,
          celebrityName: undefined,
          celebrityImageUrl: undefined,
          celebrityImageStorageId: undefined,
          celebrityTargetPlayerId: undefined,
          celebrityTurnOrder: undefined,
          celebrityWasGuessed: undefined,
          impostorRole: roles[index],
          impostorEliminatedRound: undefined,
        })
      }
      const now = Date.now()
      await ctx.db.patch(room._id, {
        gameType: 'impostor',
        status: 'impostor_playing',
        startedAt: now,
        phaseEndsAt: undefined,
        celebrityTurnIndex: undefined,
        impostorCount,
        impostorVotingVisibility:
          args.impostorVotingVisibility ??
          room.impostorVotingVisibility ??
          DEFAULT_IMPOSTOR_VOTING_VISIBILITY,
        impostorTieRule:
          args.impostorTieRule ??
          room.impostorTieRule ??
          DEFAULT_IMPOSTOR_TIE_RULE,
        impostorRound: 1,
        impostorWordPairId: words.pairId,
        impostorCommonWord: words.commonWord,
        impostorDifferentWord: words.impostorWord,
        impostorLastVoteRound: undefined,
        impostorLastEliminatedPlayerIds: undefined,
        ...roomActivity(now),
      })
      return
    }
    if (args.gameType === 'celebrity') {
      for (const player of players) {
        await ctx.db.patch(player._id, {
          role: undefined,
          statement: undefined,
          hasSubmitted: false,
          hasVoted: false,
          joinedForNextRound: false,
          celebrityName: undefined,
          celebrityImageUrl: undefined,
          celebrityImageStorageId: undefined,
          celebrityTargetPlayerId: undefined,
          celebrityTurnOrder: undefined,
          celebrityWasGuessed: undefined,
          impostorRole: undefined,
          impostorEliminatedRound: undefined,
        })
      }
      await ctx.db.patch(room._id, {
        gameType: 'celebrity',
        status: 'celebrity_submitting',
        startedAt: Date.now(),
        phaseEndsAt: undefined,
        celebrityTurnIndex: 0,
        impostorRound: undefined,
        impostorLastVoteRound: undefined,
        impostorLastEliminatedPlayerIds: undefined,
        ...roomActivity(),
      })
      return
    }

    const liarCount = args.liarCount ?? DEFAULT_LIAR_COUNT
    const writingDurationSeconds =
      args.writingDurationSeconds ?? DEFAULT_WRITING_SECONDS
    const discussionVotingDurationSeconds =
      args.discussionVotingDurationSeconds ?? DEFAULT_DISCUSSION_VOTING_SECONDS
    if (
      !Number.isInteger(liarCount) ||
      liarCount < 1 ||
      liarCount >= players.length
    ) {
      throw new Error(
        `Choose between 1 and ${players.length - 1} liars for this round.`,
      )
    }
    validateDurations(writingDurationSeconds, discussionVotingDurationSeconds)

    const roles = assignRoles(players.length, liarCount)
    const statementOrders = shuffledIndexes(players.length)
    for (const [index, player] of players.entries()) {
      await ctx.db.patch(player._id, {
        role: roles[index],
        statementOrder: statementOrders[index],
        statement: undefined,
        hasSubmitted: false,
        hasVoted: false,
        joinedForNextRound: false,
        celebrityName: undefined,
        celebrityImageUrl: undefined,
        celebrityImageStorageId: undefined,
        celebrityTargetPlayerId: undefined,
        celebrityTurnOrder: undefined,
        celebrityWasGuessed: undefined,
        impostorRole: undefined,
        impostorEliminatedRound: undefined,
      })
    }
    const now = Date.now()
    await ctx.db.patch(room._id, {
      status: 'writing',
      gameType: 'truth_or_lie',
      liarCount,
      writingDurationSeconds,
      discussionVotingDurationSeconds,
      startedAt: now,
      phaseEndsAt: now + writingDurationSeconds * 1_000,
      celebrityTurnIndex: undefined,
      impostorRound: undefined,
      impostorLastVoteRound: undefined,
      impostorLastEliminatedPlayerIds: undefined,
      ...roomActivity(now),
    })
  },
})

export const submitStatement = mutation({
  args: { roomId: v.id('rooms'), statement: v.string() },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId)
    if (!room || room.status !== 'writing')
      throw new Error('Writing has ended.')
    const { player } = await requirePlayer(ctx, args.roomId)
    if (!player.role) throw new Error('You will join the next round.')
    const statement = args.statement.trim()
    if (statement.length < 3 || statement.length > 240) {
      throw new Error('Your statement must be between 3 and 240 characters.')
    }
    await ctx.db.patch(player._id, {
      statement,
      hasSubmitted: true,
    })
    await ctx.db.patch(room._id, roomActivity())

    const players = await getActivePlayers(ctx, room._id)
    if (
      players
        .filter((item) => item.role !== undefined)
        .every((item) => item._id === player._id || item.hasSubmitted)
    ) {
      await finishWriting(ctx, room, players)
    }
  },
})

export const generateCelebrityUploadUrl = mutation({
  args: { roomId: v.id('rooms') },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId)
    if (!room || room.status !== 'celebrity_submitting') {
      throw new Error('Celebrity selection has ended.')
    }
    const { player } = await requirePlayer(ctx, args.roomId)
    if (player.joinedForNextRound)
      throw new Error('You will join the next round.')
    await ctx.db.patch(room._id, roomActivity())
    return await ctx.storage.generateUploadUrl()
  },
})

export const submitCelebrity = mutation({
  args: {
    roomId: v.id('rooms'),
    name: v.string(),
    imageUrl: v.optional(v.string()),
    imageStorageId: v.optional(v.id('_storage')),
  },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId)
    if (!room || room.status !== 'celebrity_submitting') {
      throw new Error('Celebrity selection has ended.')
    }
    const { player } = await requirePlayer(ctx, args.roomId)
    if (player.joinedForNextRound)
      throw new Error('You will join the next round.')

    const name = args.name.trim()
    if (name.length < 2 || name.length > 80) {
      throw new Error('Celebrity name must be between 2 and 80 characters.')
    }
    if (args.imageUrl && !/^https:\/\//i.test(args.imageUrl)) {
      throw new Error('Celebrity image must use a secure URL.')
    }

    await ctx.db.patch(player._id, {
      celebrityName: name,
      celebrityImageUrl: args.imageStorageId ? undefined : args.imageUrl,
      celebrityImageStorageId: args.imageStorageId,
      hasSubmitted: true,
    })
    await ctx.db.patch(room._id, roomActivity())

    const players = await getActivePlayers(ctx, room._id)
    const activePlayers = players.filter((item) => !item.joinedForNextRound)
    if (
      !activePlayers.every(
        (item) => item._id === player._id || item.hasSubmitted,
      )
    ) {
      return
    }

    await startCelebrityGuessing(ctx, room, activePlayers)
  },
})

export const advanceCelebrityTurn = mutation({
  args: { roomId: v.id('rooms'), guessed: v.boolean() },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx)
    const room = await ctx.db.get(args.roomId)
    if (!room || room.status !== 'celebrity_guessing') {
      throw new Error('There is no celebrity turn to advance.')
    }
    const players = await getActivePlayers(ctx, room._id)
    const active = players.find(
      (player) => player.celebrityTurnOrder === (room.celebrityTurnIndex ?? 0),
    )
    if (!active) throw new Error('Active player not found.')
    if (room.hostId !== user._id && active.userId !== user._id) {
      throw new Error('Only the host or current player can end this turn.')
    }

    const target = active.celebrityTargetPlayerId
      ? await ctx.db.get(active.celebrityTargetPlayerId)
      : null
    if (target) {
      await ctx.db.patch(target._id, { celebrityWasGuessed: args.guessed })
    }
    if (args.guessed) {
      await ctx.db.patch(active._id, { score: active.score + 10 })
    }

    const nextTurn = nextTurnOrder(
      players.map((player) => player.celebrityTurnOrder),
      room.celebrityTurnIndex ?? 0,
    )
    if (nextTurn === undefined) {
      await ctx.db.patch(room._id, {
        status: 'results',
        celebrityTurnIndex: undefined,
        ...roomActivity(),
      })
    } else {
      await ctx.db.patch(room._id, {
        celebrityTurnIndex: nextTurn,
        ...roomActivity(),
      })
    }
  },
})

export const restartRound = mutation({
  args: { roomId: v.id('rooms') },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx)
    const room = await ctx.db.get(args.roomId)
    if (!room) throw new Error('Room not found.')
    if (room.hostId !== user._id)
      throw new Error('Only the host can start another round.')
    if (room.status !== 'results' || room.endedAt) {
      throw new Error('The current round has not finished.')
    }

    const players = await getActivePlayers(ctx, room._id)
    if (players.length < 3) throw new Error('At least 3 players are required.')

    const votes = await ctx.db
      .query('votes')
      .withIndex('by_room', (q) => q.eq('roomId', room._id))
      .collect()
    for (const vote of votes) await ctx.db.delete(vote._id)

    if ((room.gameType ?? 'truth_or_lie') === 'impostor') {
      const impostorCount = Math.min(
        room.impostorCount ?? DEFAULT_IMPOSTOR_COUNT,
        players.length - 1,
      )
      const roles = assignImpostorRoles(players.length, impostorCount)
      const words = chooseImpostorWords(
        IMPOSTOR_WORD_PAIRS,
        room.impostorWordPairId,
      )
      await deleteImpostorVotes(ctx, room._id)
      for (const [index, player] of players.entries()) {
        await ctx.db.patch(player._id, {
          role: undefined,
          statement: undefined,
          statementOrder: undefined,
          hasSubmitted: false,
          hasVoted: false,
          joinedForNextRound: false,
          celebrityName: undefined,
          celebrityImageUrl: undefined,
          celebrityImageStorageId: undefined,
          celebrityTargetPlayerId: undefined,
          celebrityTurnOrder: undefined,
          celebrityWasGuessed: undefined,
          impostorRole: roles[index],
          impostorEliminatedRound: undefined,
        })
      }
      const now = Date.now()
      await ctx.db.patch(room._id, {
        status: 'impostor_playing',
        startedAt: now,
        phaseEndsAt: undefined,
        celebrityTurnIndex: undefined,
        impostorCount,
        impostorRound: 1,
        impostorWordPairId: words.pairId,
        impostorCommonWord: words.commonWord,
        impostorDifferentWord: words.impostorWord,
        impostorLastVoteRound: undefined,
        impostorLastEliminatedPlayerIds: undefined,
        ...roomActivity(now),
      })
      return
    }

    if ((room.gameType ?? 'truth_or_lie') === 'celebrity') {
      for (const player of players) {
        await ctx.db.patch(player._id, {
          role: undefined,
          statement: undefined,
          hasSubmitted: false,
          hasVoted: false,
          joinedForNextRound: false,
          celebrityName: undefined,
          celebrityImageUrl: undefined,
          celebrityImageStorageId: undefined,
          celebrityTargetPlayerId: undefined,
          celebrityTurnOrder: undefined,
          celebrityWasGuessed: undefined,
          impostorRole: undefined,
          impostorEliminatedRound: undefined,
        })
      }
      await ctx.db.patch(room._id, {
        status: 'celebrity_submitting',
        startedAt: Date.now(),
        phaseEndsAt: undefined,
        celebrityTurnIndex: 0,
        ...roomActivity(),
      })
      return
    }

    const roles = assignRoles(
      players.length,
      Math.min(room.liarCount ?? DEFAULT_LIAR_COUNT, players.length - 1),
    )
    const statementOrders = shuffledIndexes(players.length)
    for (const [index, player] of players.entries()) {
      await ctx.db.patch(player._id, {
        role: roles[index],
        statementOrder: statementOrders[index],
        statement: undefined,
        hasSubmitted: false,
        hasVoted: false,
        joinedForNextRound: false,
        impostorRole: undefined,
        impostorEliminatedRound: undefined,
      })
    }

    const now = Date.now()
    await ctx.db.patch(room._id, {
      status: 'writing',
      startedAt: now,
      phaseEndsAt: now + durationMs(room, 'writingDurationSeconds'),
      ...roomActivity(now),
    })
  },
})

export const returnToLobby = mutation({
  args: { roomId: v.id('rooms') },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx)
    const room = await ctx.db.get(args.roomId)
    if (!room) throw new Error('Room not found.')
    if (room.hostId !== user._id) {
      throw new Error('Only the host can return to the game shelf.')
    }
    if (room.status !== 'results' || room.endedAt) {
      throw new Error('Finish the current round first.')
    }

    const votes = await ctx.db
      .query('votes')
      .withIndex('by_room', (q) => q.eq('roomId', room._id))
      .collect()
    for (const vote of votes) await ctx.db.delete(vote._id)
    await deleteImpostorVotes(ctx, room._id)

    const players = await getActivePlayers(ctx, room._id)
    for (const player of players) {
      await ctx.db.patch(player._id, {
        role: undefined,
        statement: undefined,
        hasSubmitted: false,
        hasVoted: false,
        joinedForNextRound: false,
        celebrityName: undefined,
        celebrityImageUrl: undefined,
        celebrityImageStorageId: undefined,
        celebrityTargetPlayerId: undefined,
        celebrityTurnOrder: undefined,
        celebrityWasGuessed: undefined,
        impostorRole: undefined,
        impostorEliminatedRound: undefined,
      })
    }
    await ctx.db.patch(room._id, {
      status: 'waiting',
      gameType: undefined,
      startedAt: undefined,
      phaseEndsAt: undefined,
      celebrityTurnIndex: undefined,
      impostorRound: undefined,
      impostorWordPairId: undefined,
      impostorCommonWord: undefined,
      impostorDifferentWord: undefined,
      impostorLastVoteRound: undefined,
      impostorLastEliminatedPlayerIds: undefined,
      ...roomActivity(),
    })
  },
})

export const updateRoomSettings = mutation({
  args: {
    roomId: v.id('rooms'),
    maxPlayers: v.number(),
    writingDurationSeconds: v.number(),
    discussionVotingDurationSeconds: v.number(),
    liarCount: v.optional(v.number()),
    impostorCount: v.optional(v.number()),
    impostorVotingVisibility: v.optional(
      v.union(v.literal('anonymous'), v.literal('revealed')),
    ),
    impostorTieRule: v.optional(
      v.union(v.literal('eliminate_all'), v.literal('eliminate_none')),
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx)
    const room = await ctx.db.get(args.roomId)
    if (!room) throw new Error('Room not found.')
    if (room.hostId !== user._id)
      throw new Error('Only the host can change room settings.')
    if (room.status !== 'waiting' && room.status !== 'results') {
      throw new Error('Settings can only be changed between games.')
    }

    const players = await getActivePlayers(ctx, room._id)
    if (
      !Number.isInteger(args.maxPlayers) ||
      args.maxPlayers < Math.max(3, players.length) ||
      args.maxPlayers > 20
    ) {
      throw new Error(
        `Room size must be between ${Math.max(3, players.length)} and 20 players.`,
      )
    }

    validateDurations(
      args.writingDurationSeconds,
      args.discussionVotingDurationSeconds,
    )
    const liarCount = args.liarCount ?? room.liarCount ?? DEFAULT_LIAR_COUNT
    if (
      !Number.isInteger(liarCount) ||
      liarCount < 1 ||
      (players.length >= 3 && liarCount >= players.length)
    ) {
      throw new Error(`Choose between 1 and ${players.length - 1} liars.`)
    }
    const impostorCount =
      args.impostorCount ?? room.impostorCount ?? DEFAULT_IMPOSTOR_COUNT
    if (
      !Number.isInteger(impostorCount) ||
      impostorCount < 1 ||
      (players.length >= 3 && impostorCount >= players.length)
    ) {
      throw new Error(`Choose between 1 and ${players.length - 1} impostors.`)
    }

    await ctx.db.patch(room._id, {
      maxPlayers: args.maxPlayers,
      liarCount,
      writingDurationSeconds: args.writingDurationSeconds,
      discussionVotingDurationSeconds: args.discussionVotingDurationSeconds,
      impostorCount,
      impostorVotingVisibility:
        args.impostorVotingVisibility ??
        room.impostorVotingVisibility ??
        DEFAULT_IMPOSTOR_VOTING_VISIBILITY,
      impostorTieRule:
        args.impostorTieRule ??
        room.impostorTieRule ??
        DEFAULT_IMPOSTOR_TIE_RULE,
      ...roomActivity(),
    })
  },
})

export const endPhaseEarly = mutation({
  args: { roomId: v.id('rooms') },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx)
    const room = await ctx.db.get(args.roomId)
    if (!room) throw new Error('Room not found.')
    if (room.hostId !== user._id)
      throw new Error('Only the host can end a phase early.')

    const players = await getActivePlayers(ctx, room._id)
    if (room.status === 'writing') {
      await finishWriting(ctx, room, players)
    } else if (room.status === 'voting') {
      await finishVoting(ctx, room, players)
    } else {
      throw new Error('There is no active phase to end.')
    }
  },
})

export const addPhaseTime = mutation({
  args: { roomId: v.id('rooms') },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx)
    const room = await ctx.db.get(args.roomId)
    if (!room) throw new Error('Room not found.')
    if (room.hostId !== user._id)
      throw new Error('Only the host can extend a phase.')
    if (
      (room.status !== 'writing' && room.status !== 'voting') ||
      !room.phaseEndsAt
    ) {
      throw new Error('There is no active phase to extend.')
    }

    await ctx.db.patch(room._id, {
      phaseEndsAt: Math.max(room.phaseEndsAt, Date.now()) + PHASE_EXTENSION_MS,
      ...roomActivity(),
    })
  },
})

export const vote = mutation({
  args: { roomId: v.id('rooms'), targetPlayerId: v.id('players') },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId)
    if (!room || room.status !== 'voting') {
      throw new Error('Voting is closed.')
    }
    const { player } = await requirePlayer(ctx, args.roomId)
    if (!player.role) throw new Error('You will join the next round.')
    const target = await ctx.db.get(args.targetPlayerId)
    if (!target || target.roomId !== room._id || !target.role || target.leftAt)
      throw new Error('Invalid vote target.')

    const existing = await ctx.db
      .query('votes')
      .withIndex('by_room_and_voter', (q) =>
        q.eq('roomId', room._id).eq('voterId', player._id),
      )
      .unique()
    if (existing) throw new Error('You have already voted.')

    await ctx.db.insert('votes', {
      roomId: room._id,
      voterId: player._id,
      targetPlayerId: args.targetPlayerId,
      createdAt: Date.now(),
    })
    await ctx.db.patch(player._id, { hasVoted: true })
    await ctx.db.patch(room._id, roomActivity())

    const players = await getActivePlayers(ctx, room._id)
    if (
      players
        .filter((item) => item.role !== undefined)
        .every((item) => item._id === player._id || item.hasVoted)
    ) {
      await finishVoting(ctx, room, players)
    }
  },
})

export const voteImpostor = mutation({
  args: { roomId: v.id('rooms'), targetPlayerId: v.id('players') },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId)
    if (!room || room.status !== 'impostor_playing') {
      throw new Error('Voting is closed.')
    }
    const { player } = await requirePlayer(ctx, args.roomId)
    if (!player.impostorRole || player.impostorEliminatedRound !== undefined) {
      throw new Error('Eliminated players can only watch.')
    }
    if (player._id === args.targetPlayerId) {
      throw new Error('You cannot vote for yourself.')
    }
    const target = await ctx.db.get(args.targetPlayerId)
    if (
      !target ||
      target.roomId !== room._id ||
      target.leftAt ||
      !target.impostorRole ||
      target.impostorEliminatedRound !== undefined
    ) {
      throw new Error('That player cannot be voted for.')
    }

    const round = room.impostorRound ?? 1
    const existing = await ctx.db
      .query('impostorVotes')
      .withIndex('by_room_round_and_voter', (q) =>
        q.eq('roomId', room._id).eq('round', round).eq('voterId', player._id),
      )
      .unique()
    if (existing) throw new Error('You have already voted this round.')

    await ctx.db.insert('impostorVotes', {
      roomId: room._id,
      round,
      voterId: player._id,
      targetPlayerId: target._id,
      createdAt: Date.now(),
    })
    await ctx.db.patch(room._id, roomActivity())
    await finishImpostorVoting(ctx, room, await getActivePlayers(ctx, room._id))
  },
})

export const advancePhase = mutation({
  args: { roomId: v.id('rooms') },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId)
    if (!room) throw new Error('Room not found.')
    await requirePlayer(ctx, args.roomId)
    if (!room.phaseEndsAt || room.phaseEndsAt > Date.now()) return

    const players = await getActivePlayers(ctx, room._id)
    if (room.status === 'writing') {
      await finishWriting(ctx, room, players)
    } else if (room.status === 'voting') {
      await finishVoting(ctx, room, players)
    }
  },
})

export const expireInactiveRooms = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now()
    const rooms = await ctx.db
      .query('rooms')
      .withIndex('by_expires_at', (q) => q.lte('expiresAt', now))
      .take(100)
    for (const room of rooms) {
      if (!room.endedAt && room.status !== 'finished') {
        await endRoomDocument(ctx, room)
      }
    }
  },
})

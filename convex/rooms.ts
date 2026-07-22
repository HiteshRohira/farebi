import { v } from 'convex/values'

import type { Doc } from './_generated/dataModel'
import type { MutationCtx } from './_generated/server'
import { mutation, query } from './_generated/server'
import {
  requireCurrentUser,
  requirePlayer,
  upsertCurrentUser,
} from './lib/auth'
import {
  assignRoles,
  calculateScoreDeltas,
  resolveDisplayNames,
  shuffledIndexes,
} from './lib/game'

const DEFAULT_WRITING_SECONDS = 5 * 60
const DEFAULT_DISCUSSION_VOTING_SECONDS = 10 * 60
const MIN_PHASE_SECONDS = 0.5 * 60
const MAX_PHASE_SECONDS = 30 * 60
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function durationMs(
  room: Doc<'rooms'>,
  field: 'writingDurationSeconds' | 'discussionVotingDurationSeconds',
) {
  if (field === 'writingDurationSeconds') {
    return (room.writingDurationSeconds ?? DEFAULT_WRITING_SECONDS) * 1_000
  }

  return (
    room.discussionVotingDurationSeconds ?? DEFAULT_DISCUSSION_VOTING_SECONDS
  ) * 1_000
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
  const scoreDeltas = calculateScoreDeltas(
    activePlayers.map((player) => ({
      id: player._id,
      role: player.role!,
    })),
    votes.map((vote) => ({
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
  })
}

export const createRoom = mutation({
  args: { maxPlayers: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await upsertCurrentUser(ctx)
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

    const roomId = await ctx.db.insert('rooms', {
      code,
      hostId: userId,
      status: 'waiting',
      maxPlayers,
      writingDurationSeconds: DEFAULT_WRITING_SECONDS,
      discussionVotingDurationSeconds: DEFAULT_DISCUSSION_VOTING_SECONDS,
      createdAt: Date.now(),
    })
    await ctx.db.insert('players', {
      roomId,
      userId,
      score: 0,
      hasSubmitted: false,
      hasVoted: false,
      createdAt: Date.now(),
    })
    return { roomId, code }
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
    if (existing) return { roomId: room._id, code: room.code }

    const players = await ctx.db
      .query('players')
      .withIndex('by_room', (q) => q.eq('roomId', room._id))
      .collect()
    if (players.length >= room.maxPlayers) throw new Error('This room is full.')

    await ctx.db.insert('players', {
      roomId: room._id,
      userId,
      score: 0,
      hasSubmitted: false,
      hasVoted: false,
      joinedForNextRound: room.status !== 'waiting',
      createdAt: Date.now(),
    })
    return { roomId: room._id, code: room.code }
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

    const currentPlayer = await ctx.db
      .query('players')
      .withIndex('by_room_and_user', (q) =>
        q.eq('roomId', room._id).eq('userId', user._id),
      )
      .unique()
    if (!currentPlayer) throw new Error('You are not a player in this room.')

    const players = await ctx.db
      .query('players')
      .withIndex('by_room', (q) => q.eq('roomId', room._id))
      .collect()

    const hideIdentities =
      room.status === 'discussion' || room.status === 'voting'
    const orderedPlayers = hideIdentities
      ? [...players].sort(
          (a, b) =>
            (a.statementOrder ?? Number.MAX_SAFE_INTEGER) -
              (b.statementOrder ?? Number.MAX_SAFE_INTEGER) ||
            a._id.localeCompare(b._id),
        )
      : players
    const revealNames =
      room.status === 'waiting' ||
      room.status === 'results' ||
      room.status === 'finished'

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

    const visiblePlayers = []
    for (const [index, player] of orderedPlayers.entries()) {
      const profile = profiles[index]
      visiblePlayers.push({
        id: player._id,
        ...(revealNames
          ? { name: displayNames[index], avatar: profile?.avatar }
          : {}),
        isHost: player.userId === room.hostId,
        isCurrent: player._id === currentPlayer._id,
        hasSubmitted: player.hasSubmitted,
        hasVoted: player.hasVoted,
        isPlaying: player.role !== undefined,
        joinedForNextRound: player.joinedForNextRound ?? false,
        statement:
          room.status === 'waiting' || room.status === 'writing'
            ? undefined
            : player.statement,
        role:
          room.status === 'results' || room.status === 'finished'
            ? player.role
            : player._id === currentPlayer._id && room.status === 'writing'
              ? player.role
              : undefined,
        score: player.score,
      })
    }

    return {
      id: room._id,
      code: room.code,
      status: room.status,
      maxPlayers: room.maxPlayers,
      writingDurationSeconds:
        room.writingDurationSeconds ?? DEFAULT_WRITING_SECONDS,
      discussionVotingDurationSeconds:
        room.discussionVotingDurationSeconds ??
        DEFAULT_DISCUSSION_VOTING_SECONDS,
      phaseEndsAt: room.phaseEndsAt,
      isHost: room.hostId === user._id,
      currentPlayerId: currentPlayer._id,
      players: visiblePlayers,
    }
  },
})

export const startGame = mutation({
  args: { roomId: v.id('rooms') },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx)
    const room = await ctx.db.get(args.roomId)
    if (!room) throw new Error('Room not found.')
    if (room.hostId !== user._id)
      throw new Error('Only the host can start the game.')
    if (room.status !== 'waiting')
      throw new Error('The game has already started.')

    const players = await ctx.db
      .query('players')
      .withIndex('by_room', (q) => q.eq('roomId', room._id))
      .collect()
    if (players.length < 3) throw new Error('At least 3 players are required.')

    const roles = assignRoles(players.length)
    const statementOrders = shuffledIndexes(players.length)
    for (const [index, player] of players.entries()) {
      await ctx.db.patch(player._id, {
        role: roles[index],
        statementOrder: statementOrders[index],
        statement: undefined,
        hasSubmitted: false,
        hasVoted: false,
        joinedForNextRound: false,
      })
    }
    const now = Date.now()
    await ctx.db.patch(room._id, {
      status: 'writing',
      startedAt: now,
      phaseEndsAt: now + durationMs(room, 'writingDurationSeconds'),
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

    const players = await ctx.db
      .query('players')
      .withIndex('by_room', (q) => q.eq('roomId', room._id))
      .collect()
    if (
      players
        .filter((item) => item.role !== undefined)
        .every((item) => item._id === player._id || item.hasSubmitted)
    ) {
      await finishWriting(ctx, room, players)
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
    if (room.status !== 'results' && room.status !== 'finished') {
      throw new Error('The current round has not finished.')
    }

    const players = await ctx.db
      .query('players')
      .withIndex('by_room', (q) => q.eq('roomId', room._id))
      .collect()
    if (players.length < 3) throw new Error('At least 3 players are required.')

    const votes = await ctx.db
      .query('votes')
      .withIndex('by_room', (q) => q.eq('roomId', room._id))
      .collect()
    for (const vote of votes) await ctx.db.delete(vote._id)

    const roles = assignRoles(players.length)
    const statementOrders = shuffledIndexes(players.length)
    for (const [index, player] of players.entries()) {
      await ctx.db.patch(player._id, {
        role: roles[index],
        statementOrder: statementOrders[index],
        statement: undefined,
        hasSubmitted: false,
        hasVoted: false,
        joinedForNextRound: false,
      })
    }

    const now = Date.now()
    await ctx.db.patch(room._id, {
      status: 'writing',
      startedAt: now,
      phaseEndsAt: now + durationMs(room, 'writingDurationSeconds'),
    })
  },
})

export const updateRoomSettings = mutation({
  args: {
    roomId: v.id('rooms'),
    maxPlayers: v.number(),
    writingDurationSeconds: v.number(),
    discussionVotingDurationSeconds: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx)
    const room = await ctx.db.get(args.roomId)
    if (!room) throw new Error('Room not found.')
    if (room.hostId !== user._id)
      throw new Error('Only the host can change room settings.')
    if (room.status !== 'waiting')
      throw new Error('Settings can only be changed before the game starts.')

    const players = await ctx.db
      .query('players')
      .withIndex('by_room', (q) => q.eq('roomId', room._id))
      .collect()
    if (
      !Number.isInteger(args.maxPlayers) ||
      args.maxPlayers < Math.max(3, players.length) ||
      args.maxPlayers > 20
    ) {
      throw new Error(
        `Room size must be between ${Math.max(3, players.length)} and 20 players.`,
      )
    }

    const durations = [
      ['Writing', args.writingDurationSeconds],
      ['Discussion and voting', args.discussionVotingDurationSeconds],
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

    await ctx.db.patch(room._id, {
      maxPlayers: args.maxPlayers,
      writingDurationSeconds: args.writingDurationSeconds,
      discussionVotingDurationSeconds: args.discussionVotingDurationSeconds,
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

    const players = await ctx.db
      .query('players')
      .withIndex('by_room', (q) => q.eq('roomId', room._id))
      .collect()
    if (room.status === 'writing') {
      await finishWriting(ctx, room, players)
    } else if (room.status === 'voting') {
      await finishVoting(ctx, room, players)
    } else {
      throw new Error('There is no active phase to end.')
    }
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
    if (!target || target.roomId !== room._id || !target.role)
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

    const players = await ctx.db
      .query('players')
      .withIndex('by_room', (q) => q.eq('roomId', room._id))
      .collect()
    if (
      players
        .filter((item) => item.role !== undefined)
        .every((item) => item._id === player._id || item.hasVoted)
    ) {
      await finishVoting(ctx, room, players)
    }
  },
})

export const advancePhase = mutation({
  args: { roomId: v.id('rooms') },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId)
    if (!room) throw new Error('Room not found.')
    await requirePlayer(ctx, args.roomId)
    if (!room.phaseEndsAt || room.phaseEndsAt > Date.now()) return

    const players = await ctx.db
      .query('players')
      .withIndex('by_room', (q) => q.eq('roomId', room._id))
      .collect()
    if (room.status === 'writing') {
      await finishWriting(ctx, room, players)
    } else if (room.status === 'voting') {
      await finishVoting(ctx, room, players)
    }
  },
})

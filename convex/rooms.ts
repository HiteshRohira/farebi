import { v } from 'convex/values'

import type { Doc } from './_generated/dataModel'
import type { MutationCtx } from './_generated/server'
import { mutation, query } from './_generated/server'
import {
  requireCurrentUser,
  requireIdentity,
  requirePlayer,
  upsertCurrentUser,
} from './lib/auth'
import {
  assignRoles,
  calculateScoreDeltas,
  resolveDisplayNames,
} from './lib/game'

const WRITING_MS = 60_000
const DISCUSSION_MS = 180_000
const VOTING_MS = 60_000
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

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
  const votes = await ctx.db
    .query('votes')
    .withIndex('by_room', (q) => q.eq('roomId', room._id))
    .collect()
  const scoreDeltas = calculateScoreDeltas(
    players.map((player) => ({
      id: player._id,
      role: player.role ?? 'truth',
    })),
    votes.map((vote) => ({
      voterId: vote.voterId,
      targetPlayerId: vote.targetPlayerId,
    })),
  )

  for (const player of players) {
    await ctx.db.patch(player._id, {
      score: player.score + (scoreDeltas.get(player._id) ?? 0),
    })
  }

  await ctx.db.patch(room._id, {
    status: 'results',
    phaseEndsAt: undefined,
  })
}

export const createRoom = mutation({
  args: { maxPlayers: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await upsertCurrentUser(ctx)
    const maxPlayers = args.maxPlayers ?? 5
    if (!Number.isInteger(maxPlayers) || maxPlayers < 3 || maxPlayers > 5) {
      throw new Error('Room size must be between 3 and 5 players.')
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
    if (room.status !== 'waiting')
      throw new Error('This game has already started.')

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
      createdAt: Date.now(),
    })
    return { roomId: room._id, code: room.code }
  },
})

export const getRoom = query({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
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

    const profiles = []
    for (const player of players) {
      const profile = await ctx.db.get(player.userId)
      profiles.push(profile)
    }
    const displayNames = resolveDisplayNames(
      profiles.map((profile) => profile?.name ?? 'Player'),
    )

    const visiblePlayers = []
    for (const [index, player] of players.entries()) {
      const profile = profiles[index]
      visiblePlayers.push({
        id: player._id,
        name: displayNames[index],
        avatar: profile?.avatar,
        isHost: player.userId === room.hostId,
        isCurrent: player._id === currentPlayer._id,
        hasSubmitted: player.hasSubmitted,
        hasVoted: player.hasVoted,
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
    for (const [index, player] of players.entries()) {
      await ctx.db.patch(player._id, {
        role: roles[index],
        statement: undefined,
        hasSubmitted: false,
        hasVoted: false,
      })
    }
    const now = Date.now()
    await ctx.db.patch(room._id, {
      status: 'writing',
      startedAt: now,
      phaseEndsAt: now + WRITING_MS,
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
    if (players.every((item) => item._id === player._id || item.hasSubmitted)) {
      await ctx.db.patch(room._id, {
        status: 'discussion',
        phaseEndsAt: Date.now() + DISCUSSION_MS,
      })
    }
  },
})

export const beginVoting = mutation({
  args: { roomId: v.id('rooms') },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId)
    if (!room || room.status !== 'discussion') {
      throw new Error('The room is not in discussion.')
    }
    const { user } = await requirePlayer(ctx, args.roomId)
    if (
      user._id !== room.hostId &&
      (room.phaseEndsAt ?? Infinity) > Date.now()
    ) {
      throw new Error('Only the host can end discussion early.')
    }
    await ctx.db.patch(room._id, {
      status: 'voting',
      phaseEndsAt: Date.now() + VOTING_MS,
    })
  },
})

export const vote = mutation({
  args: { roomId: v.id('rooms'), targetPlayerId: v.id('players') },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId)
    if (!room || room.status !== 'voting') throw new Error('Voting is closed.')
    const { player } = await requirePlayer(ctx, args.roomId)
    if (player._id === args.targetPlayerId)
      throw new Error('You cannot vote for yourself.')
    const target = await ctx.db.get(args.targetPlayerId)
    if (!target || target.roomId !== room._id)
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
    if (players.every((item) => item._id === player._id || item.hasVoted)) {
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
      for (const player of players) {
        if (!player.statement) {
          await ctx.db.patch(player._id, {
            statement: 'No statement submitted.',
            hasSubmitted: true,
          })
        }
      }
      await ctx.db.patch(room._id, {
        status: 'discussion',
        phaseEndsAt: Date.now() + DISCUSSION_MS,
      })
    } else if (room.status === 'discussion') {
      await ctx.db.patch(room._id, {
        status: 'voting',
        phaseEndsAt: Date.now() + VOTING_MS,
      })
    } else if (room.status === 'voting') {
      await finishVoting(ctx, room, players)
    }
  },
})

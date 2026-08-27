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
  createCelebrityTurns,
  resolveDisplayNames,
  shuffledIndexes,
} from './lib/game'

type GameType = 'truth_or_lie' | 'celebrity'

const DEFAULT_WRITING_SECONDS = 5 * 60
const DEFAULT_DISCUSSION_VOTING_SECONDS = 10 * 60
const MIN_PHASE_SECONDS = 0.5 * 60
const MAX_PHASE_SECONDS = 30 * 60
const DEFAULT_LIAR_COUNT = 1
const PHASE_EXTENSION_MS = 30 * 1_000
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

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
      liarCount: DEFAULT_LIAR_COUNT,
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

    const gameType: GameType = room.gameType ?? 'truth_or_lie'
    const hideIdentities = room.status === 'voting'
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

    const celebrityPlayersById = new Map(
      players.map((player) => [player._id, player]),
    )
    const activeCelebrityPlayer =
      room.status === 'celebrity_guessing'
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
        room.status === 'results' ||
        room.status === 'finished' ||
        (room.status === 'celebrity_guessing' &&
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
        isHost: player.userId === room.hostId,
        isCurrent: player._id === currentPlayer._id,
        hasSubmitted: player.hasSubmitted,
        hasVoted: player.hasVoted,
        isPlaying:
          gameType === 'celebrity'
            ? !(player.joinedForNextRound ?? false)
            : player.role !== undefined,
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
        celebrityName:
          player._id === currentPlayer._id || room.status === 'results'
            ? player.celebrityName
            : undefined,
        celebrityImageUrl:
          player._id === currentPlayer._id || room.status === 'results'
            ? player.celebrityImageStorageId
              ? await ctx.storage.getUrl(player.celebrityImageStorageId)
              : player.celebrityImageUrl
            : undefined,
        celebrityTurnOrder: player.celebrityTurnOrder,
        celebrityWasGuessed: player.celebrityWasGuessed,
        celebrityTarget: canSeeCelebrityTarget
          ? {
              name: celebrityTarget?.celebrityName,
              imageUrl: targetImageUrl ?? undefined,
              wasGuessed: celebrityTarget?.celebrityWasGuessed,
            }
          : undefined,
      })
    }

    return {
      id: room._id,
      code: room.code,
      status: room.status,
      gameType,
      maxPlayers: room.maxPlayers,
      liarCount: room.liarCount ?? DEFAULT_LIAR_COUNT,
      writingDurationSeconds:
        room.writingDurationSeconds ?? DEFAULT_WRITING_SECONDS,
      discussionVotingDurationSeconds:
        room.discussionVotingDurationSeconds ??
        DEFAULT_DISCUSSION_VOTING_SECONDS,
      phaseEndsAt: room.phaseEndsAt,
      isHost: room.hostId === user._id,
      currentPlayerId: currentPlayer._id,
      celebrityTurnIndex: room.celebrityTurnIndex ?? 0,
      activeCelebrityPlayerId: activeCelebrityPlayer?._id,
      players: visiblePlayers,
    }
  },
})

export const startGame = mutation({
  args: {
    roomId: v.id('rooms'),
    gameType: v.union(v.literal('truth_or_lie'), v.literal('celebrity')),
    liarCount: v.optional(v.number()),
    writingDurationSeconds: v.optional(v.number()),
    discussionVotingDurationSeconds: v.optional(v.number()),
  },
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
        })
      }
      await ctx.db.patch(room._id, {
        gameType: 'celebrity',
        status: 'celebrity_submitting',
        startedAt: Date.now(),
        phaseEndsAt: undefined,
        celebrityTurnIndex: 0,
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

    const players = await ctx.db
      .query('players')
      .withIndex('by_room', (q) => q.eq('roomId', room._id))
      .collect()
    const activePlayers = players.filter((item) => !item.joinedForNextRound)
    if (
      !activePlayers.every(
        (item) => item._id === player._id || item.hasSubmitted,
      )
    ) {
      return
    }

    const namedPlayers = []
    for (const item of activePlayers) {
      const profile = await ctx.db.get(item.userId)
      namedPlayers.push({ player: item, name: profile?.name ?? 'Player' })
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
    })
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
    const players = await ctx.db
      .query('players')
      .withIndex('by_room', (q) => q.eq('roomId', room._id))
      .collect()
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

    const nextTurn = (room.celebrityTurnIndex ?? 0) + 1
    if (
      nextTurn >=
      players.filter((item) => item.celebrityTurnOrder !== undefined).length
    ) {
      await ctx.db.patch(room._id, {
        status: 'results',
        celebrityTurnIndex: undefined,
      })
    } else {
      await ctx.db.patch(room._id, { celebrityTurnIndex: nextTurn })
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
        })
      }
      await ctx.db.patch(room._id, {
        status: 'celebrity_submitting',
        startedAt: Date.now(),
        phaseEndsAt: undefined,
        celebrityTurnIndex: 0,
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

export const returnToLobby = mutation({
  args: { roomId: v.id('rooms') },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx)
    const room = await ctx.db.get(args.roomId)
    if (!room) throw new Error('Room not found.')
    if (room.hostId !== user._id) {
      throw new Error('Only the host can return to the game shelf.')
    }
    if (room.status !== 'results' && room.status !== 'finished') {
      throw new Error('Finish the current round first.')
    }

    const votes = await ctx.db
      .query('votes')
      .withIndex('by_room', (q) => q.eq('roomId', room._id))
      .collect()
    for (const vote of votes) await ctx.db.delete(vote._id)

    const players = await ctx.db
      .query('players')
      .withIndex('by_room', (q) => q.eq('roomId', room._id))
      .collect()
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
      })
    }
    await ctx.db.patch(room._id, {
      status: 'waiting',
      gameType: undefined,
      startedAt: undefined,
      phaseEndsAt: undefined,
      celebrityTurnIndex: undefined,
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

    validateDurations(
      args.writingDurationSeconds,
      args.discussionVotingDurationSeconds,
    )

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

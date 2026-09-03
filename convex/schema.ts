import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

export const roomStatus = v.union(
  v.literal('waiting'),
  v.literal('writing'),
  v.literal('voting'),
  v.literal('celebrity_submitting'),
  v.literal('celebrity_guessing'),
  v.literal('impostor_playing'),
  v.literal('results'),
  v.literal('finished'),
)

export const gameType = v.union(
  v.literal('truth_or_lie'),
  v.literal('celebrity'),
  v.literal('impostor'),
)

export default defineSchema({
  users: defineTable({
    betterAuthUserId: v.optional(v.string()),
    email: v.optional(v.string()),
    // Kept optional while existing Shoo-era user documents are migrated.
    tokenIdentifier: v.optional(v.string()),
    shooUserId: v.optional(v.string()),
    name: v.string(),
    avatar: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index('by_better_auth_id', ['betterAuthUserId'])
    .index('by_token', ['tokenIdentifier'])
    .index('by_shoo_id', ['shooUserId']),

  rooms: defineTable({
    code: v.string(),
    hostId: v.id('users'),
    status: roomStatus,
    gameType: v.optional(gameType),
    maxPlayers: v.number(),
    liarCount: v.optional(v.number()),
    writingDurationSeconds: v.optional(v.number()),
    discussionVotingDurationSeconds: v.optional(v.number()),
    // Legacy fields retained so rooms created before the combined timer remain valid.
    discussionDurationSeconds: v.optional(v.number()),
    votingDurationSeconds: v.optional(v.number()),
    createdAt: v.number(),
    startedAt: v.optional(v.number()),
    phaseEndsAt: v.optional(v.number()),
    celebrityTurnIndex: v.optional(v.number()),
    impostorCount: v.optional(v.number()),
    impostorVotingVisibility: v.optional(
      v.union(v.literal('anonymous'), v.literal('revealed')),
    ),
    impostorTieRule: v.optional(
      v.union(v.literal('eliminate_all'), v.literal('eliminate_none')),
    ),
    impostorRound: v.optional(v.number()),
    impostorWordPairId: v.optional(v.string()),
    impostorCommonWord: v.optional(v.string()),
    impostorDifferentWord: v.optional(v.string()),
    impostorLastVoteRound: v.optional(v.number()),
    impostorLastEliminatedPlayerIds: v.optional(v.array(v.id('players'))),
    lastActivityAt: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
    endedAt: v.optional(v.number()),
  })
    .index('by_code', ['code'])
    .index('by_expires_at', ['expiresAt']),

  players: defineTable({
    roomId: v.id('rooms'),
    userId: v.id('users'),
    role: v.optional(v.union(v.literal('truth'), v.literal('lie'))),
    statement: v.optional(v.string()),
    score: v.number(),
    hasSubmitted: v.boolean(),
    hasVoted: v.boolean(),
    statementOrder: v.optional(v.number()),
    joinedForNextRound: v.optional(v.boolean()),
    celebrityName: v.optional(v.string()),
    celebrityImageUrl: v.optional(v.string()),
    celebrityImageStorageId: v.optional(v.id('_storage')),
    celebrityTargetPlayerId: v.optional(v.id('players')),
    celebrityTurnOrder: v.optional(v.number()),
    celebrityWasGuessed: v.optional(v.boolean()),
    impostorRole: v.optional(
      v.union(v.literal('player'), v.literal('impostor')),
    ),
    impostorEliminatedRound: v.optional(v.number()),
    leftAt: v.optional(v.number()),
    kickedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index('by_room', ['roomId'])
    .index('by_room_and_user', ['roomId', 'userId'])
    .index('by_user', ['userId']),

  votes: defineTable({
    roomId: v.id('rooms'),
    voterId: v.id('players'),
    targetPlayerId: v.id('players'),
    createdAt: v.number(),
  })
    .index('by_room', ['roomId'])
    .index('by_room_and_voter', ['roomId', 'voterId']),

  impostorVotes: defineTable({
    roomId: v.id('rooms'),
    round: v.number(),
    voterId: v.id('players'),
    targetPlayerId: v.id('players'),
    createdAt: v.number(),
  })
    .index('by_room', ['roomId'])
    .index('by_room_and_round', ['roomId', 'round'])
    .index('by_room_round_and_voter', ['roomId', 'round', 'voterId']),
})

import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

export const roomStatus = v.union(
  v.literal('waiting'),
  v.literal('writing'),
  v.literal('voting'),
  v.literal('results'),
  v.literal('finished'),
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
    maxPlayers: v.number(),
    liarCount: v.optional(v.number()),
    writingDurationSeconds: v.optional(v.number()),
    discussionVotingDurationSeconds: v.optional(v.number()),
    createdAt: v.number(),
    startedAt: v.optional(v.number()),
    phaseEndsAt: v.optional(v.number()),
  }).index('by_code', ['code']),

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
})

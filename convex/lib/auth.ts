import type { Id } from '../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../_generated/server'

type AuthCtx = Pick<QueryCtx | MutationCtx, 'auth' | 'db'>

export async function requireIdentity(ctx: AuthCtx) {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) throw new Error('You must be signed in.')
  return identity
}

export async function getCurrentUser(ctx: AuthCtx) {
  const identity = await requireIdentity(ctx)
  return await ctx.db
    .query('users')
    .withIndex('by_token', (q) =>
      q.eq('tokenIdentifier', identity.tokenIdentifier),
    )
    .unique()
}

export async function requireCurrentUser(ctx: AuthCtx) {
  const user = await getCurrentUser(ctx)
  if (!user) throw new Error('Your player profile has not been created yet.')
  return user
}

export async function upsertCurrentUser(ctx: MutationCtx) {
  const identity = await requireIdentity(ctx)
  const existing = await ctx.db
    .query('users')
    .withIndex('by_token', (q) =>
      q.eq('tokenIdentifier', identity.tokenIdentifier),
    )
    .unique()

  const name =
    identity.name?.trim() || identity.email?.split('@')[0] || 'Player'
  const avatar = identity.pictureUrl

  if (existing) {
    await ctx.db.patch(existing._id, { name, avatar })
    return existing._id
  }

  return await ctx.db.insert('users', {
    tokenIdentifier: identity.tokenIdentifier,
    shooUserId: identity.subject,
    name,
    avatar,
    createdAt: Date.now(),
  })
}

export async function requirePlayer(ctx: AuthCtx, roomId: Id<'rooms'>) {
  const user = await requireCurrentUser(ctx)
  const player = await ctx.db
    .query('players')
    .withIndex('by_room_and_user', (q) =>
      q.eq('roomId', roomId).eq('userId', user._id),
    )
    .unique()
  if (!player) throw new Error('You are not a player in this room.')
  return { user, player }
}

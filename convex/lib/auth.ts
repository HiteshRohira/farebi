import type { Id } from '../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../_generated/server'
import { authComponent } from '../auth'

type AuthCtx = QueryCtx | MutationCtx

export async function requireIdentity(ctx: AuthCtx) {
  const authUser = await authComponent.safeGetAuthUser(ctx)
  if (!authUser) throw new Error('You must be signed in.')
  return authUser
}

export async function getCurrentUser(ctx: AuthCtx) {
  const authUser = await requireIdentity(ctx)
  return await ctx.db
    .query('users')
    .withIndex('by_better_auth_id', (q) =>
      q.eq('betterAuthUserId', authUser._id),
    )
    .unique()
}

export async function requireCurrentUser(ctx: AuthCtx) {
  const user = await getCurrentUser(ctx)
  if (!user) throw new Error('Your player profile has not been created yet.')
  return user
}

export async function upsertCurrentUser(ctx: MutationCtx) {
  const authUser = await requireIdentity(ctx)
  const existing = await ctx.db
    .query('users')
    .withIndex('by_better_auth_id', (q) =>
      q.eq('betterAuthUserId', authUser._id),
    )
    .unique()

  const name = authUser.name.trim() || authUser.email.split('@')[0] || 'Player'
  const avatar = authUser.image ?? undefined

  if (existing) {
    await ctx.db.patch(existing._id, {
      name,
      email: authUser.email,
      avatar,
    })
    return existing._id
  }

  return await ctx.db.insert('users', {
    betterAuthUserId: authUser._id,
    email: authUser.email,
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
  if (!player || player.leftAt) {
    throw new Error('You are not an active player in this room.')
  }
  return { user, player }
}

import { mutation, query } from './_generated/server'
import { getCurrentUser, upsertCurrentUser } from './lib/auth'

export const me = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx)
    if (!user) return null
    return {
      id: user._id,
      name: user.name,
      avatar: user.avatar,
    }
  },
})

export const sync = mutation({
  args: {},
  handler: async (ctx) => await upsertCurrentUser(ctx),
})

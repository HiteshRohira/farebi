import type { AuthConfig } from 'convex/server'

const shooDomain = 'https://shoo.dev'
const primaryClientId = process.env.SHOO_CLIENT_ID!
const localMultiuserEnabled =
  process.env.FAREBI_ENV === 'development' &&
  process.env.ALLOW_LOCAL_MULTIUSER_TESTS === 'true'

const clientIds = new Set([primaryClientId])

if (localMultiuserEnabled) {
  clientIds.add('origin:http://localhost:3000')
  clientIds.add('origin:http://localhost:3001')
  clientIds.add('origin:http://localhost:3002')
}

export default {
  providers: Array.from(clientIds, (applicationID) => ({
    domain: shooDomain,
    applicationID,
  })),
} satisfies AuthConfig

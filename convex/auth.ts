import { createClient } from '@convex-dev/better-auth'
import type { GenericCtx } from '@convex-dev/better-auth'
import { convex, crossDomain } from '@convex-dev/better-auth/plugins'
import { betterAuth } from 'better-auth/minimal'
import { anonymous } from 'better-auth/plugins'

import { components } from './_generated/api'
import type { DataModel } from './_generated/dataModel'
import authConfig from './auth.config'

export const authComponent = createClient<DataModel>(components.betterAuth)

function trustedOrigins() {
  const siteUrl = process.env.SITE_URL
  const additionalOrigins = (process.env.TRUSTED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)

  return siteUrl ? [siteUrl, ...additionalOrigins] : additionalOrigins
}

function isLocalDevelopment() {
  const siteUrl = process.env.SITE_URL
  if (!siteUrl) return false

  try {
    const hostname = new URL(siteUrl).hostname
    return (
      hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
    )
  } catch {
    return false
  }
}

export const createAuth = (ctx: GenericCtx<DataModel>) =>
  betterAuth({
    appName: 'Farebi',
    baseURL: process.env.CONVEX_SITE_URL,
    secret: process.env.BETTER_AUTH_SECRET,
    trustedOrigins: trustedOrigins(),
    database: authComponent.adapter(ctx),
    socialProviders: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        prompt: 'select_account',
      },
    },
    plugins: [
      ...(isLocalDevelopment()
        ? [
            anonymous({
              emailDomainName: 'anonymous.farebi.app',
              generateName: (requestContext) => {
                const name = new URL(
                  requestContext.request?.url ?? 'http://localhost',
                ).searchParams
                  .get('name')
                  ?.trim()
                return name && name.length >= 2 && name.length <= 40
                  ? name
                  : 'Guest'
              },
            }),
          ]
        : []),
      crossDomain({ siteUrl: process.env.SITE_URL! }),
      convex({ authConfig }),
    ],
  })

export const { getAuthUser } = authComponent.clientApi()

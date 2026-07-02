import { useMemo } from 'react'
import type { ReactNode } from 'react'
import { ConvexBetterAuthProvider } from '@convex-dev/better-auth/react'
import type { AuthClient } from '@convex-dev/better-auth/react'
import { ConvexReactClient } from 'convex/react'

import { authClient } from '@/lib/auth-client'

const convexUrl = import.meta.env.VITE_CONVEX_URL as string | undefined
const convexSiteUrl = import.meta.env.VITE_CONVEX_SITE_URL as string | undefined

function ConvexBoundary({ children }: { children: ReactNode }) {
  const client = useMemo(
    () =>
      convexUrl && convexSiteUrl ? new ConvexReactClient(convexUrl) : null,
    [],
  )

  if (!client) return children

  return (
    <ConvexBetterAuthProvider
      client={client}
      authClient={authClient as unknown as AuthClient}
    >
      {children}
    </ConvexBetterAuthProvider>
  )
}

export function AppProvider({ children }: { children: ReactNode }) {
  return <ConvexBoundary>{children}</ConvexBoundary>
}

export const isConvexConfigured = Boolean(convexUrl && convexSiteUrl)

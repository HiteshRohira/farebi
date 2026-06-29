import { useMemo } from 'react'
import type { ReactNode } from 'react'
import { ConvexProviderWithAuth, ConvexReactClient } from 'convex/react'

import { ShooAuthProvider, useShooAuthForConvex } from '@/auth/shoo-provider'

const convexUrl = import.meta.env.VITE_CONVEX_URL as string | undefined

function ConvexBoundary({ children }: { children: ReactNode }) {
  const client = useMemo(
    () => (convexUrl ? new ConvexReactClient(convexUrl) : null),
    [],
  )

  if (!client) return children

  return (
    <ConvexProviderWithAuth client={client} useAuth={useShooAuthForConvex}>
      {children}
    </ConvexProviderWithAuth>
  )
}

export function AppProvider({ children }: { children: ReactNode }) {
  return (
    <ShooAuthProvider>
      <ConvexBoundary>{children}</ConvexBoundary>
    </ShooAuthProvider>
  )
}

export const isConvexConfigured = Boolean(convexUrl)

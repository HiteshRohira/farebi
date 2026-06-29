import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import type { ReactNode } from 'react'

import type { ShooClaims, ShooIdentity, ShooTokenResponse } from './shoo-types'

type AuthContextValue = {
  identity: ShooIdentity
  claims: ShooClaims | null
  isLoading: boolean
  isAuthenticated: boolean
  signIn: () => Promise<void>
  signOut: () => void
  finishSignIn: () => Promise<ShooTokenResponse | null>
  fetchAccessToken: (args: {
    forceRefreshToken: boolean
  }) => Promise<string | null>
}

const emptyIdentity: ShooIdentity = { userId: null }
const ShooAuthContext = createContext<AuthContextValue | null>(null)

function readIdentity() {
  return window.Shoo?.getIdentity() ?? emptyIdentity
}

export function ShooAuthProvider({ children }: { children: ReactNode }) {
  const [identity, setIdentity] = useState<ShooIdentity>(emptyIdentity)
  const [isLoading, setIsLoading] = useState(true)

  const refreshIdentity = useCallback(() => {
    setIdentity(readIdentity())
    setIsLoading(false)
  }, [])

  useEffect(() => {
    refreshIdentity()

    const onStorage = (event: StorageEvent) => {
      if (event.key === 'shoo_identity') refreshIdentity()
    }
    const onLoginRequired = () => refreshIdentity()

    window.addEventListener('storage', onStorage)
    window.addEventListener('shoo:login_required', onLoginRequired)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('shoo:login_required', onLoginRequired)
    }
  }, [refreshIdentity])

  const signIn = useCallback(async () => {
    if (!window.Shoo) {
      throw new Error('Shoo failed to load. Check your network connection.')
    }
    await window.Shoo.startSignIn({
      returnTo: window.location.pathname + window.location.search,
      requestPii: true,
    })
  }, [])

  const finishSignIn = useCallback(async () => {
    if (!window.Shoo) throw new Error('Shoo failed to load.')
    const result = await window.Shoo.handleCallback()
    refreshIdentity()
    return result
  }, [refreshIdentity])

  const signOut = useCallback(() => {
    window.Shoo?.clearIdentity()
    setIdentity(emptyIdentity)
  }, [])

  const fetchAccessToken = useCallback(
    async (_args: { forceRefreshToken: boolean }) => {
      const current = readIdentity()
      if (!current.token) return null

      const claims = window.Shoo?.decodeIdentityClaims(current.token)
      if (claims?.exp && claims.exp * 1000 <= Date.now()) {
        window.Shoo?.clearIdentity()
        setIdentity(emptyIdentity)
        return null
      }
      return current.token
    },
    [],
  )

  const claims = useMemo(
    () =>
      identity.token
        ? (window.Shoo?.decodeIdentityClaims(identity.token) ?? null)
        : null,
    [identity.token],
  )

  const value = useMemo<AuthContextValue>(
    () => ({
      identity,
      claims,
      isLoading,
      isAuthenticated: Boolean(identity.userId && identity.token),
      signIn,
      signOut,
      finishSignIn,
      fetchAccessToken,
    }),
    [
      claims,
      fetchAccessToken,
      finishSignIn,
      identity,
      isLoading,
      signIn,
      signOut,
    ],
  )

  return (
    <ShooAuthContext.Provider value={value}>
      {children}
    </ShooAuthContext.Provider>
  )
}

export function useShooAuth() {
  const context = useContext(ShooAuthContext)
  if (!context) {
    throw new Error('useShooAuth must be used inside ShooAuthProvider.')
  }
  return context
}

export function useShooAuthForConvex() {
  const { isLoading, isAuthenticated, fetchAccessToken } = useShooAuth()
  return { isLoading, isAuthenticated, fetchAccessToken }
}

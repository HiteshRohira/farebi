import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import type { ReactNode } from 'react'

import type {
  ShooClaims,
  ShooClient,
  ShooIdentity,
  ShooTokenResponse,
} from './shoo-types'

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
let shooLoadPromise: Promise<ShooClient> | null = null

function loadShooClient() {
  if (window.Shoo) return Promise.resolve(window.Shoo)
  if (shooLoadPromise) return shooLoadPromise

  shooLoadPromise = new Promise<ShooClient>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://shoo.dev/shoo.js'
    script.dataset.shooCallbackPath = '/shoo/callback'
    script.dataset.shooPii = 'true'
    script.dataset.shooAutoCallback = 'false'
    script.async = true
    script.addEventListener('load', () => {
      if (window.Shoo) resolve(window.Shoo)
      else reject(new Error('Shoo loaded without exposing its client API.'))
    })
    script.addEventListener('error', () => {
      reject(new Error('Shoo failed to load. Check your network connection.'))
    })
    document.head.append(script)
  }).catch((error: unknown) => {
    shooLoadPromise = null
    throw error
  })

  return shooLoadPromise
}

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
    void loadShooClient()
      .then(refreshIdentity)
      .catch(() => setIsLoading(false))

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
    const shoo = await loadShooClient()
    await shoo.startSignIn({
      returnTo: window.location.pathname + window.location.search,
      requestPii: true,
    })
  }, [])

  const finishSignIn = useCallback(async () => {
    const shoo = await loadShooClient()
    const result = await shoo.handleCallback()
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

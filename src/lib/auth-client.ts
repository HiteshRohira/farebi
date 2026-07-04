import {
  convexClient,
  crossDomainClient,
} from '@convex-dev/better-auth/client/plugins'
import { anonymousClient } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/react'

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_CONVEX_SITE_URL,
  plugins: [
    convexClient(),
    crossDomainClient(),
    ...(import.meta.env.DEV ? [anonymousClient()] : []),
  ],
})

export async function signInAnonymously(name: string) {
  if (!import.meta.env.DEV) {
    throw new Error('Guest sign-in is only available during local development.')
  }

  const displayName = name.trim()
  if (displayName.length < 2 || displayName.length > 40) {
    throw new Error('Your name must be between 2 and 40 characters.')
  }

  const signInResult = await authClient.signIn.anonymous({
    query: { name: displayName },
  })
  if (signInResult.error) throw new Error(signInResult.error.message)
}

export function useFarebiAuth() {
  const session = authClient.useSession()

  async function signIn() {
    const result = await authClient.signIn.social({
      provider: 'google',
      callbackURL: window.location.href,
    })
    if (result.error) throw new Error(result.error.message)
  }

  async function signOut() {
    const result = await authClient.signOut()
    if (result.error) throw new Error(result.error.message)
  }

  return {
    user: session.data?.user ?? null,
    isLoading: session.isPending,
    isAuthenticated: Boolean(session.data?.session),
    signIn,
    signOut,
  }
}

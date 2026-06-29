export type ShooIdentity = {
  userId: string | null
  token?: string
  expiresIn?: number
  receivedAt?: number
}

export type ShooTokenResponse = {
  pairwise_sub: string
  id_token: string
  expires_in?: number
}

export type ShooClaims = {
  sub?: string
  pairwise_sub?: string
  aud?: string
  iss?: string
  exp?: number
  email?: string
  email_verified?: boolean
  name?: string
  picture?: string
}

export type ShooClient = {
  getIdentity: () => ShooIdentity
  startSignIn: (options?: {
    returnTo?: string
    requestPii?: boolean
  }) => Promise<unknown>
  finishSignIn: (options?: {
    redirectAfter?: boolean
    redirectTo?: string
  }) => Promise<ShooTokenResponse | null>
  handleCallback: (options?: {
    redirectTo?: string
  }) => Promise<ShooTokenResponse | null>
  clearIdentity: () => void
  decodeIdentityClaims: (token: string) => ShooClaims | null
}

declare global {
  interface Window {
    Shoo?: ShooClient
  }
}

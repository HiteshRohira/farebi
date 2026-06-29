import { useEffect, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { LoaderCircle } from 'lucide-react'

import { useShooAuth } from '@/auth/shoo-provider'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export const Route = createFileRoute('/shoo/callback')({
  component: ShooCallback,
})

function ShooCallback() {
  const { finishSignIn } = useShooAuth()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    void finishSignIn()
      .then((result) => {
        if (!active) return
        if (!result) throw new Error('Shoo did not return an identity.')
      })
      .catch((cause: unknown) => {
        if (!active) return
        setError(cause instanceof Error ? cause.message : 'Sign-in failed.')
      })

    return () => {
      active = false
    }
  }, [finishSignIn, navigate])

  return (
    <main className="grid min-h-screen place-items-center px-6">
      <Card className="w-full max-w-sm text-center">
        <CardHeader>
          <CardTitle>
            {error ? 'Could not sign in' : 'Signing you in'}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          {error ? (
            <>
              <p className="text-sm text-muted-foreground">{error}</p>
              <Button onClick={() => void navigate({ to: '/' })}>
                Back home
              </Button>
            </>
          ) : (
            <LoaderCircle className="mx-auto size-5 animate-spin text-muted-foreground" />
          )}
        </CardContent>
      </Card>
    </main>
  )
}

import { useState } from 'react'
import type { FormEvent } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useConvexAuth, useMutation } from 'convex/react'
import {
  ArrowRight,
  CircleDot,
  LoaderCircle,
  LogOut,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'

import { api } from '../../convex/_generated/api'
import { useShooAuth } from '@/auth/shoo-provider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { isConvexConfigured } from '@/providers/app-provider'

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  const auth = useShooAuth()

  async function signIn() {
    try {
      await auth.signIn()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Sign-in failed.')
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-2.5">
            <div className="grid size-7 place-items-center rounded-md bg-foreground text-xs font-black text-background">
              F
            </div>
            <span className="font-semibold tracking-tight">Farebi</span>
          </div>
          {auth.isAuthenticated ? (
            <div className="flex items-center gap-3">
              <span className="hidden text-sm text-muted-foreground sm:inline">
                {auth.claims?.name ?? 'Player'}
              </span>
              <Button variant="ghost" size="sm" onClick={auth.signOut}>
                <LogOut /> Sign out
              </Button>
            </div>
          ) : (
            <Button size="sm" onClick={() => void signIn()}>
              Sign in with Shoo
            </Button>
          )}
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-16 px-6 py-16 lg:grid-cols-[1fr_420px] lg:items-center lg:py-28">
        <section>
          <Badge variant="outline" className="mb-6">
            <CircleDot className="mr-1.5 size-3" /> 3–5 players
          </Badge>
          <h1 className="max-w-2xl text-5xl font-semibold tracking-[-0.045em] sm:text-7xl">
            Tell the truth.
            <br />
            Sell the lie.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-muted-foreground">
            A social deduction game about reading your friends. Write a
            statement, spot the liars, and make your story believable.
          </p>
          <div className="mt-10 flex items-center gap-6 text-sm text-muted-foreground">
            <span className="flex items-center gap-2">
              <Users className="size-4" /> Private rooms
            </span>
            <span>•</span>
            <span>One device each</span>
          </div>
        </section>

        <Card className="border-white/15 bg-card/80">
          <CardHeader>
            <CardTitle className="text-xl">Start a game</CardTitle>
            <CardDescription>
              Create a room or enter a six-character invite code.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!auth.isAuthenticated ? (
              <Button
                size="lg"
                className="w-full"
                onClick={() => void signIn()}
              >
                Continue with Shoo <ArrowRight />
              </Button>
            ) : !isConvexConfigured ? (
              <div className="rounded-md border border-border bg-background p-4 text-sm leading-6 text-muted-foreground">
                Convex is not connected yet. Run{' '}
                <code className="text-foreground">pnpm dev:backend</code>, then
                add the generated values to{' '}
                <code className="text-foreground">.env.local</code>.
              </div>
            ) : (
              <GameActions />
            )}
          </CardContent>
        </Card>
      </main>

      <footer className="mx-auto flex max-w-6xl justify-between border-t border-border px-6 py-6 text-xs text-muted-foreground">
        <span>Realtime rooms powered by Convex</span>
        <span>Authentication by Shoo</span>
      </footer>
    </div>
  )
}

function GameActions() {
  const auth = useShooAuth()
  const convexAuth = useConvexAuth()
  const navigate = useNavigate()
  const createRoom = useMutation(api.rooms.createRoom)
  const joinRoom = useMutation(api.rooms.joinRoom)
  const [code, setCode] = useState('')
  const [pending, setPending] = useState<'create' | 'join' | null>(null)

  if (convexAuth.isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-3 text-sm text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin" /> Securing your session…
      </div>
    )
  }

  if (!convexAuth.isAuthenticated) {
    return (
      <div className="grid gap-4 rounded-md border border-border bg-background p-4">
        <div>
          <p className="text-sm font-medium">Shoo session was not accepted</p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Convex could not validate this sign-in. Sign out, then try again.
          </p>
          {import.meta.env.DEV ? (
            <p className="mt-2 font-mono text-xs text-muted-foreground">
              iss={auth.claims?.iss ?? 'missing'} · aud=
              {auth.claims?.aud ?? 'missing'}
            </p>
          ) : null}
        </div>
        <Button variant="outline" onClick={auth.signOut}>
          Sign out and retry
        </Button>
      </div>
    )
  }

  async function create() {
    setPending('create')
    try {
      const room = await createRoom({})
      await navigate({ to: '/room/$code', params: { code: room.code } })
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Could not create room.',
      )
    } finally {
      setPending(null)
    }
  }

  async function join(event: FormEvent) {
    event.preventDefault()
    if (code.trim().length !== 6) {
      toast.error('Enter a six-character room code.')
      return
    }
    setPending('join')
    try {
      const room = await joinRoom({ code })
      await navigate({ to: '/room/$code', params: { code: room.code } })
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Could not join room.',
      )
    } finally {
      setPending(null)
    }
  }

  return (
    <div className="grid gap-5">
      <Button
        size="lg"
        className="w-full"
        disabled={pending !== null}
        onClick={() => void create()}
      >
        {pending === 'create' ? 'Creating…' : 'Create room'}
        <ArrowRight />
      </Button>
      <div className="flex items-center gap-3 text-xs uppercase tracking-[0.18em] text-muted-foreground">
        <span className="h-px flex-1 bg-border" /> or join{' '}
        <span className="h-px flex-1 bg-border" />
      </div>
      <form className="flex gap-2" onSubmit={(event) => void join(event)}>
        <Input
          aria-label="Room code"
          placeholder="ROOM CODE"
          value={code}
          maxLength={6}
          autoComplete="off"
          className="font-mono uppercase tracking-[0.2em]"
          onChange={(event) => setCode(event.target.value.toUpperCase())}
        />
        <Button
          type="submit"
          variant="outline"
          size="lg"
          disabled={pending !== null}
        >
          Join
        </Button>
      </form>
    </div>
  )
}

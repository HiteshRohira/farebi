import { useState } from 'react'
import type { FormEvent } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useConvexAuth, useMutation } from 'convex/react'
import { ArrowRight, LoaderCircle, LogOut } from 'lucide-react'
import { toast } from 'sonner'

import { api } from '../../convex/_generated/api'
import { AuthOptions } from '@/components/auth-options'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useFarebiAuth } from '@/lib/auth-client'
import { isConvexConfigured } from '@/providers/app-provider'

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  const auth = useFarebiAuth()

  async function signOut() {
    try {
      await auth.signOut()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Sign-out failed.')
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
          {auth.isLoading ? (
            <LoaderCircle className="size-4 animate-spin text-muted-foreground" />
          ) : auth.isAuthenticated ? (
            <div className="flex items-center gap-3">
              <span className="hidden text-sm text-muted-foreground sm:inline">
                {auth.user?.name ?? 'Player'}
              </span>
              <Button variant="ghost" size="sm" onClick={() => void signOut()}>
                <LogOut /> Sign out
              </Button>
            </div>
          ) : (
            <Button size="sm" asChild>
              <a href="#player-name">Play now</a>
            </Button>
          )}
        </div>
      </header>

      <main className="mx-auto flex min-h-[calc(100svh-4rem)] max-w-xl sm:items-center sm:px-6 sm:py-12">
        <Card className="min-h-[calc(100svh-4rem)] w-full justify-center rounded-none border-x-0 border-b-0 bg-card/80 px-6 py-10 sm:min-h-0 sm:rounded-xl sm:border sm:p-8">
          <CardHeader>
            <CardTitle className="text-xl">Start a game</CardTitle>
            <CardDescription>
              Create a room or enter a six-character invite code.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!auth.isAuthenticated ? (
              <AuthOptions />
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
    </div>
  )
}

function GameActions() {
  const auth = useFarebiAuth()
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
          <p className="text-sm font-medium">Sign-in was not accepted</p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Convex could not validate this sign-in. Sign out, then try again.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() =>
            void auth.signOut().catch((error: unknown) => {
              toast.error(
                error instanceof Error ? error.message : 'Sign-out failed.',
              )
            })
          }
        >
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

import { useState } from 'react'
import type { FormEvent } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useConvexAuth, useMutation } from 'convex/react'
import {
  ArrowLeft,
  ArrowRight,
  BadgeQuestionMark,
  DoorOpen,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  Plus,
  Sparkles,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'

import { api } from '../../convex/_generated/api'
import { AuthOptions } from '@/components/auth-options'
import { Brand } from '@/components/brand'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useFarebiAuth } from '@/lib/auth-client'
import { cn } from '@/lib/utils'
import { isConvexConfigured } from '@/providers/app-provider'

type GameType = 'truth_or_lie' | 'celebrity'

const GAMES = [
  {
    id: 'celebrity' as const,
    number: '01',
    eyebrow: 'Solo or multiplayer',
    title: 'Who’s That?',
    description:
      'Hold the phone overhead. Your friends give clues while you guess the famous face.',
    accent: 'lime',
  },
  {
    id: 'truth_or_lie' as const,
    number: '02',
    eyebrow: '3–20 players',
    title: 'Truth or Lie',
    description:
      'Tell a story, blend in with the truth-tellers, then find out who fooled the room.',
    accent: 'coral',
  },
] as const

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  const auth = useFarebiAuth()
  const [selectedGame, setSelectedGame] = useState<GameType | null>(null)

  async function signOut() {
    try {
      await auth.signOut()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Sign-out failed.')
    }
  }

  return (
    <div className="min-h-screen overflow-hidden bg-background">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_14%_12%,rgba(214,255,63,0.08),transparent_30%),radial-gradient(circle_at_90%_72%,rgba(255,100,75,0.08),transparent_28%)]" />
      <header className="relative border-b border-border/70">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
          <Brand />
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
            <a
              href={selectedGame ? '#rooms' : '#games'}
              className="text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
            >
              {selectedGame ? 'Room setup' : 'Pick a game'}
            </a>
          )}
        </div>
      </header>

      <main className="relative mx-auto max-w-6xl px-5 pb-20 pt-14 sm:px-8 sm:pt-20">
        {selectedGame ? (
          <RoomSetup
            gameType={selectedGame}
            onBack={() => setSelectedGame(null)}
          />
        ) : (
          <GameShelf onChooseMultiplayer={setSelectedGame} />
        )}
      </main>
    </div>
  )
}

function GameShelf({
  onChooseMultiplayer,
}: {
  onChooseMultiplayer: (gameType: GameType) => void
}) {
  const navigate = useNavigate()

  return (
    <div id="games">
      <div className="max-w-3xl">
        <p className="font-mono text-xs font-bold uppercase tracking-[0.24em] text-[#d9ff43]">
          Pick your chaos
        </p>
        <h1 className="farebi-display mt-4 text-5xl font-black leading-[0.93] tracking-[-0.045em] sm:text-7xl">
          Choose a game.
          <br />
          <span className="text-muted-foreground">Start playing.</span>
        </h1>
        <p className="mt-6 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
          Pick a game, grab the phone, and let the clues fly.
        </p>
      </div>

      <div className="mt-12 grid gap-4 lg:grid-cols-2">
        {GAMES.map((game) => (
          <article
            key={game.id}
            className={cn(
              'group relative flex min-h-[340px] flex-col overflow-hidden rounded-[1.75rem] border p-6 sm:p-8',
              game.accent === 'lime'
                ? 'border-[#d9ff43]/35 bg-[#d9ff43] text-[#11130d]'
                : 'border-[#ff745f]/30 bg-[#211a19]',
            )}
          >
            <div className="flex items-start justify-between gap-4">
              <span
                className={cn(
                  'font-mono text-xs font-bold uppercase tracking-[0.2em]',
                  game.accent === 'lime'
                    ? 'text-[#11130d]/60'
                    : 'text-[#ff8a76]',
                )}
              >
                {game.number} · {game.eyebrow}
              </span>
              <BadgeQuestionMark
                strokeWidth={1.5}
                className="size-12 rotate-6 opacity-70 transition-transform duration-300 group-hover:rotate-[-4deg] sm:size-16"
              />
            </div>
            <div className="mt-auto pt-12">
              <h2 className="farebi-display text-4xl font-black tracking-[-0.04em] sm:text-5xl">
                {game.title}
              </h2>
              <p
                className={cn(
                  'mt-3 max-w-md leading-6',
                  game.accent === 'lime'
                    ? 'text-[#11130d]/70'
                    : 'text-muted-foreground',
                )}
              >
                {game.description}
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                {game.id === 'celebrity' ? (
                  <Button
                    size="lg"
                    className="bg-[#11130d] text-white hover:bg-[#272b20]"
                    onClick={() => void navigate({ to: '/solo/whos-that' })}
                  >
                    <Sparkles /> Start solo
                  </Button>
                ) : null}
                <Button
                  size="lg"
                  variant={game.accent === 'lime' ? 'outline' : 'default'}
                  className={cn(
                    game.accent === 'lime' &&
                      'border-[#11130d]/25 bg-transparent text-[#11130d] hover:bg-[#11130d]/10 hover:text-[#11130d]',
                  )}
                  onClick={() => onChooseMultiplayer(game.id)}
                >
                  <Users /> Play with a room
                </Button>
              </div>
            </div>
          </article>
        ))}

        <article className="flex min-h-44 items-center justify-between gap-6 rounded-[1.75rem] border border-dashed border-white/15 bg-white/[0.025] p-6 text-muted-foreground lg:col-span-2 sm:p-8">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.22em]">
              Next in the deck
            </p>
            <h2 className="farebi-display mt-2 text-3xl font-black text-foreground">
              More games
            </h2>
          </div>
          <span className="rotate-2 rounded-full border border-white/15 px-5 py-2 font-mono text-xs font-bold uppercase tracking-[0.18em] text-[#d9ff43]">
            Coming soon
          </span>
        </article>
      </div>
    </div>
  )
}

function RoomSetup({
  gameType,
  onBack,
}: {
  gameType: GameType
  onBack: () => void
}) {
  const auth = useFarebiAuth()
  const game = GAMES.find((item) => item.id === gameType)!

  return (
    <div id="rooms" className="mx-auto max-w-2xl">
      <button
        type="button"
        className="mb-8 flex items-center gap-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
        onClick={onBack}
      >
        <ArrowLeft className="size-4" /> All games
      </button>
      <div
        className={cn(
          'relative overflow-hidden rounded-[1.75rem] border bg-card/90 p-6 shadow-2xl shadow-black/25 sm:p-9',
          game.accent === 'lime'
            ? 'border-[#d9ff43]/30'
            : 'border-[#ff765f]/30',
        )}
      >
        <div
          className={cn(
            'pointer-events-none absolute -right-12 -top-12 size-40 rotate-12 rounded-[2.5rem] opacity-[0.07]',
            game.accent === 'lime' ? 'bg-[#d9ff43]' : 'bg-[#ff765f]',
          )}
        />
        <p
          className={cn(
            'relative font-mono text-xs font-bold uppercase tracking-[0.22em]',
            game.accent === 'lime' ? 'text-[#d9ff43]' : 'text-[#ff8a76]',
          )}
        >
          {game.eyebrow}
        </p>
        <h1 className="farebi-display relative mt-3 text-4xl font-black tracking-[-0.04em]">
          {game.title}
        </h1>
        <p className="mt-3 leading-7 text-muted-foreground">
          Create a room for your group, or enter a code to join one that’s
          already going.
        </p>

        <div className="relative mt-8 border-t border-border pt-8">
          {!auth.isAuthenticated ? (
            <>
              <div className="mb-5 flex items-center gap-2 text-sm font-medium">
                <LockKeyhole className="size-4 text-muted-foreground" /> Tell us
                who’s playing
              </div>
              <AuthOptions />
            </>
          ) : !isConvexConfigured ? (
            <div className="rounded-md border border-border bg-background p-4 text-sm leading-6 text-muted-foreground">
              Multiplayer is taking a quick break. Try again in a moment.
            </div>
          ) : (
            <GameActions gameType={gameType} />
          )}
        </div>
      </div>
    </div>
  )
}

function GameActions({ gameType }: { gameType: GameType }) {
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
        <LoaderCircle className="size-4 animate-spin" /> Getting your room
        ready…
      </div>
    )
  }

  if (!convexAuth.isAuthenticated) {
    return (
      <div className="grid gap-4 rounded-md border border-border bg-background p-4">
        <div>
          <p className="text-sm font-medium">We couldn’t verify your player</p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Sign out, then jump back in.
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
      const room = await createRoom({ gameType })
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
        <Plus /> {pending === 'create' ? 'Creating…' : 'Create room'}
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
          <DoorOpen /> Join
        </Button>
      </form>
    </div>
  )
}

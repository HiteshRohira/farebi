import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useConvexAuth, useMutation, useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import {
  Check,
  Clipboard,
  Clock3,
  Crown,
  LoaderCircle,
  LogIn,
  Send,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'

import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
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
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { isConvexConfigured } from '@/providers/app-provider'

type RoomState = NonNullable<FunctionReturnType<typeof api.rooms.getRoom>>
type Player = RoomState['players'][number]

export const Route = createFileRoute('/room/$code')({ component: RoomPage })

function RoomPage() {
  const { code } = Route.useParams()
  const auth = useShooAuth()

  if (!auth.isAuthenticated) {
    return (
      <CenteredCard title="Sign in to join this room">
        <Button
          onClick={() =>
            void auth.signIn().catch((error: unknown) => {
              toast.error(
                error instanceof Error ? error.message : 'Sign-in failed.',
              )
            })
          }
        >
          <LogIn /> Continue with Shoo
        </Button>
      </CenteredCard>
    )
  }

  if (!isConvexConfigured) {
    return (
      <CenteredCard title="Convex is not connected">
        <p className="text-sm text-muted-foreground">
          Configure <code>VITE_CONVEX_URL</code> before opening a room.
        </p>
      </CenteredCard>
    )
  }

  return <ConvexRoomGate code={code} />
}

function ConvexRoomGate({ code }: { code: string }) {
  const auth = useShooAuth()
  const convexAuth = useConvexAuth()

  if (convexAuth.isLoading) {
    return (
      <div className="grid min-h-screen place-items-center">
        <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!convexAuth.isAuthenticated) {
    return (
      <CenteredCard title="Sign-in could not be verified">
        <p className="text-sm text-muted-foreground">
          Convex did not accept this Shoo session.
        </p>
        {import.meta.env.DEV ? (
          <p className="font-mono text-xs text-muted-foreground">
            iss={auth.claims?.iss ?? 'missing'} · aud=
            {auth.claims?.aud ?? 'missing'}
          </p>
        ) : null}
        <Button variant="outline" onClick={auth.signOut}>
          Sign out and retry
        </Button>
      </CenteredCard>
    )
  }

  return <ConnectedRoom code={code} />
}

function ConnectedRoom({ code }: { code: string }) {
  const room = useQuery(api.rooms.getRoom, { code })
  const advancePhase = useMutation(api.rooms.advancePhase)
  const [advancing, setAdvancing] = useState(false)

  const advance = useCallback(async () => {
    if (!room || advancing) return
    setAdvancing(true)
    try {
      await advancePhase({ roomId: room.id })
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Could not advance phase.',
      )
    } finally {
      setAdvancing(false)
    }
  }, [advancePhase, advancing, room])

  if (room === undefined) {
    return (
      <div className="grid min-h-screen place-items-center">
        <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (room === null) {
    return (
      <CenteredCard title="Room not found">
        <Button asChild variant="outline">
          <Link to="/">Back home</Link>
        </Button>
      </CenteredCard>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <RoomHeader room={room} onExpire={() => void advance()} />
      <main className="mx-auto max-w-5xl px-6 py-10 sm:py-16">
        {room.status === 'waiting' ? <Lobby room={room} /> : null}
        {room.status === 'writing' ? <Writing room={room} /> : null}
        {room.status === 'discussion' ? <Discussion room={room} /> : null}
        {room.status === 'voting' ? <Voting room={room} /> : null}
        {room.status === 'results' || room.status === 'finished' ? (
          <Results room={room} />
        ) : null}
      </main>
    </div>
  )
}

function RoomHeader({
  room,
  onExpire,
}: {
  room: RoomState
  onExpire: () => void
}) {
  async function copyCode() {
    await navigator.clipboard.writeText(room.code)
    toast.success('Room code copied.')
  }

  return (
    <header className="border-b border-border">
      <div className="mx-auto flex min-h-16 max-w-5xl flex-wrap items-center justify-between gap-3 px-6 py-3">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="grid size-7 place-items-center rounded-md bg-foreground text-xs font-black text-background">
            F
          </div>
          <span className="font-semibold tracking-tight">Farebi</span>
        </Link>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="capitalize">
            {room.status}
          </Badge>
          {room.phaseEndsAt ? (
            <Timer endsAt={room.phaseEndsAt} onExpire={onExpire} />
          ) : null}
          <Button variant="ghost" size="sm" onClick={() => void copyCode()}>
            <Clipboard />
            <span className="font-mono tracking-[0.16em]">{room.code}</span>
          </Button>
        </div>
      </div>
    </header>
  )
}

function Timer({ endsAt, onExpire }: { endsAt: number; onExpire: () => void }) {
  const [seconds, setSeconds] = useState(() =>
    Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)),
  )
  const expiredFor = useRef<number | null>(null)

  useEffect(() => {
    const update = () => {
      const next = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000))
      setSeconds(next)
      if (next === 0 && expiredFor.current !== endsAt) {
        expiredFor.current = endsAt
        onExpire()
      }
    }
    update()
    const timer = window.setInterval(update, 1_000)
    return () => window.clearInterval(timer)
  }, [endsAt, onExpire])

  const minutes = Math.floor(seconds / 60)
  const remainder = String(seconds % 60).padStart(2, '0')
  return (
    <span className="flex items-center gap-1.5 rounded-md px-2 py-1 font-mono text-xs text-muted-foreground">
      <Clock3 className="size-3.5" /> {minutes}:{remainder}
    </span>
  )
}

function Lobby({ room }: { room: RoomState }) {
  const startGame = useMutation(api.rooms.startGame)
  const [pending, setPending] = useState(false)

  async function start() {
    setPending(true)
    try {
      await startGame({ roomId: room.id })
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Could not start game.',
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
      <section>
        <Badge variant="outline" className="mb-5">
          Lobby
        </Badge>
        <h1 className="text-4xl font-semibold tracking-tight">
          Waiting for players
        </h1>
        <p className="mt-3 text-muted-foreground">
          Share room code{' '}
          <span className="font-mono text-foreground">{room.code}</span>. The
          game needs at least three players.
        </p>
        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          {room.players.map((player) => (
            <PlayerRow key={player.id} player={player} />
          ))}
          {Array.from({ length: room.maxPlayers - room.players.length }).map(
            (_, index) => (
              <div
                key={index}
                className="flex h-16 items-center rounded-lg border border-dashed border-border px-4 text-sm text-muted-foreground"
              >
                Open seat
              </div>
            ),
          )}
        </div>
      </section>
      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="size-4" /> {room.players.length}/{room.maxPlayers}
          </CardTitle>
          <CardDescription>
            Roles are assigned privately when the host starts.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {room.isHost ? (
            <Button
              className="w-full"
              size="lg"
              disabled={pending || room.players.length < 3}
              onClick={() => void start()}
            >
              {pending ? 'Starting…' : 'Start game'}
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">
              The host will start when everyone is ready.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function Writing({ room }: { room: RoomState }) {
  const submitStatement = useMutation(api.rooms.submitStatement)
  const current = room.players.find((player) => player.isCurrent)
  const [statement, setStatement] = useState('')
  const [pending, setPending] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    try {
      await submitStatement({ roomId: room.id, statement })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not submit.')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="mx-auto grid max-w-2xl gap-8">
      <div className="text-center">
        <Badge variant="outline" className="mb-5">
          Your role
        </Badge>
        <h1 className="text-5xl font-semibold capitalize tracking-tight">
          {current?.role}
        </h1>
        <p className="mt-3 text-muted-foreground">
          {current?.role === 'truth'
            ? 'Write something real about yourself. Make it sound suspicious.'
            : 'Invent something about yourself. Make them believe it.'}
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Write your statement</CardTitle>
          <CardDescription>
            No prompts. Keep it under 240 characters.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {current?.hasSubmitted ? (
            <div className="flex items-center gap-3 rounded-md border border-border bg-background p-4 text-sm">
              <Check className="size-4" /> Submitted. Waiting for the others.
            </div>
          ) : (
            <form
              className="grid gap-3"
              onSubmit={(event) => void submit(event)}
            >
              <Textarea
                autoFocus
                maxLength={240}
                value={statement}
                placeholder="I once…"
                onChange={(event) => setStatement(event.target.value)}
              />
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {statement.length}/240
                </span>
                <Button disabled={pending || statement.trim().length < 3}>
                  <Send /> {pending ? 'Submitting…' : 'Submit'}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function Discussion({ room }: { room: RoomState }) {
  const beginVoting = useMutation(api.rooms.beginVoting)

  async function endDiscussion() {
    try {
      await beginVoting({ roomId: room.id })
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Could not start voting.',
      )
    }
  }

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Badge variant="outline" className="mb-5">
            Discussion
          </Badge>
          <h1 className="text-4xl font-semibold tracking-tight">
            Question everything
          </h1>
          <p className="mt-3 text-muted-foreground">
            Ask for details. Find the stories that do not hold up.
          </p>
        </div>
        {room.isHost ? (
          <Button variant="outline" onClick={() => void endDiscussion()}>
            Start voting
          </Button>
        ) : null}
      </div>
      <StatementGrid players={room.players} />
    </section>
  )
}

function Voting({ room }: { room: RoomState }) {
  const vote = useMutation(api.rooms.vote)
  const current = room.players.find((player) => player.isCurrent)
  const [selected, setSelected] = useState<Id<'players'> | null>(null)
  const [pending, setPending] = useState(false)

  async function submitVote() {
    if (!selected) return
    setPending(true)
    try {
      await vote({ roomId: room.id, targetPlayerId: selected })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not vote.')
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="mx-auto max-w-3xl">
      <div className="text-center">
        <Badge variant="outline" className="mb-5">
          Voting
        </Badge>
        <h1 className="text-4xl font-semibold tracking-tight">Who is lying?</h1>
        <p className="mt-3 text-muted-foreground">
          Choose one player. You cannot change your vote.
        </p>
      </div>
      {current?.hasVoted ? (
        <Card className="mt-10 text-center">
          <CardContent className="pt-1 text-sm text-muted-foreground">
            Vote locked. Waiting for everyone else.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="mt-10 grid gap-3 sm:grid-cols-2">
            {room.players
              .filter((player) => !player.isCurrent)
              .map((player) => (
                <button
                  key={player.id}
                  type="button"
                  className={cn(
                    'rounded-lg border p-4 text-left transition-colors',
                    selected === player.id
                      ? 'border-foreground bg-foreground text-background'
                      : 'border-border bg-card hover:border-white/30',
                  )}
                  onClick={() => setSelected(player.id)}
                >
                  <span className="font-medium">{player.name}</span>
                  <span
                    className={cn(
                      'mt-2 block text-sm',
                      selected === player.id
                        ? 'text-background/70'
                        : 'text-muted-foreground',
                    )}
                  >
                    “{player.statement}”
                  </span>
                </button>
              ))}
          </div>
          <Button
            size="lg"
            className="mt-5 w-full"
            disabled={!selected || pending}
            onClick={() => void submitVote()}
          >
            {pending ? 'Locking vote…' : 'Lock vote'}
          </Button>
        </>
      )}
    </section>
  )
}

function Results({ room }: { room: RoomState }) {
  const ranked = [...room.players].sort((a, b) => b.score - a.score)
  return (
    <section className="mx-auto max-w-3xl">
      <div className="text-center">
        <Badge variant="outline" className="mb-5">
          Results
        </Badge>
        <h1 className="text-4xl font-semibold tracking-tight">
          Truth revealed
        </h1>
        <p className="mt-3 text-muted-foreground">
          The stories are over. Here is the score.
        </p>
      </div>
      <div className="mt-10 grid gap-3">
        {ranked.map((player, index) => (
          <div
            key={player.id}
            className="grid grid-cols-[32px_1fr_auto_auto] items-center gap-3 rounded-lg border border-border bg-card px-4 py-4"
          >
            <span className="font-mono text-sm text-muted-foreground">
              {index + 1}
            </span>
            <div>
              <p className="font-medium">{player.name}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                “{player.statement}”
              </p>
            </div>
            <Badge
              className="capitalize"
              variant={player.role === 'lie' ? 'default' : 'outline'}
            >
              {player.role}
            </Badge>
            <span className="w-12 text-right font-mono text-sm">
              {player.score}
            </span>
          </div>
        ))}
      </div>
      <Button asChild variant="outline" className="mt-6 w-full">
        <Link to="/">Back home</Link>
      </Button>
    </section>
  )
}

function StatementGrid({ players }: { players: Array<Player> }) {
  return (
    <div className="mt-10 grid gap-4 sm:grid-cols-2">
      {players.map((player) => (
        <Card key={player.id} className="gap-4">
          <CardHeader>
            <CardDescription>Statement by</CardDescription>
            <CardTitle className="flex items-center gap-2">
              {player.name}
              {player.isHost ? (
                <Crown className="size-3.5 text-muted-foreground" />
              ) : null}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-lg leading-7">
            “{player.statement}”
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function PlayerRow({ player }: { player: Player }) {
  return (
    <div className="flex h-16 items-center gap-3 rounded-lg border border-border bg-card px-4">
      <div className="grid size-8 place-items-center rounded-full bg-secondary text-xs font-semibold">
        {player.name.slice(0, 1).toUpperCase()}
      </div>
      <span className="text-sm font-medium">{player.name}</span>
      {player.isHost ? (
        <Crown className="ml-auto size-3.5 text-muted-foreground" />
      ) : null}
      {player.isCurrent ? (
        <span className="ml-auto text-xs text-muted-foreground">You</span>
      ) : null}
    </div>
  )
}

function CenteredCard({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <main className="grid min-h-screen place-items-center px-6">
      <Card className="w-full max-w-sm text-center">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">{children}</CardContent>
      </Card>
    </main>
  )
}

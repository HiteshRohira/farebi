import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useConvexAuth, useMutation, useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import {
  Check,
  Clock3,
  Crown,
  Link2,
  LoaderCircle,
  QrCode,
  RotateCcw,
  Send,
  SlidersHorizontal,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { QRCodeSVG } from 'qrcode.react'

import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { AuthOptions } from '@/components/auth-options'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { useFarebiAuth } from '@/lib/auth-client'
import { cn } from '@/lib/utils'
import { isConvexConfigured } from '@/providers/app-provider'

type RoomState = NonNullable<FunctionReturnType<typeof api.rooms.getRoom>>
type Player = RoomState['players'][number]

function getRoomLink(code: string) {
  return `${window.location.origin}/room/${encodeURIComponent(code)}`
}

async function copyRoomLink(code: string) {
  await navigator.clipboard.writeText(getRoomLink(code))
  toast.success('Room link copied.')
}

export const Route = createFileRoute('/room/$code')({ component: RoomPage })

function RoomPage() {
  const { code } = Route.useParams()
  const auth = useFarebiAuth()

  if (auth.isLoading) {
    return (
      <div className="grid min-h-screen place-items-center">
        <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!auth.isAuthenticated) {
    return (
      <CenteredCard title="Sign in to join this room">
        <AuthOptions />
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
  const auth = useFarebiAuth()
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
          The server did not accept this session.
        </p>
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
      </CenteredCard>
    )
  }

  return <ConnectedRoom code={code} />
}

function ConnectedRoom({ code }: { code: string }) {
  const joinRoom = useMutation(api.rooms.joinRoom)
  const [hasJoined, setHasJoined] = useState(false)
  const [joinError, setJoinError] = useState<string | null>(null)
  const room = useQuery(api.rooms.getRoom, hasJoined ? { code } : 'skip')
  const advancePhase = useMutation(api.rooms.advancePhase)
  const [advancing, setAdvancing] = useState(false)

  useEffect(() => {
    let active = true
    void joinRoom({ code })
      .then(() => {
        if (active) setHasJoined(true)
      })
      .catch((error: unknown) => {
        if (!active) return
        setJoinError(
          error instanceof Error ? error.message : 'Could not join this room.',
        )
      })
    return () => {
      active = false
    }
  }, [code, joinRoom])

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

  if (joinError) {
    return (
      <CenteredCard title="Could not join room">
        <p className="text-sm text-muted-foreground">{joinError}</p>
        <Button asChild variant="outline">
          <Link to="/">Back home</Link>
        </Button>
      </CenteredCard>
    )
  }

  if (!hasJoined || room === undefined) {
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

  const currentPlayer = room.players.find((player) => player.isCurrent)
  const waitingForNextRound =
    currentPlayer?.joinedForNextRound &&
    room.status !== 'results' &&
    room.status !== 'finished'

  return (
    <div className="min-h-screen bg-background">
      <RoomHeader room={room} onExpire={() => void advance()} />
      <main className="mx-auto max-w-5xl px-6 py-10 sm:py-16">
        {waitingForNextRound ? (
          <WaitingForNextRound />
        ) : (
          <>
            {room.status === 'waiting' ? <Lobby room={room} /> : null}
            {room.status === 'writing' ? <Writing room={room} /> : null}
            {room.status === 'discussion' || room.status === 'voting' ? (
              <Voting room={room} />
            ) : null}
          </>
        )}
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
  return (
    <header className="border-b border-border">
      <div className="mx-auto grid min-h-16 max-w-5xl grid-cols-[1fr_auto] items-center gap-3 px-6 py-3 sm:grid-cols-[1fr_auto_1fr]">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="grid size-7 place-items-center rounded-md bg-foreground text-xs font-black text-background">
            F
          </div>
          <span className="font-semibold tracking-tight">Farebi</span>
        </Link>
        {room.status !== 'waiting' ? (
          <Button
            variant="ghost"
            size="sm"
            className="order-3 col-span-2 justify-self-center sm:order-none sm:col-span-1"
            onClick={() => void copyRoomLink(room.code)}
          >
            <Link2 />
            <span className="font-mono tracking-[0.16em]">{room.code}</span>
            <span className="text-muted-foreground">Copy link</span>
          </Button>
        ) : (
          <span className="hidden sm:block" />
        )}
        <div className="flex items-center justify-self-end gap-2">
          <Badge variant="outline" className="capitalize">
            {room.status}
          </Badge>
          {room.phaseEndsAt ? (
            <Timer endsAt={room.phaseEndsAt} onExpire={onExpire} />
          ) : null}
          {room.isHost ? <AdminControls room={room} /> : null}
        </div>
      </div>
    </header>
  )
}

function AdminControls({ room }: { room: RoomState }) {
  const updateRoomSettings = useMutation(api.rooms.updateRoomSettings)
  const endPhaseEarly = useMutation(api.rooms.endPhaseEarly)
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [settings, setSettings] = useState(() => ({
    maxPlayers: room.maxPlayers,
    writingDurationMinutes: room.writingDurationSeconds / 60,
    discussionDurationSeconds: room.discussionDurationSeconds,
    votingDurationMinutes: room.votingDurationSeconds / 60,
  }))

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen)
    if (nextOpen) {
      setSettings({
        maxPlayers: room.maxPlayers,
        writingDurationMinutes: room.writingDurationSeconds / 60,
        discussionDurationSeconds: room.discussionDurationSeconds,
        votingDurationMinutes: room.votingDurationSeconds / 60,
      })
    }
  }

  async function saveSettings() {
    setPending(true)
    try {
      await updateRoomSettings({
        roomId: room.id,
        maxPlayers: settings.maxPlayers,
        writingDurationSeconds: Math.round(
          settings.writingDurationMinutes * 60,
        ),
        discussionDurationSeconds: settings.discussionDurationSeconds,
        votingDurationSeconds: Math.round(settings.votingDurationMinutes * 60),
      })
      toast.success('Room settings saved.')
      setOpen(false)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Could not save settings.',
      )
    } finally {
      setPending(false)
    }
  }

  async function endEarly() {
    setPending(true)
    try {
      await endPhaseEarly({ roomId: room.id })
      setOpen(false)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Could not end this phase.',
      )
    } finally {
      setPending(false)
    }
  }

  const phaseAction =
    room.status === 'writing'
      ? 'End writing and start voting'
      : room.status === 'discussion'
        ? 'End discussion and start voting'
        : room.status === 'voting'
          ? 'End voting and show results'
          : null

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Game controls">
          <SlidersHorizontal />
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Host controls</SheetTitle>
          <SheetDescription>
            {room.status === 'waiting'
              ? 'Set the room capacity and how long each phase lasts.'
              : `Manage the current ${room.status} phase.`}
          </SheetDescription>
        </SheetHeader>

        {room.status === 'waiting' ? (
          <div className="mt-8 grid gap-5">
            <NumberSetting
              label="Maximum players"
              value={settings.maxPlayers}
              minimum={Math.max(3, room.players.length)}
              maximum={20}
              suffix="players"
              onChange={(maxPlayers) =>
                setSettings((current) => ({ ...current, maxPlayers }))
              }
            />
            <NumberSetting
              label="Writing time"
              value={settings.writingDurationMinutes}
              minimum={0.5}
              maximum={30}
              step={0.1}
              suffix="minutes"
              onChange={(writingDurationMinutes) =>
                setSettings((current) => ({
                  ...current,
                  writingDurationMinutes,
                }))
              }
            />
            <NumberSetting
              label="Voting time"
              value={settings.votingDurationMinutes}
              minimum={0.5}
              maximum={30}
              step={0.1}
              suffix="minutes"
              onChange={(votingDurationMinutes) =>
                setSettings((current) => ({
                  ...current,
                  votingDurationMinutes,
                }))
              }
            />
            <SheetFooter>
              <Button disabled={pending} onClick={() => void saveSettings()}>
                {pending ? 'Saving…' : 'Save settings'}
              </Button>
            </SheetFooter>
          </div>
        ) : phaseAction ? (
          <div className="mt-8 rounded-xl border border-border bg-card p-5">
            <p className="text-sm font-medium capitalize">
              {room.status} in progress
            </p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              This skips the remaining timer for everyone in the room.
            </p>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="mt-5 w-full">
                  {phaseAction}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{phaseAction}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Everyone will move forward immediately. This cannot be
                    undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep playing</AlertDialogCancel>
                  <AlertDialogAction
                    disabled={pending}
                    onClick={() => void endEarly()}
                  >
                    {pending ? 'Ending…' : 'Confirm'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        ) : (
          <p className="mt-8 text-sm text-muted-foreground">
            There are no controls for this phase.
          </p>
        )}
      </SheetContent>
    </Sheet>
  )
}

function NumberSetting({
  label,
  value,
  minimum,
  maximum,
  step = 1,
  suffix,
  onChange,
}: {
  label: string
  value: number
  minimum: number
  maximum: number
  step?: number
  suffix: string
  onChange: (value: number) => void
}) {
  return (
    <label className="grid gap-2 text-sm font-medium">
      <span className="flex items-center justify-between">
        {label}
        <span className="font-normal text-muted-foreground">{suffix}</span>
      </span>
      <Input
        type="number"
        inputMode={step < 1 ? 'decimal' : 'numeric'}
        min={minimum}
        max={maximum}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <span className="text-xs font-normal text-muted-foreground">
        {minimum}–{maximum} {suffix}
      </span>
    </label>
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
          Share the QR code or room link. The game needs at least three players.
        </p>
        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          {room.players.map((player) => (
            <PlayerRow key={player.id} player={player} />
          ))}
          {room.players.length < room.maxPlayers ? (
            <div className="flex h-16 items-center rounded-lg border border-dashed border-border px-4 text-sm text-muted-foreground">
              {room.maxPlayers - room.players.length} open{' '}
              {room.maxPlayers - room.players.length === 1 ? 'seat' : 'seats'}
            </div>
          ) : null}
        </div>
      </section>
      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="flex items-center justify-center gap-2 text-center">
            {room.isHost ? (
              <>
                <QrCode className="size-4" /> Scan QR code
              </>
            ) : (
              <>
                <Users className="size-4" /> {room.players.length}/
                {room.maxPlayers}
              </>
            )}
          </CardTitle>
          <CardDescription className="text-center">
            {room.isHost
              ? 'Open this camera-ready invite on another device.'
              : 'Roles are assigned privately when the host starts.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {room.isHost ? (
            <>
              <div className="mx-auto w-full max-w-56 rounded-xl bg-white p-3">
                <QRCodeSVG
                  value={getRoomLink(room.code)}
                  title={`Join room ${room.code}`}
                  size={224}
                  level="M"
                  className="h-auto w-full"
                />
              </div>
              <Button
                variant="outline"
                size="lg"
                className="w-full"
                onClick={() => void copyRoomLink(room.code)}
              >
                <Link2 /> Copy link
              </Button>
              <p className="text-center font-mono text-sm tracking-[0.2em] text-muted-foreground">
                {room.code}
              </p>
              <Button
                className="w-full"
                size="lg"
                disabled={pending || room.players.length < 3}
                onClick={() => void start()}
              >
                {pending ? 'Starting…' : 'Start game'}
              </Button>
            </>
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
          Choose any statement—including your own. You can change your selection
          until you confirm it.
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
              .filter((player) => player.isPlaying)
              .map((player, index) => (
                <button
                  key={player.id}
                  type="button"
                  disabled={pending}
                  aria-pressed={selected === player.id}
                  className={cn(
                    'rounded-lg border p-4 text-left transition-colors disabled:opacity-50',
                    selected === player.id
                      ? 'border-foreground bg-foreground text-background'
                      : 'border-border bg-card hover:border-white/30',
                  )}
                  onClick={() => setSelected(player.id)}
                >
                  <span className="flex items-center justify-between gap-3 font-medium">
                    <span className="font-mono text-xs uppercase tracking-[0.16em]">
                      Statement {String(index + 1).padStart(2, '0')}
                    </span>
                    {player.isCurrent ? (
                      <Badge
                        variant="outline"
                        className={cn(
                          selected === player.id &&
                            'border-background/30 text-background',
                        )}
                      >
                        Your statement
                      </Badge>
                    ) : null}
                  </span>
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
            {pending ? 'Confirming…' : 'Confirm'}
          </Button>
        </>
      )}
    </section>
  )
}

function WaitingForNextRound() {
  return (
    <section className="mx-auto max-w-lg text-center">
      <Badge variant="outline" className="mb-5">
        Room joined
      </Badge>
      <h1 className="text-4xl font-semibold tracking-tight">
        You’re in for the next round
      </h1>
      <p className="mt-3 leading-7 text-muted-foreground">
        This round was already underway, so you can watch the room now and will
        receive a role when the host starts the next one.
      </p>
    </section>
  )
}

function Results({ room }: { room: RoomState }) {
  const restartRound = useMutation(api.rooms.restartRound)
  const [pending, setPending] = useState(false)
  const ranked = [...room.players]
    .filter((player) => player.isPlaying)
    .sort((a, b) => b.score - a.score)

  async function restart() {
    setPending(true)
    try {
      await restartRound({ roomId: room.id })
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Could not start a new round.',
      )
    } finally {
      setPending(false)
    }
  }

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
              <p className="font-medium">{player.name ?? 'Player'}</p>
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
      {room.isHost ? (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="lg" className="mt-6 w-full">
              <RotateCcw /> Play another round
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Start another round?</AlertDialogTitle>
              <AlertDialogDescription>
                Everyone stays in this room and keeps their total score. New
                roles will be assigned immediately.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Not yet</AlertDialogCancel>
              <AlertDialogAction
                disabled={pending}
                onClick={() => void restart()}
              >
                {pending ? 'Starting…' : 'Start next round'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : (
        <p className="mt-6 text-center text-sm text-muted-foreground">
          The host can start another round with everyone in this room.
        </p>
      )}
      <Button asChild variant="ghost" className="mt-3 w-full">
        <Link to="/">Leave room</Link>
      </Button>
    </section>
  )
}

function PlayerRow({ player }: { player: Player }) {
  const name = player.name ?? 'Player'

  return (
    <div className="flex h-16 items-center gap-3 rounded-lg border border-border bg-card px-4">
      <div className="grid size-8 place-items-center rounded-full bg-secondary text-xs font-semibold">
        {name.slice(0, 1).toUpperCase()}
      </div>
      <span className="text-sm font-medium">{name}</span>
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

import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useConvexAuth, useMutation, useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import {
  ArrowLeft,
  Camera,
  Check,
  Clock3,
  Crown,
  ExternalLink,
  ImagePlus,
  Link2,
  LoaderCircle,
  Plus,
  QrCode,
  RotateCcw,
  Search,
  Send,
  SlidersHorizontal,
  Sparkles,
  UserRoundCheck,
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
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
import {
  CELEBRITIES,
  getGoogleSearchUrl,
  resolveCelebrityPhoto,
} from '@/lib/celebrities'
import { cn } from '@/lib/utils'
import { isConvexConfigured } from '@/providers/app-provider'

type RoomState = NonNullable<FunctionReturnType<typeof api.rooms.getRoom>>
type Player = RoomState['players'][number]

function getRoomLink(code: string) {
  return `${window.location.origin}/room/${encodeURIComponent(code)}`
}

function roomStatusLabel(status: RoomState['status']) {
  if (status === 'voting') return 'Discuss & vote'
  if (status === 'celebrity_submitting') return 'Pick a celebrity'
  if (status === 'celebrity_guessing') return 'Guessing'
  return status
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
      <CenteredCard title="Multiplayer is taking a quick break">
        <p className="text-sm text-muted-foreground">
          Head back to the games and try again in a moment.
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
      <CenteredCard title="We couldn’t verify your player">
        <p className="text-sm text-muted-foreground">
          Sign out, then jump back in.
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
            {room.status === 'voting' ? <Voting room={room} /> : null}
            {room.status === 'celebrity_submitting' ? (
              <CelebritySubmission room={room} />
            ) : null}
            {room.status === 'celebrity_guessing' ? (
              <CelebrityGuessing room={room} />
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
            {roomStatusLabel(room.status)}
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
  const addPhaseTime = useMutation(api.rooms.addPhaseTime)
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [settings, setSettings] = useState(() => ({
    maxPlayers: room.maxPlayers,
    writingDurationMinutes: room.writingDurationSeconds / 60,
    discussionVotingDurationMinutes: room.discussionVotingDurationSeconds / 60,
  }))

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen)
    if (nextOpen) {
      setSettings({
        maxPlayers: room.maxPlayers,
        writingDurationMinutes: room.writingDurationSeconds / 60,
        discussionVotingDurationMinutes:
          room.discussionVotingDurationSeconds / 60,
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
        discussionVotingDurationSeconds: Math.round(
          settings.discussionVotingDurationMinutes * 60,
        ),
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

  async function extendPhase() {
    setPending(true)
    try {
      await addPhaseTime({ roomId: room.id })
      toast.success('Added 30 seconds to this round.')
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Could not extend this phase.',
      )
    } finally {
      setPending(false)
    }
  }

  const phaseAction =
    room.status === 'writing'
      ? 'End writing and start discussion/voting'
      : room.status === 'voting'
        ? 'End discussion/voting and show results'
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
              : `Manage the current ${roomStatusLabel(room.status)} phase.`}
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
              label="Discussion/voting time"
              value={settings.discussionVotingDurationMinutes}
              minimum={0.5}
              maximum={30}
              step={0.1}
              suffix="minutes"
              onChange={(discussionVotingDurationMinutes) =>
                setSettings((current) => ({
                  ...current,
                  discussionVotingDurationMinutes,
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
            <p className="text-sm font-medium">
              {roomStatusLabel(room.status)} in progress
            </p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Add more time for everyone, or move the room forward early.
            </p>
            <Button
              variant="outline"
              className="mt-5 w-full"
              disabled={pending}
              onClick={() => void extendPhase()}
            >
              <Plus /> +30 sec
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="destructive"
                  className="mt-3 w-full"
                  disabled={pending}
                >
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
  const [setupOpen, setSetupOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const lockedGameType = room.gameTypeLocked ? room.gameType : undefined
  const [gameType, setGameType] = useState<'truth_or_lie' | 'celebrity' | null>(
    lockedGameType ?? null,
  )
  const [settings, setSettings] = useState(() => ({
    liarCount: room.liarCount,
    writingDurationMinutes: room.writingDurationSeconds / 60,
    discussionVotingDurationMinutes: room.discussionVotingDurationSeconds / 60,
  }))

  function handleSetupOpen(nextOpen: boolean) {
    setSetupOpen(nextOpen)
    if (nextOpen) {
      setSettings({
        liarCount: Math.min(room.liarCount, room.players.length - 1),
        writingDurationMinutes: room.writingDurationSeconds / 60,
        discussionVotingDurationMinutes:
          room.discussionVotingDurationSeconds / 60,
      })
    }
  }

  async function start() {
    setPending(true)
    try {
      await startGame({
        roomId: room.id,
        gameType: gameType ?? 'truth_or_lie',
        ...(gameType !== 'celebrity'
          ? {
              liarCount: settings.liarCount,
              writingDurationSeconds: Math.round(
                settings.writingDurationMinutes * 60,
              ),
              discussionVotingDurationSeconds: Math.round(
                settings.discussionVotingDurationMinutes * 60,
              ),
            }
          : {}),
      })
      setSetupOpen(false)
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
              <StartGameSetup
                open={setupOpen}
                pending={pending}
                playerCount={room.players.length}
                gameType={gameType}
                settings={settings}
                fixedGameType={lockedGameType}
                onOpenChange={handleSetupOpen}
                onGameTypeChange={setGameType}
                onSettingsChange={setSettings}
                onConfirm={() => void start()}
              />
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

type RoundSetupSettings = {
  liarCount: number
  writingDurationMinutes: number
  discussionVotingDurationMinutes: number
}

function useDesktopDialog() {
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window === 'undefined'
      ? false
      : window.matchMedia('(min-width: 640px)').matches,
  )

  useEffect(() => {
    const media = window.matchMedia('(min-width: 640px)')
    const update = () => setIsDesktop(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  return isDesktop
}

function StartGameSetup({
  open,
  pending,
  playerCount,
  gameType,
  settings,
  fixedGameType,
  onOpenChange,
  onGameTypeChange,
  onSettingsChange,
  onConfirm,
}: {
  open: boolean
  pending: boolean
  playerCount: number
  gameType: 'truth_or_lie' | 'celebrity' | null
  settings: RoundSetupSettings
  fixedGameType?: 'truth_or_lie' | 'celebrity'
  onOpenChange: (open: boolean) => void
  onGameTypeChange: (gameType: 'truth_or_lie' | 'celebrity') => void
  onSettingsChange: (settings: RoundSetupSettings) => void
  onConfirm: () => void
}) {
  const isDesktop = useDesktopDialog()
  const trigger = (
    <Button className="w-full" size="lg" disabled={pending || playerCount < 3}>
      <Sparkles />
      {fixedGameType === 'celebrity'
        ? 'Start Who’s That?'
        : fixedGameType === 'truth_or_lie'
          ? 'Set up Truth or Lie'
          : 'Choose a game'}
    </Button>
  )
  const content = (
    <RoundSetupForm
      pending={pending}
      playerCount={playerCount}
      gameType={gameType}
      settings={settings}
      fixedGameType={fixedGameType}
      onGameTypeChange={onGameTypeChange}
      onSettingsChange={onSettingsChange}
      onConfirm={onConfirm}
    />
  )

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogTrigger asChild>{trigger}</DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {fixedGameType ? 'Ready the room' : 'Pick tonight’s game'}
            </DialogTitle>
            <DialogDescription>
              {fixedGameType
                ? 'Everyone’s here. Start when the room is ready.'
                : 'The room stays together when you switch games.'}
            </DialogDescription>
          </DialogHeader>
          {content}
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>
            {fixedGameType ? 'Ready the room' : 'Pick tonight’s game'}
          </SheetTitle>
          <SheetDescription>
            {fixedGameType
              ? 'Everyone’s here. Start when the room is ready.'
              : 'The room stays together when you switch games.'}
          </SheetDescription>
        </SheetHeader>
        {content}
      </SheetContent>
    </Sheet>
  )
}

function RoundSetupForm({
  pending,
  playerCount,
  gameType,
  settings,
  fixedGameType,
  onGameTypeChange,
  onSettingsChange,
  onConfirm,
}: {
  pending: boolean
  playerCount: number
  gameType: 'truth_or_lie' | 'celebrity' | null
  settings: RoundSetupSettings
  fixedGameType?: 'truth_or_lie' | 'celebrity'
  onGameTypeChange: (gameType: 'truth_or_lie' | 'celebrity') => void
  onSettingsChange: (settings: RoundSetupSettings) => void
  onConfirm: () => void
}) {
  const selectedGame = fixedGameType ?? gameType

  return (
    <div className="mt-7 grid gap-5 sm:mt-0">
      {!fixedGameType ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <GameChoice
            selected={gameType === 'truth_or_lie'}
            icon={<UserRoundCheck className="size-5" />}
            title="Truth or Lie"
            description="Write a story, spot the liars, score the room."
            onClick={() => onGameTypeChange('truth_or_lie')}
          />
          <GameChoice
            selected={gameType === 'celebrity'}
            icon={<Camera className="size-5" />}
            title="Who’s That?"
            description="Pick famous faces and take turns guessing aloud."
            onClick={() => onGameTypeChange('celebrity')}
          />
        </div>
      ) : null}
      {selectedGame === 'truth_or_lie' ? (
        <>
          <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-border bg-card">
            <div className="border-r border-border p-4">
              <p className="font-mono text-2xl font-semibold">
                {settings.liarCount}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {settings.liarCount === 1 ? 'Liar' : 'Liars'}
              </p>
            </div>
            <div className="p-4">
              <p className="font-mono text-2xl font-semibold">
                {playerCount - settings.liarCount}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Truth players
              </p>
            </div>
          </div>
          <NumberSetting
            label="Number of liars"
            value={settings.liarCount}
            minimum={1}
            maximum={playerCount - 1}
            suffix={settings.liarCount === 1 ? 'liar' : 'liars'}
            onChange={(liarCount) =>
              onSettingsChange({ ...settings, liarCount })
            }
          />
          <div className="h-px bg-border" />
          <NumberSetting
            label="Writing time"
            value={settings.writingDurationMinutes}
            minimum={0.5}
            maximum={30}
            step={0.1}
            suffix="minutes"
            onChange={(writingDurationMinutes) =>
              onSettingsChange({ ...settings, writingDurationMinutes })
            }
          />
          <NumberSetting
            label="Discussion/voting time"
            value={settings.discussionVotingDurationMinutes}
            minimum={0.5}
            maximum={30}
            step={0.1}
            suffix="minutes"
            onChange={(discussionVotingDurationMinutes) =>
              onSettingsChange({ ...settings, discussionVotingDurationMinutes })
            }
          />
        </>
      ) : selectedGame === 'celebrity' ? (
        <div className="rounded-lg border border-border bg-card p-4 text-sm leading-6 text-muted-foreground">
          Everyone privately picks one well-known person. Turns run
          alphabetically; the guesser looks away while the rest of the room sees
          the name and photo.
        </div>
      ) : (
        <p className="text-center text-sm text-muted-foreground">
          Choose a game to continue.
        </p>
      )}
      <Button size="lg" disabled={pending || !selectedGame} onClick={onConfirm}>
        {pending ? 'Starting…' : 'Start game'}
      </Button>
    </div>
  )
}

function GameChoice({
  selected,
  icon,
  title,
  description,
  onClick,
}: {
  selected: boolean
  icon: React.ReactNode
  title: string
  description: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        'rounded-xl border p-4 text-left transition-colors',
        selected
          ? 'border-foreground bg-foreground text-background'
          : 'border-border bg-card hover:border-white/30',
      )}
      onClick={onClick}
    >
      <span className="flex items-center gap-2 font-medium">
        {icon} {title}
      </span>
      <span
        className={cn(
          'mt-2 block text-xs leading-5',
          selected ? 'text-background/65' : 'text-muted-foreground',
        )}
      >
        {description}
      </span>
    </button>
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

function CelebritySubmission({ room }: { room: RoomState }) {
  const generateUploadUrl = useMutation(api.rooms.generateCelebrityUploadUrl)
  const submitCelebrity = useMutation(api.rooms.submitCelebrity)
  const current = room.players.find((player) => player.isCurrent)
  const [search, setSearch] = useState('')
  const [name, setName] = useState('')
  const [photoUrl, setPhotoUrl] = useState<string | undefined>()
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | undefined>()
  const [resolvingPhoto, setResolvingPhoto] = useState(false)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (!photoFile) {
      setPreviewUrl(undefined)
      return
    }
    const next = URL.createObjectURL(photoFile)
    setPreviewUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [photoFile])

  const normalizedSearch = search.trim().toLocaleLowerCase()
  const featuredNames = [
    'Shah Rukh Khan',
    'Virat Kohli',
    'Deepika Padukone',
    'M. S. Dhoni',
    'A. R. Rahman',
    'Priyanka Chopra Jonas',
    'Amitabh Bachchan',
    'Rajinikanth',
  ]
  const matches = (
    normalizedSearch
      ? CELEBRITIES.filter((celebrity) =>
          celebrity.name.toLocaleLowerCase().includes(normalizedSearch),
        )
      : featuredNames
          .map((featuredName) =>
            CELEBRITIES.find((celebrity) => celebrity.name === featuredName),
          )
          .filter((celebrity) => celebrity !== undefined)
  ).slice(0, 10)

  async function chooseCelebrity(celebrity: (typeof CELEBRITIES)[number]) {
    setName(celebrity.name)
    setPhotoFile(null)
    setPhotoUrl(undefined)
    setResolvingPhoto(true)
    try {
      setPhotoUrl(await resolveCelebrityPhoto(celebrity.wikipediaTitle))
    } catch {
      // A name-only card is intentional when Wikimedia has no usable image.
    } finally {
      setResolvingPhoto(false)
    }
  }

  function chooseFile(file: File | undefined) {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('Choose an image file.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Keep the image under 5 MB.')
      return
    }
    setPhotoFile(file)
    setPhotoUrl(undefined)
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    try {
      let imageStorageId: Id<'_storage'> | undefined
      if (photoFile) {
        const uploadUrl = await generateUploadUrl({ roomId: room.id })
        const response = await fetch(uploadUrl, {
          method: 'POST',
          headers: { 'Content-Type': photoFile.type },
          body: photoFile,
        })
        if (!response.ok) throw new Error('Photo upload failed.')
        const upload = (await response.json()) as { storageId: Id<'_storage'> }
        imageStorageId = upload.storageId
      }
      await submitCelebrity({
        roomId: room.id,
        name,
        imageUrl: imageStorageId ? undefined : photoUrl,
        imageStorageId,
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not submit.')
    } finally {
      setPending(false)
    }
  }

  if (current?.hasSubmitted) {
    return (
      <section className="mx-auto max-w-xl text-center">
        <Badge variant="outline" className="mb-5">
          Locked in
        </Badge>
        {current.celebrityImageUrl ? (
          <img
            src={current.celebrityImageUrl}
            alt=""
            className="mx-auto mb-6 aspect-[4/5] w-48 rounded-2xl border border-border object-cover grayscale"
          />
        ) : null}
        <h1 className="text-4xl font-semibold tracking-tight">
          {current.celebrityName}
        </h1>
        <p className="mt-3 text-muted-foreground">
          Keep it secret. Waiting for everyone else to pick.
        </p>
      </section>
    )
  }

  return (
    <section className="mx-auto max-w-3xl">
      <div className="text-center">
        <Badge variant="outline" className="mb-5">
          Your secret pick
        </Badge>
        <h1 className="text-4xl font-semibold tracking-tight">
          Pick someone everyone knows
        </h1>
        <p className="mt-3 text-muted-foreground">
          Find a familiar face or add one of your own. A photo makes the reveal
          even better.
        </p>
      </div>

      <div className="mt-10 grid gap-6 md:grid-cols-[1fr_280px]">
        <Card>
          <CardContent className="grid gap-4 pt-1">
            <label className="relative block">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                placeholder={`Search ${CELEBRITIES.length} famous people…`}
                className="pl-9"
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <div className="grid max-h-72 gap-2 overflow-y-auto pr-1">
              {matches.map((celebrity) => (
                <button
                  key={celebrity.name}
                  type="button"
                  className={cn(
                    'flex items-center justify-between rounded-lg border px-4 py-3 text-left transition-colors',
                    name === celebrity.name
                      ? 'border-foreground bg-foreground text-background'
                      : 'border-border bg-background hover:border-white/30',
                  )}
                  onClick={() => void chooseCelebrity(celebrity)}
                >
                  <span className="text-sm font-medium">{celebrity.name}</span>
                  {name === celebrity.name ? (
                    <Check className="size-4" />
                  ) : null}
                </button>
              ))}
            </div>
            {search.trim().length >= 2 ? (
              <a
                href={getGoogleSearchUrl(search)}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground transition-colors hover:border-white/30 hover:text-foreground"
              >
                <span>Search Google for “{search.trim()}”</span>
                <ExternalLink className="size-4 shrink-0" />
              </a>
            ) : null}
          </CardContent>
        </Card>

        <form
          className="grid content-start gap-4"
          onSubmit={(event) => void submit(event)}
        >
          <label className="grid gap-2 text-sm font-medium">
            Name
            <Input
              value={name}
              maxLength={80}
              placeholder="Or type a custom name"
              onChange={(event) => {
                setName(event.target.value)
                setPhotoUrl(undefined)
                setPhotoFile(null)
              }}
            />
          </label>
          {previewUrl || photoUrl ? (
            <div className="relative overflow-hidden rounded-xl border border-border bg-card">
              <img
                src={previewUrl ?? photoUrl}
                alt="Selected celebrity"
                className="aspect-[4/3] w-full object-cover grayscale"
              />
            </div>
          ) : resolvingPhoto ? (
            <div className="grid aspect-[4/3] place-items-center rounded-xl border border-border bg-card">
              <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : null}
          <label className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-md border border-border bg-background text-sm font-medium hover:bg-accent">
            <ImagePlus className="size-4" />
            {photoFile ? 'Change photo' : 'Upload a photo'}
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(event) => chooseFile(event.target.files?.[0])}
            />
          </label>
          <Button
            size="lg"
            disabled={pending || resolvingPhoto || name.trim().length < 2}
          >
            <Send /> {pending ? 'Submitting…' : 'Lock in pick'}
          </Button>
        </form>
      </div>
    </section>
  )
}

function CelebrityGuessing({ room }: { room: RoomState }) {
  const advanceCelebrityTurn = useMutation(api.rooms.advanceCelebrityTurn)
  const [pending, setPending] = useState(false)
  const active = room.players.find(
    (player) => player.id === room.activeCelebrityPlayerId,
  )
  const isGuesser = active?.isCurrent ?? false
  const canAdvance = room.isHost || isGuesser
  const turn = room.celebrityTurnIndex + 1
  const playerCount = room.players.filter((player) => player.isPlaying).length

  async function finishTurn(guessed: boolean) {
    setPending(true)
    try {
      await advanceCelebrityTurn({ roomId: room.id, guessed })
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Could not finish the turn.',
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="mx-auto max-w-2xl text-center">
      <div className="flex items-center justify-center gap-3">
        <Badge variant="outline">
          Turn {turn}/{playerCount}
        </Badge>
        <Badge variant="outline">Alphabetical order</Badge>
      </div>
      <p className="mt-7 text-sm uppercase tracking-[0.2em] text-muted-foreground">
        Up now
      </p>
      <h1 className="mt-2 text-5xl font-semibold tracking-tight">
        {active?.name ?? 'Player'}
      </h1>

      {isGuesser ? (
        <div className="mt-10 rounded-2xl border border-border bg-card px-6 py-14">
          <Camera className="mx-auto size-7 text-muted-foreground" />
          <h2 className="mt-5 text-2xl font-semibold">
            Look away from your phone
          </h2>
          <p className="mx-auto mt-3 max-w-sm leading-7 text-muted-foreground">
            Everyone else can see the answer. Ask yes-or-no questions and say
            your final guess aloud.
          </p>
        </div>
      ) : (
        <div className="mt-10 overflow-hidden rounded-2xl border border-border bg-card">
          {active?.celebrityTarget?.imageUrl ? (
            <img
              src={active.celebrityTarget.imageUrl}
              alt=""
              className="aspect-[16/10] w-full object-cover object-top grayscale"
            />
          ) : null}
          <div className="px-6 py-8">
            <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">
              The answer
            </p>
            <h2 className="mt-3 text-4xl font-semibold tracking-tight">
              {active?.celebrityTarget?.name}
            </h2>
            <p className="mt-3 text-sm text-muted-foreground">
              Don’t say the name. Give only yes-or-no answers.
            </p>
          </div>
        </div>
      )}

      {canAdvance ? (
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Button
            variant="outline"
            size="lg"
            disabled={pending}
            onClick={() => void finishTurn(false)}
          >
            Skip & next
          </Button>
          <Button
            size="lg"
            disabled={pending}
            onClick={() => void finishTurn(true)}
          >
            <Check /> Guessed it · +10
          </Button>
        </div>
      ) : (
        <p className="mt-6 text-sm text-muted-foreground">
          The guesser or host will move to the next turn.
        </p>
      )}
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
          Discuss & vote
        </Badge>
        <h1 className="text-4xl font-semibold tracking-tight">Who is lying?</h1>
        <p className="mt-3 text-muted-foreground">
          Discuss the statements, then choose any statement—including your own.
          You can change your selection until you confirm it.
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
  const returnToLobby = useMutation(api.rooms.returnToLobby)
  const [pending, setPending] = useState<'restart' | 'lobby' | null>(null)
  const ranked = [...room.players]
    .filter((player) => player.isPlaying)
    .sort((a, b) => b.score - a.score)

  async function restart() {
    setPending('restart')
    try {
      await restartRound({ roomId: room.id })
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Could not start a new round.',
      )
    } finally {
      setPending(null)
    }
  }

  async function chooseAnotherGame() {
    setPending('lobby')
    try {
      await returnToLobby({ roomId: room.id })
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Could not return to lobby.',
      )
    } finally {
      setPending(null)
    }
  }

  const isCelebrity = room.gameType === 'celebrity'

  return (
    <section className="mx-auto max-w-3xl">
      <div className="text-center">
        <Badge variant="outline" className="mb-5">
          Results
        </Badge>
        <h1 className="text-4xl font-semibold tracking-tight">
          {isCelebrity ? 'That’s everyone' : 'Truth revealed'}
        </h1>
        <p className="mt-3 text-muted-foreground">
          {isCelebrity
            ? 'The faces are revealed. Here is the room score.'
            : 'The stories are over. Here is the score.'}
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
                {isCelebrity
                  ? `Guessed ${player.celebrityTarget?.name ?? 'a celebrity'}`
                  : `“${player.statement}”`}
              </p>
            </div>
            {isCelebrity ? (
              <Badge
                variant={
                  player.celebrityTarget?.wasGuessed ? 'default' : 'outline'
                }
              >
                {player.celebrityTarget?.wasGuessed ? 'Guessed' : 'Skipped'}
              </Badge>
            ) : (
              <Badge
                className="capitalize"
                variant={player.role === 'lie' ? 'default' : 'outline'}
              >
                {player.role}
              </Badge>
            )}
            <span className="w-12 text-right font-mono text-sm">
              {player.score}
            </span>
          </div>
        ))}
      </div>
      {room.isHost ? (
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Button
            variant="outline"
            size="lg"
            disabled={pending !== null}
            onClick={() => void chooseAnotherGame()}
          >
            <ArrowLeft /> {pending === 'lobby' ? 'Returning…' : 'Game shelf'}
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="lg" disabled={pending !== null}>
                <RotateCcw /> Play same game
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Start another round?</AlertDialogTitle>
                <AlertDialogDescription>
                  Everyone stays in this room and keeps their total score. New
                  {isCelebrity ? ' celebrities' : ' roles'} will be picked.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Not yet</AlertDialogCancel>
                <AlertDialogAction
                  disabled={pending !== null}
                  onClick={() => void restart()}
                >
                  {pending === 'restart' ? 'Starting…' : 'Start next round'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      ) : (
        <p className="mt-6 text-center text-sm text-muted-foreground">
          The host can replay this game or take the room back to the game shelf.
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

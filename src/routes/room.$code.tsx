import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useConvexAuth, useMutation, useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import {
  ArrowLeft,
  Camera,
  Check,
  Clock3,
  Crown,
  DoorOpen,
  Eye,
  EyeOff,
  ExternalLink,
  ImagePlus,
  Fingerprint,
  Link2,
  LoaderCircle,
  Plus,
  QrCode,
  RotateCcw,
  Search,
  Send,
  Skull,
  SlidersHorizontal,
  Sparkles,
  UserMinus,
  UserRoundCheck,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { QRCodeSVG } from 'qrcode.react'

import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { AuthOptions } from '@/components/auth-options'
import { Brand } from '@/components/brand'
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

type RoomQueryResult = FunctionReturnType<typeof api.rooms.getRoom>
type RoomState = Extract<NonNullable<RoomQueryResult>, { id: unknown }>
type Player = RoomState['players'][number]
type GameType = RoomState['gameType']

function getRoomLink(code: string) {
  return `${window.location.origin}/room/${encodeURIComponent(code)}`
}

function roomStatusLabel(status: RoomState['status']) {
  if (status === 'voting') return 'Discuss & vote'
  if (status === 'celebrity_submitting') return 'Pick a celebrity'
  if (status === 'celebrity_guessing') return 'Guessing'
  if (status === 'impostor_playing') return 'Playing & voting'
  if (status === 'finished') return 'Ended'
  return status
}

function adminPlayerStatus(room: RoomState, player: Player) {
  if (player.joinedForNextRound) return 'Next round'
  if (room.status === 'writing' || room.status === 'celebrity_submitting') {
    return player.hasSubmitted ? 'Ready' : 'Waiting'
  }
  if (room.status === 'voting') return player.hasVoted ? 'Voted' : 'Waiting'
  if (room.status === 'impostor_playing') {
    return player.isPlaying ? 'Playing' : 'Eliminated'
  }
  if (
    room.status === 'celebrity_guessing' &&
    room.activeCelebrityPlayerId === player.id
  ) {
    return 'Taking turn'
  }
  return 'In room'
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
    return <RoomLoading label="Finding your player…" />
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
    return <RoomLoading label="Opening the room…" />
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
  const switchRoom = useMutation(api.rooms.switchRoom)
  const currentRoom = useQuery(api.rooms.getCurrentRoom)
  const [hasJoined, setHasJoined] = useState(false)
  const [switching, setSwitching] = useState(false)
  const [joinError, setJoinError] = useState<string | null>(null)
  const room = useQuery(api.rooms.getRoom, hasJoined ? { code } : 'skip')
  const advancePhase = useMutation(api.rooms.advancePhase)
  const [advancing, setAdvancing] = useState(false)

  useEffect(() => {
    if (hasJoined) return
    if (currentRoom === undefined) return
    if (currentRoom && currentRoom.code !== code.trim().toUpperCase()) return
    let active = true
    void joinRoom({ code })
      .then(() => {
        if (active) setHasJoined(true)
      })
      .catch((error: unknown) => {
        if (!active) return
        const message =
          error instanceof Error ? error.message : 'Could not join this room.'
        setJoinError(
          message.includes('The host removed you from this room')
            ? 'The host removed you from this room. You cannot rejoin.'
            : message,
        )
      })
    return () => {
      active = false
    }
  }, [code, currentRoom, hasJoined, joinRoom])

  async function confirmSwitch() {
    setSwitching(true)
    try {
      await switchRoom({ code })
      setHasJoined(true)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Could not switch rooms.',
      )
    } finally {
      setSwitching(false)
    }
  }

  const advance = useCallback(async () => {
    const roomId = room && 'id' in room ? room.id : undefined
    if (!roomId || advancing) return
    setAdvancing(true)
    try {
      await advancePhase({ roomId })
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Could not advance phase.',
      )
    } finally {
      setAdvancing(false)
    }
  }, [advancePhase, advancing, room])

  if (currentRoom === undefined) {
    return <RoomLoading label="Checking your current room…" />
  }

  if (currentRoom && currentRoom.code !== code.trim().toUpperCase()) {
    return (
      <CenteredCard title="You’re already in another room">
        <p className="text-sm leading-6 text-muted-foreground">
          {currentRoom.isHost
            ? `You host ${currentRoom.code}. Switching will end it for everyone before you join ${code.toUpperCase()}.`
            : `You’ll leave ${currentRoom.code} before joining ${code.toUpperCase()}.`}
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <Button asChild variant="outline">
            <Link to="/room/$code" params={{ code: currentRoom.code }}>
              Resume {currentRoom.code}
            </Link>
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button disabled={switching}>
                {currentRoom.isHost ? 'End & join' : 'Leave & join'}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {currentRoom.isHost
                    ? `End ${currentRoom.code}?`
                    : `Leave ${currentRoom.code}?`}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  This change happens immediately. You’ll continue in room{' '}
                  {code.toUpperCase()}.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={switching}>
                  Stay here
                </AlertDialogCancel>
                <AlertDialogAction
                  disabled={switching}
                  onClick={() => void confirmSwitch()}
                >
                  {switching ? 'Switching…' : 'Confirm switch'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CenteredCard>
    )
  }

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
    return <RoomLoading label="Pulling up a chair…" />
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

  if ('unavailableReason' in room) {
    return (
      <CenteredCard
        title={
          room.unavailableReason === 'removed'
            ? 'You were removed from this room'
            : 'You left this room'
        }
      >
        <p className="text-sm leading-6 text-muted-foreground">
          {room.unavailableReason === 'removed'
            ? 'The host removed your seat. You cannot rejoin this room.'
            : 'Your seat is no longer active in this room.'}
        </p>
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
    <div className="app-shell relative bg-[#10130c]">
      <PartyBackdrop />
      <RoomHeader room={room} onExpire={() => void advance()} />
      <main className="relative mx-auto max-w-5xl px-5 py-10 sm:px-6 sm:py-16">
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
            {room.status === 'impostor_playing' ? (
              <ImpostorGame room={room} />
            ) : null}
          </>
        )}
        {room.status === 'results' ? <Results room={room} /> : null}
        {room.status === 'finished' ? <EndedRoom room={room} /> : null}
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
    <header className="app-top-bar border-b border-white/10 bg-[#10130c]/90">
      <div className="mx-auto grid min-h-16 max-w-5xl grid-cols-[1fr_auto] items-center gap-3 px-6 py-3 sm:grid-cols-[1fr_auto_1fr]">
        <Brand compact />
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
          <Badge
            variant="outline"
            className="border-[#d9ff43]/25 bg-[#d9ff43]/8 font-mono uppercase tracking-[0.1em] text-[#d9ff43]"
          >
            {roomStatusLabel(room.status)}
          </Badge>
          {room.phaseEndsAt ? (
            <Timer endsAt={room.phaseEndsAt} onExpire={onExpire} />
          ) : null}
          {room.isHost && room.status !== 'finished' ? (
            <AdminControls room={room} />
          ) : null}
          {room.status !== 'finished' ? <RoomExitControl room={room} /> : null}
        </div>
      </div>
    </header>
  )
}

function RoomExitControl({ room }: { room: RoomState }) {
  const navigate = useNavigate()
  const leaveRoom = useMutation(api.rooms.leaveRoom)
  const endRoom = useMutation(api.rooms.endRoom)
  const [pending, setPending] = useState(false)

  async function exitRoom() {
    setPending(true)
    try {
      if (room.isHost) {
        await endRoom({ roomId: room.id })
      } else {
        await leaveRoom({ roomId: room.id })
      }
      await navigate({ to: '/' })
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : room.isHost
            ? 'Could not end room.'
            : 'Could not leave room.',
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={room.isHost ? 'End room' : 'Leave room'}
        >
          <DoorOpen />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {room.isHost ? 'End this room?' : 'Leave this room?'}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {room.isHost
              ? 'The game will stop for everyone and this room code can no longer be joined.'
              : 'You can rejoin later with the room code if the room is still active.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Keep playing</AlertDialogCancel>
          <AlertDialogAction disabled={pending} onClick={() => void exitRoom()}>
            {pending
              ? room.isHost
                ? 'Ending…'
                : 'Leaving…'
              : room.isHost
                ? 'End room'
                : 'Leave room'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

type ImpostorVotingVisibility = 'anonymous' | 'revealed'
type ImpostorTieRule = 'eliminate_all' | 'eliminate_none'

type AdminSettingsValue = {
  maxPlayers: number
  liarCount: number
  writingDurationMinutes: number
  discussionVotingDurationMinutes: number
  impostorCount: number
  impostorVotingVisibility: ImpostorVotingVisibility
  impostorTieRule: ImpostorTieRule
}

function AdminControls({ room }: { room: RoomState }) {
  const updateRoomSettings = useMutation(api.rooms.updateRoomSettings)
  const endPhaseEarly = useMutation(api.rooms.endPhaseEarly)
  const addPhaseTime = useMutation(api.rooms.addPhaseTime)
  const kickPlayer = useMutation(api.rooms.kickPlayer)
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [kickingPlayerId, setKickingPlayerId] = useState<Id<'players'> | null>(
    null,
  )
  const [settings, setSettings] = useState<AdminSettingsValue>(() => ({
    maxPlayers: room.maxPlayers,
    liarCount: room.liarCount,
    writingDurationMinutes: room.writingDurationSeconds / 60,
    discussionVotingDurationMinutes: room.discussionVotingDurationSeconds / 60,
    impostorCount: room.impostorCount,
    impostorVotingVisibility: room.impostorVotingVisibility,
    impostorTieRule: room.impostorTieRule,
  }))

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen)
    if (nextOpen) {
      setSettings({
        maxPlayers: room.maxPlayers,
        liarCount: room.liarCount,
        writingDurationMinutes: room.writingDurationSeconds / 60,
        discussionVotingDurationMinutes:
          room.discussionVotingDurationSeconds / 60,
        impostorCount: room.impostorCount,
        impostorVotingVisibility: room.impostorVotingVisibility,
        impostorTieRule: room.impostorTieRule,
      })
    }
  }

  async function saveSettings() {
    setPending(true)
    try {
      await updateRoomSettings({
        roomId: room.id,
        maxPlayers: settings.maxPlayers,
        liarCount: settings.liarCount,
        writingDurationSeconds: Math.round(
          settings.writingDurationMinutes * 60,
        ),
        discussionVotingDurationSeconds: Math.round(
          settings.discussionVotingDurationMinutes * 60,
        ),
        impostorCount: settings.impostorCount,
        impostorVotingVisibility: settings.impostorVotingVisibility,
        impostorTieRule: settings.impostorTieRule,
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

  async function removePlayer(player: Player) {
    setKickingPlayerId(player.id)
    try {
      await kickPlayer({ roomId: room.id, playerId: player.id })
      toast.success(
        `${player.adminName ?? player.name ?? 'Player'} was removed.`,
      )
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Could not remove player.',
      )
    } finally {
      setKickingPlayerId(null)
    }
  }

  const phaseAction =
    room.status === 'writing'
      ? 'End writing and start discussion/voting'
      : room.status === 'voting'
        ? 'End discussion/voting and show results'
        : null
  const settingsEditable =
    room.status === 'waiting' || room.status === 'results'

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
            {settingsEditable
              ? 'Set up the room before the next game begins.'
              : `Manage the current ${roomStatusLabel(room.status)} phase.`}
          </SheetDescription>
        </SheetHeader>

        {settingsEditable ? (
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
            {room.gameType === 'impostor' ? (
              <ImpostorSettings
                playerCount={room.players.length}
                settings={settings}
                onChange={setSettings}
              />
            ) : room.gameType === 'truth_or_lie' ? (
              <>
                <NumberSetting
                  label="Number of liars"
                  value={settings.liarCount}
                  minimum={1}
                  maximum={Math.max(1, room.players.length - 1)}
                  suffix={settings.liarCount === 1 ? 'liar' : 'liars'}
                  onChange={(liarCount) =>
                    setSettings((current) => ({ ...current, liarCount }))
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
              </>
            ) : null}
            <SheetFooter>
              <Button disabled={pending} onClick={() => void saveSettings()}>
                {pending ? 'Saving…' : 'Save settings'}
              </Button>
            </SheetFooter>
          </div>
        ) : phaseAction ? (
          <div>
            <LockedGameSettings room={room} />
            <div className="mt-5 rounded-xl border border-border bg-card p-5">
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
          </div>
        ) : (
          <LockedGameSettings room={room} />
        )}

        <div className="mt-8 border-t border-white/10 pt-7">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-[#ff9b8a]">
                Room crew
              </p>
              <h3 className="farebi-display mt-1 text-lg font-black">
                Remove an inactive player
              </h3>
            </div>
            <span className="font-mono text-xs text-muted-foreground">
              {room.players.length - 1}{' '}
              {room.players.length === 2 ? 'guest' : 'guests'}
            </span>
          </div>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Farebi does not guess who is offline. Remove someone only when your
            group knows they have stopped playing.
          </p>
          <div className="mt-4 grid gap-2">
            {room.players.filter((player) => !player.isHost).length ? (
              room.players
                .filter((player) => !player.isHost)
                .map((player) => {
                  const name = player.adminName ?? player.name ?? 'Player'
                  const status = adminPlayerStatus(room, player)
                  return (
                    <div
                      key={player.id}
                      className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3"
                    >
                      <span className="grid size-9 shrink-0 rotate-[-3deg] place-items-center rounded-xl bg-[#d9ff43] text-xs font-black text-[#10130c]">
                        {name.slice(0, 1).toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{name}</p>
                        <p
                          className={cn(
                            'mt-0.5 font-mono text-[10px] uppercase tracking-[0.12em]',
                            status === 'Waiting'
                              ? 'text-[#ff9b8a]'
                              : 'text-muted-foreground',
                          )}
                        >
                          {status}
                        </p>
                      </div>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="ml-auto text-muted-foreground hover:bg-[#ff765f]/10 hover:text-[#ff9b8a]"
                            disabled={kickingPlayerId !== null}
                            aria-label={`Remove ${name}`}
                          >
                            <UserMinus />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remove {name}?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Their seat will be removed immediately and they
                              will not be able to rejoin room {room.code}.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel
                              disabled={kickingPlayerId === player.id}
                            >
                              Keep player
                            </AlertDialogCancel>
                            <AlertDialogAction
                              disabled={kickingPlayerId === player.id}
                              onClick={() => void removePlayer(player)}
                            >
                              {kickingPlayerId === player.id
                                ? 'Removing…'
                                : 'Remove player'}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  )
                })
            ) : (
              <div className="rounded-2xl border border-dashed border-white/10 px-4 py-5 text-center text-sm text-muted-foreground">
                No guests to remove.
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function ImpostorSettings({
  playerCount,
  settings,
  onChange,
  disabled = false,
}: {
  playerCount: number
  settings: Pick<
    AdminSettingsValue,
    'impostorCount' | 'impostorVotingVisibility' | 'impostorTieRule'
  >
  onChange: (
    update: (current: AdminSettingsValue) => AdminSettingsValue,
  ) => void
  disabled?: boolean
}) {
  return (
    <div className="grid gap-5">
      <NumberSetting
        label="Number of impostors"
        value={settings.impostorCount}
        minimum={1}
        maximum={Math.max(1, playerCount - 1)}
        suffix={settings.impostorCount === 1 ? 'impostor' : 'impostors'}
        disabled={disabled}
        onChange={(impostorCount) =>
          onChange((current) => ({ ...current, impostorCount }))
        }
      />
      <ChoiceSetting
        label="Voting receipts"
        value={settings.impostorVotingVisibility}
        disabled={disabled}
        options={[
          { value: 'anonymous', label: 'Anonymous' },
          { value: 'revealed', label: 'Show who voted' },
        ]}
        onChange={(impostorVotingVisibility) =>
          onChange((current) => ({ ...current, impostorVotingVisibility }))
        }
      />
      <ChoiceSetting
        label="If the vote is tied"
        value={settings.impostorTieRule}
        disabled={disabled}
        options={[
          { value: 'eliminate_none', label: 'Nobody goes out' },
          { value: 'eliminate_all', label: 'All tied go out' },
        ]}
        onChange={(impostorTieRule) =>
          onChange((current) => ({ ...current, impostorTieRule }))
        }
      />
    </div>
  )
}

function LockedGameSettings({ room }: { room: RoomState }) {
  return (
    <div className="mt-8 grid gap-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium">Game settings</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Visible throughout the game and locked until it ends.
          </p>
        </div>
        <Badge variant="outline">Locked</Badge>
      </div>
      <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
        {room.gameType === 'impostor' ? (
          <div className="grid gap-3 text-sm">
            <SettingSummary
              label="Impostors"
              value={String(room.impostorCount)}
            />
            <SettingSummary
              label="Voting receipts"
              value={
                room.impostorVotingVisibility === 'revealed'
                  ? 'Show who voted'
                  : 'Anonymous'
              }
            />
            <SettingSummary
              label="Tied vote"
              value={
                room.impostorTieRule === 'eliminate_all'
                  ? 'All tied go out'
                  : 'Nobody goes out'
              }
            />
          </div>
        ) : room.gameType === 'truth_or_lie' ? (
          <div className="grid gap-3 text-sm">
            <SettingSummary label="Liars" value={String(room.liarCount)} />
            <SettingSummary
              label="Writing"
              value={`${room.writingDurationSeconds / 60} min`}
            />
            <SettingSummary
              label="Discussion & voting"
              value={`${room.discussionVotingDurationSeconds / 60} min`}
            />
          </div>
        ) : (
          <SettingSummary label="Mode" value="Alphabetical turns" />
        )}
      </div>
    </div>
  )
}

function SettingSummary({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  )
}

function ChoiceSetting<TValue extends string>({
  label,
  value,
  options,
  disabled = false,
  onChange,
}: {
  label: string
  value: TValue
  options: Array<{ value: TValue; label: string }>
  disabled?: boolean
  onChange: (value: TValue) => void
}) {
  return (
    <fieldset disabled={disabled} className="grid gap-2">
      <legend className="text-sm font-medium">{label}</legend>
      <div className="grid grid-cols-2 gap-2">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={value === option.value}
            className={cn(
              'rounded-xl border px-3 py-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-65',
              value === option.value
                ? 'border-[#8eb4ff]/60 bg-[#8eb4ff] text-[#0c1424]'
                : 'border-white/10 bg-white/[0.025] text-muted-foreground hover:border-white/25 hover:text-foreground',
            )}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

function NumberSetting({
  label,
  value,
  minimum,
  maximum,
  step = 1,
  suffix,
  disabled = false,
  onChange,
}: {
  label: string
  value: number
  minimum: number
  maximum: number
  step?: number
  suffix: string
  disabled?: boolean
  onChange: (value: number) => void
}) {
  return (
    <label className="grid gap-2 text-sm font-medium">
      <span className="flex items-center justify-between">
        {label}
        <span className="font-normal text-muted-foreground">
          {value} {suffix}
        </span>
      </span>
      <Input
        type="number"
        inputMode={step < 1 ? 'decimal' : 'numeric'}
        min={minimum}
        max={maximum}
        step={step}
        value={value}
        disabled={disabled}
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
    <span className="flex items-center gap-1.5 rounded-full bg-white/[0.05] px-2.5 py-1 font-mono text-xs text-white/70">
      <Clock3 className="size-3.5" /> {minutes}:{remainder}
    </span>
  )
}

function Lobby({ room }: { room: RoomState }) {
  const startGame = useMutation(api.rooms.startGame)
  const [setupOpen, setSetupOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const lockedGameType = room.gameTypeLocked ? room.gameType : undefined
  const [gameType, setGameType] = useState<GameType | null>(
    lockedGameType ?? null,
  )
  const [settings, setSettings] = useState(() => ({
    liarCount: room.liarCount,
    writingDurationMinutes: room.writingDurationSeconds / 60,
    discussionVotingDurationMinutes: room.discussionVotingDurationSeconds / 60,
    impostorCount: room.impostorCount,
    impostorVotingVisibility: room.impostorVotingVisibility,
    impostorTieRule: room.impostorTieRule,
  }))

  function handleSetupOpen(nextOpen: boolean) {
    setSetupOpen(nextOpen)
    if (nextOpen) {
      setSettings({
        liarCount: Math.min(room.liarCount, room.players.length - 1),
        writingDurationMinutes: room.writingDurationSeconds / 60,
        discussionVotingDurationMinutes:
          room.discussionVotingDurationSeconds / 60,
        impostorCount: Math.min(
          room.impostorCount,
          Math.max(1, room.players.length - 1),
        ),
        impostorVotingVisibility: room.impostorVotingVisibility,
        impostorTieRule: room.impostorTieRule,
      })
    }
  }

  async function start() {
    setPending(true)
    try {
      await startGame({
        roomId: room.id,
        gameType: gameType ?? 'truth_or_lie',
        ...(gameType === 'truth_or_lie'
          ? {
              liarCount: settings.liarCount,
              writingDurationSeconds: Math.round(
                settings.writingDurationMinutes * 60,
              ),
              discussionVotingDurationSeconds: Math.round(
                settings.discussionVotingDurationMinutes * 60,
              ),
            }
          : gameType === 'impostor'
            ? {
                impostorCount: settings.impostorCount,
                impostorVotingVisibility: settings.impostorVotingVisibility,
                impostorTieRule: settings.impostorTieRule,
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
        <Badge
          variant="outline"
          className="mb-5 border-[#d9ff43]/30 bg-[#d9ff43]/10 font-mono uppercase tracking-[0.16em] text-[#d9ff43]"
        >
          Room lobby
        </Badge>
        <h1 className="farebi-display max-w-xl text-5xl font-black leading-[0.92] tracking-[-0.05em] sm:text-6xl">
          Waiting for the chaos.
        </h1>
        <p className="mt-5 max-w-lg leading-7 text-muted-foreground">
          Share the QR code or room link. The game needs at least three players.
        </p>
        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          {room.players.map((player) => (
            <PlayerRow key={player.id} player={player} />
          ))}
          {room.players.length < room.maxPlayers ? (
            <div className="flex h-16 items-center rounded-2xl border border-dashed border-[#d9ff43]/25 bg-[#d9ff43]/[0.025] px-4 text-sm text-muted-foreground">
              {room.maxPlayers - room.players.length} open{' '}
              {room.maxPlayers - room.players.length === 1 ? 'seat' : 'seats'}
            </div>
          ) : null}
        </div>
      </section>
      <Card className="h-fit border-[#ff765f]/25 bg-[#211a19]/90">
        <CardHeader>
          <CardTitle className="farebi-display flex items-center justify-center gap-2 text-center text-xl font-black">
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
              <div className="mx-auto w-full max-w-56 rotate-[-1deg] rounded-2xl bg-white p-3 shadow-[6px_6px_0_#ff765f]">
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
              <p className="text-center font-mono text-sm font-black tracking-[0.24em] text-[#ff9b8a]">
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
  impostorCount: number
  impostorVotingVisibility: ImpostorVotingVisibility
  impostorTieRule: ImpostorTieRule
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
  gameType: GameType | null
  settings: RoundSetupSettings
  fixedGameType?: GameType
  onOpenChange: (open: boolean) => void
  onGameTypeChange: (gameType: GameType) => void
  onSettingsChange: (settings: RoundSetupSettings) => void
  onConfirm: () => void
}) {
  const isDesktop = useDesktopDialog()
  const trigger = (
    <Button className="w-full" size="lg" disabled={pending || playerCount < 3}>
      <Sparkles />
      {fixedGameType === 'celebrity'
        ? 'Start Who’s That?'
        : fixedGameType === 'impostor'
          ? 'Set up Impostor'
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
  gameType: GameType | null
  settings: RoundSetupSettings
  fixedGameType?: GameType
  onGameTypeChange: (gameType: GameType) => void
  onSettingsChange: (settings: RoundSetupSettings) => void
  onConfirm: () => void
}) {
  const selectedGame = fixedGameType ?? gameType

  return (
    <div className="mt-7 grid gap-5 sm:mt-0">
      {!fixedGameType ? (
        <div className="grid gap-3 sm:grid-cols-3">
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
          <GameChoice
            selected={gameType === 'impostor'}
            icon={<Fingerprint className="size-5" />}
            title="Impostor"
            description="Share spoken clues and vote out the odd word."
            onClick={() => onGameTypeChange('impostor')}
          />
        </div>
      ) : null}
      {selectedGame === 'truth_or_lie' ? (
        <>
          <div className="grid grid-cols-2 overflow-hidden rounded-2xl border border-[#d9ff43]/20 bg-[#10130c]">
            <div className="border-r border-[#d9ff43]/15 bg-[#d9ff43] p-4 text-[#10130c]">
              <p className="farebi-display text-3xl font-black">
                {settings.liarCount}
              </p>
              <p className="mt-1 font-mono text-[10px] font-black uppercase tracking-[0.15em] opacity-60">
                {settings.liarCount === 1 ? 'Liar' : 'Liars'}
              </p>
            </div>
            <div className="p-4">
              <p className="farebi-display text-3xl font-black">
                {playerCount - settings.liarCount}
              </p>
              <p className="mt-1 font-mono text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground">
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
      ) : selectedGame === 'impostor' ? (
        <>
          <div className="rounded-2xl border border-[#8eb4ff]/25 bg-[#8eb4ff]/[0.07] p-4 text-sm leading-6 text-white/75">
            Most players get one word. The impostors get a related word. Give
            one-word clues aloud, then vote whenever the group is ready.
          </div>
          <NumberSetting
            label="Number of impostors"
            value={settings.impostorCount}
            minimum={1}
            maximum={Math.max(1, playerCount - 1)}
            suffix={settings.impostorCount === 1 ? 'impostor' : 'impostors'}
            onChange={(impostorCount) =>
              onSettingsChange({ ...settings, impostorCount })
            }
          />
          <ChoiceSetting
            label="Voting receipts"
            value={settings.impostorVotingVisibility}
            options={[
              { value: 'anonymous', label: 'Anonymous' },
              { value: 'revealed', label: 'Show who voted' },
            ]}
            onChange={(impostorVotingVisibility) =>
              onSettingsChange({ ...settings, impostorVotingVisibility })
            }
          />
          <ChoiceSetting
            label="If the vote is tied"
            value={settings.impostorTieRule}
            options={[
              { value: 'eliminate_none', label: 'Nobody goes out' },
              { value: 'eliminate_all', label: 'All tied go out' },
            ]}
            onChange={(impostorTieRule) =>
              onSettingsChange({ ...settings, impostorTieRule })
            }
          />
        </>
      ) : selectedGame === 'celebrity' ? (
        <div className="rounded-2xl border border-[#64d8ff]/25 bg-[#64d8ff]/[0.07] p-4 text-sm leading-6 text-white/70">
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
        'rounded-2xl border p-4 text-left transition-[color,background-color,border-color,transform] hover:-translate-y-0.5',
        selected
          ? 'border-[#d9ff43] bg-[#d9ff43] text-[#10130c] shadow-[4px_4px_0_#ff765f]'
          : 'border-border bg-white/[0.025] hover:border-[#d9ff43]/35',
      )}
      onClick={onClick}
    >
      <span className="flex items-center gap-2 font-medium">
        {icon} {title}
      </span>
      <span
        className={cn(
          'mt-2 block text-xs leading-5',
          selected ? 'text-[#10130c]/65' : 'text-muted-foreground',
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
        <Badge
          variant="outline"
          className="mb-5 border-[#ff765f]/35 bg-[#ff765f]/10 font-mono uppercase tracking-[0.15em] text-[#ff9b8a]"
        >
          Your role
        </Badge>
        <h1
          className={cn(
            'farebi-display text-6xl font-black capitalize tracking-[-0.055em] sm:text-7xl',
            current?.role === 'lie' ? 'text-[#ff765f]' : 'text-[#d9ff43]',
          )}
        >
          {current?.role}
        </h1>
        <p className="mt-3 text-muted-foreground">
          {current?.role === 'truth'
            ? 'Write something real about yourself. Make it sound suspicious.'
            : 'Invent something about yourself. Make them believe it.'}
        </p>
      </div>
      <Card className="border-white/12 bg-[#171a14]/95">
        <CardHeader>
          <CardTitle className="farebi-display text-2xl font-black">
            Write your statement
          </CardTitle>
          <CardDescription>
            No prompts. Keep it under 240 characters.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {current?.hasSubmitted ? (
            <div className="flex items-center gap-3 rounded-2xl border border-[#d9ff43]/25 bg-[#d9ff43]/10 p-4 text-sm text-[#d9ff43]">
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
        <Badge
          variant="outline"
          className="mb-5 border-[#d9ff43]/30 bg-[#d9ff43]/10 font-mono uppercase tracking-[0.15em] text-[#d9ff43]"
        >
          Locked in
        </Badge>
        {current.celebrityImageUrl ? (
          <img
            src={current.celebrityImageUrl}
            alt=""
            className="mx-auto mb-7 aspect-[4/5] w-48 rotate-[-2deg] rounded-3xl border border-[#d9ff43]/30 object-cover shadow-[8px_8px_0_#ff765f]"
          />
        ) : null}
        <h1 className="farebi-display text-5xl font-black tracking-[-0.05em]">
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
        <Badge
          variant="outline"
          className="mb-5 border-[#64d8ff]/30 bg-[#64d8ff]/10 font-mono uppercase tracking-[0.15em] text-[#64d8ff]"
        >
          Your secret pick
        </Badge>
        <h1 className="farebi-display text-5xl font-black leading-[0.95] tracking-[-0.05em]">
          Pick someone everyone knows
        </h1>
        <p className="mt-3 text-muted-foreground">
          Find a familiar face or add one of your own. A photo makes the reveal
          even better.
        </p>
      </div>

      <div className="mt-10 grid gap-6 md:grid-cols-[1fr_280px]">
        <Card className="border-[#64d8ff]/20 bg-[#111b1c]/90">
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
                    'flex items-center justify-between rounded-xl border px-4 py-3 text-left transition-colors',
                    name === celebrity.name
                      ? 'border-[#64d8ff] bg-[#64d8ff] text-[#10130c]'
                      : 'border-border bg-black/10 hover:border-[#64d8ff]/40',
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
                className="aspect-[4/3] w-full object-cover"
              />
            </div>
          ) : resolvingPhoto ? (
            <div className="grid aspect-[4/3] place-items-center rounded-xl border border-border bg-card">
              <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : null}
          <label className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-border bg-white/[0.025] text-sm font-bold hover:border-[#64d8ff]/35 hover:bg-accent">
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
  const turnPlayers = room.players
    .filter(
      (player) => player.isPlaying && player.celebrityTurnOrder !== undefined,
    )
    .sort((a, b) => (a.celebrityTurnOrder ?? 0) - (b.celebrityTurnOrder ?? 0))
  const turn = Math.max(
    1,
    turnPlayers.findIndex(
      (player) => player.id === room.activeCelebrityPlayerId,
    ) + 1,
  )
  const playerCount = turnPlayers.length

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
        <Badge
          variant="outline"
          className="border-[#ffd84d]/30 bg-[#ffd84d]/10 text-[#ffd84d]"
        >
          Turn {turn}/{playerCount}
        </Badge>
        <Badge variant="outline">Alphabetical order</Badge>
      </div>
      <p className="mt-7 font-mono text-xs font-black uppercase tracking-[0.22em] text-[#ff9b8a]">
        Up now
      </p>
      <h1 className="farebi-display mt-2 text-6xl font-black tracking-[-0.055em]">
        {active?.name ?? 'Player'}
      </h1>

      {isGuesser ? (
        <div className="mt-10 rotate-[-1deg] rounded-3xl border border-[#d9ff43]/30 bg-[#d9ff43] px-6 py-14 text-[#10130c] shadow-[8px_8px_0_#ff765f]">
          <Camera className="mx-auto size-8 opacity-55" />
          <h2 className="farebi-display mt-5 text-3xl font-black">
            Look away from your phone
          </h2>
          <p className="mx-auto mt-3 max-w-sm leading-7 text-[#10130c]/65">
            Everyone else can see the answer. Ask yes-or-no questions and say
            your final guess aloud.
          </p>
        </div>
      ) : (
        <div className="mt-10 overflow-hidden rounded-3xl border border-[#ff765f]/30 bg-[#211a19] shadow-[8px_8px_0_rgba(217,255,67,0.75)]">
          {active?.celebrityTarget?.imageUrl ? (
            <img
              src={active.celebrityTarget.imageUrl}
              alt=""
              className="aspect-[16/10] w-full object-cover object-top"
            />
          ) : null}
          <div className="px-6 py-8">
            <p className="font-mono text-xs font-black uppercase tracking-[0.2em] text-[#ff9b8a]">
              The answer
            </p>
            <h2 className="farebi-display mt-3 text-5xl font-black tracking-[-0.05em]">
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

function ImpostorGame({ room }: { room: RoomState }) {
  const voteImpostor = useMutation(api.rooms.voteImpostor)
  const current = room.players.find((player) => player.isCurrent)
  const activePlayers = room.players.filter((player) => player.isPlaying)
  const [selected, setSelected] = useState<Id<'players'> | null>(null)
  const [pending, setPending] = useState(false)
  const [wordVisible, setWordVisible] = useState(false)

  useEffect(() => {
    setSelected(null)
    setWordVisible(false)
  }, [room.impostorRound])

  async function submitVote() {
    if (!selected) return
    setPending(true)
    try {
      await voteImpostor({ roomId: room.id, targetPlayerId: selected })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not vote.')
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="mx-auto max-w-4xl">
      <div className="text-center">
        <Badge
          variant="outline"
          className="border-[#8eb4ff]/35 bg-[#8eb4ff]/10 font-mono uppercase tracking-[0.16em] text-[#9dbdff]"
        >
          Round {room.impostorRound}
        </Badge>
        <h1 className="farebi-display mt-5 text-5xl font-black leading-[0.92] tracking-[-0.055em] sm:text-7xl">
          Find the odd word.
        </h1>
        <p className="mx-auto mt-4 max-w-xl leading-7 text-muted-foreground">
          Say one related word aloud. Listen carefully. Vote whenever the group
          is ready.
        </p>
      </div>

      {room.impostorLastResult ? (
        <ImpostorRoundResult result={room.impostorLastResult} />
      ) : null}

      <div className="mt-9 grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="grid content-start gap-5">
          {current?.isPlaying ? (
            <div className="relative overflow-hidden rounded-[1.75rem] border border-[#8eb4ff]/30 bg-[#111b2e] p-6 shadow-[7px_7px_0_rgba(142,180,255,0.5)] sm:p-7">
              <Fingerprint className="absolute -right-7 -top-8 size-36 rotate-12 text-[#8eb4ff]/[0.07]" />
              <div className="relative flex items-center justify-between gap-3">
                <p className="font-mono text-[11px] font-black uppercase tracking-[0.2em] text-[#9dbdff]">
                  Your secret word
                </p>
                <EyeOff className="size-4 text-[#9dbdff]/70" />
              </div>
              {wordVisible ? (
                <div className="relative mt-8">
                  <p className="farebi-display break-words text-5xl font-black tracking-[-0.05em] text-white sm:text-6xl">
                    {room.impostorWord}
                  </p>
                  <Button
                    variant="outline"
                    className="mt-8 border-[#8eb4ff]/25 bg-transparent"
                    onClick={() => setWordVisible(false)}
                  >
                    <EyeOff /> Hide word
                  </Button>
                </div>
              ) : (
                <button
                  type="button"
                  className="relative mt-7 grid min-h-40 w-full place-items-center rounded-2xl border border-dashed border-[#8eb4ff]/30 bg-black/15 px-5 text-center transition-colors hover:border-[#8eb4ff]/60 hover:bg-[#8eb4ff]/[0.06]"
                  onClick={() => setWordVisible(true)}
                >
                  <span>
                    <Eye className="mx-auto size-6 text-[#9dbdff]" />
                    <span className="mt-3 block font-bold">Tap to reveal</span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      Keep this side of the screen private
                    </span>
                  </span>
                </button>
              )}
            </div>
          ) : (
            <div className="rounded-[1.75rem] border border-white/10 bg-white/[0.035] p-7 text-center">
              <Skull className="mx-auto size-8 text-[#ff9b8a]" />
              <h2 className="farebi-display mt-4 text-3xl font-black">
                You’re out.
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Watch the clues and votes, but sit out the rest of this game.
              </p>
            </div>
          )}

          <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-muted-foreground">
                Players still in
              </span>
              <strong className="font-mono text-[#9dbdff]">
                {activePlayers.length}
              </strong>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {room.players.map((player) => (
                <Badge
                  key={player.id}
                  variant="outline"
                  className={cn(
                    'border-white/10',
                    !player.isPlaying && 'opacity-45 line-through',
                  )}
                >
                  {player.name ?? 'Player'}
                </Badge>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-[1.75rem] border border-white/10 bg-[#171a14]/90 p-6 sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-mono text-[11px] font-black uppercase tracking-[0.18em] text-[#ff9b8a]">
                Open ballot
              </p>
              <h2 className="farebi-display mt-2 text-3xl font-black">
                Who has the odd word?
              </h2>
            </div>
            <span className="shrink-0 rounded-full bg-white/[0.05] px-3 py-1.5 font-mono text-xs text-muted-foreground">
              {room.impostorVotesCast}/{room.impostorEligibleVoters}
            </span>
          </div>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Every active player must vote. Choices and counts stay hidden until
            the round closes.
          </p>

          {!current?.isPlaying ? (
            <div className="mt-6 rounded-2xl border border-dashed border-white/10 px-5 py-8 text-center text-sm text-muted-foreground">
              Eliminated players cannot vote.
            </div>
          ) : room.impostorCurrentPlayerHasVoted ? (
            <div className="mt-6 rounded-2xl border border-[#8eb4ff]/25 bg-[#8eb4ff]/[0.06] px-5 py-8 text-center">
              <Check className="mx-auto size-6 text-[#9dbdff]" />
              <p className="mt-3 font-bold">Vote locked</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Waiting for everyone else.
              </p>
            </div>
          ) : (
            <>
              <div className="mt-6 grid gap-2 sm:grid-cols-2">
                {activePlayers
                  .filter((player) => !player.isCurrent)
                  .map((player) => (
                    <button
                      key={player.id}
                      type="button"
                      aria-pressed={selected === player.id}
                      disabled={pending}
                      className={cn(
                        'flex min-h-14 items-center gap-3 rounded-2xl border px-4 text-left transition-all disabled:opacity-50',
                        selected === player.id
                          ? 'translate-x-1 border-[#8eb4ff] bg-[#8eb4ff] text-[#0c1424] shadow-[-4px_4px_0_rgba(255,118,95,0.8)]'
                          : 'border-white/10 bg-white/[0.025] hover:border-[#8eb4ff]/40',
                      )}
                      onClick={() => setSelected(player.id)}
                    >
                      <span
                        className={cn(
                          'grid size-8 place-items-center rounded-xl text-xs font-black',
                          selected === player.id
                            ? 'bg-[#0c1424] text-[#8eb4ff]'
                            : 'bg-[#8eb4ff]/10 text-[#9dbdff]',
                        )}
                      >
                        {(player.name ?? 'P').slice(0, 1).toUpperCase()}
                      </span>
                      <span className="font-medium">
                        {player.name ?? 'Player'}
                      </span>
                    </button>
                  ))}
              </div>
              <Button
                size="lg"
                className="mt-4 w-full bg-[#8eb4ff] text-[#0c1424] hover:bg-[#a9c5ff]"
                disabled={!selected || pending}
                onClick={() => void submitVote()}
              >
                {pending ? 'Locking vote…' : 'Lock vote'}
              </Button>
            </>
          )}
        </div>
      </div>
    </section>
  )
}

function ImpostorRoundResult({
  result,
}: {
  result: NonNullable<RoomState['impostorLastResult']>
}) {
  return (
    <div className="mt-8 overflow-hidden rounded-[1.5rem] border border-[#ff765f]/25 bg-[#211a19]">
      <div className="border-b border-white/10 px-5 py-5 sm:flex sm:items-center sm:justify-between sm:gap-5">
        <div>
          <p className="font-mono text-[10px] font-black uppercase tracking-[0.18em] text-[#ff9b8a]">
            Round {result.round} result
          </p>
          <p className="farebi-display mt-1 text-2xl font-black">
            {result.eliminated.length
              ? `${result.eliminated.map((player) => player.name).join(' & ')} ${result.eliminated.length === 1 ? 'is' : 'are'} out.`
              : 'The vote tied. Nobody is out.'}
          </p>
        </div>
        {result.eliminated.length ? (
          <div className="mt-3 flex flex-wrap gap-2 sm:mt-0 sm:justify-end">
            {result.eliminated.map((player) => (
              <Badge
                key={player.id}
                className={cn(
                  player.wasImpostor
                    ? 'bg-[#ff765f] text-[#10130c]'
                    : 'bg-white text-[#10130c]',
                )}
              >
                {player.wasImpostor ? 'Impostor' : 'Not an impostor'}
              </Badge>
            ))}
          </div>
        ) : null}
      </div>
      <div className="grid gap-5 px-5 py-5 sm:grid-cols-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
            Vote count
          </p>
          <div className="mt-3 grid gap-2">
            {result.voteCounts.map((player) => (
              <div
                key={player.playerId}
                className="flex items-center justify-between gap-4 text-sm"
              >
                <span>{player.name}</span>
                <span className="font-mono text-[#ff9b8a]">{player.count}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
            Ballots
          </p>
          {result.ballots ? (
            <div className="mt-3 grid gap-2 text-sm">
              {result.ballots.map((ballot, index) => (
                <p key={`${ballot.voterName}-${index}`}>
                  <span className="text-muted-foreground">
                    {ballot.voterName}
                  </span>{' '}
                  → {ballot.targetName}
                </p>
              ))}
            </div>
          ) : (
            <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
              <EyeOff className="size-4" /> Anonymous for this game
            </p>
          )}
        </div>
      </div>
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
        <Badge
          variant="outline"
          className="mb-5 border-[#ff765f]/35 bg-[#ff765f]/10 font-mono uppercase tracking-[0.15em] text-[#ff9b8a]"
        >
          Discuss & vote
        </Badge>
        <h1 className="farebi-display text-5xl font-black tracking-[-0.05em] sm:text-6xl">
          Who is lying?
        </h1>
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
                    'rounded-2xl border p-4 text-left transition-[color,background-color,border-color,transform,box-shadow] disabled:opacity-50',
                    selected === player.id
                      ? 'translate-x-1 border-[#ff765f] bg-[#ff765f] text-[#10130c] shadow-[-5px_5px_0_#d9ff43]'
                      : 'border-border bg-card/85 hover:border-[#ff765f]/40',
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
                            'border-[#10130c]/25 text-[#10130c]',
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
                        ? 'text-[#10130c]/70'
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
    <section className="mx-auto max-w-lg rounded-3xl border border-[#64d8ff]/25 bg-[#64d8ff]/[0.07] px-7 py-12 text-center">
      <Badge
        variant="outline"
        className="mb-5 border-[#64d8ff]/30 text-[#64d8ff]"
      >
        Room joined
      </Badge>
      <h1 className="farebi-display text-5xl font-black leading-[0.95] tracking-[-0.05em]">
        You’re in for the next round
      </h1>
      <p className="mt-3 leading-7 text-muted-foreground">
        This round was already underway, so you can watch the room now and will
        receive a role when the host starts the next one.
      </p>
    </section>
  )
}

function EndedRoom({ room }: { room: RoomState }) {
  const ranked = [...room.players].sort((a, b) => b.score - a.score)

  return (
    <section className="mx-auto max-w-2xl text-center">
      <div className="mx-auto grid size-20 rotate-[-4deg] place-items-center rounded-[1.75rem] bg-[#ff765f] text-[#10130c] shadow-[6px_6px_0_#d9ff43]">
        <DoorOpen className="size-9" />
      </div>
      <Badge
        variant="outline"
        className="mb-5 mt-10 border-[#ff765f]/35 bg-[#ff765f]/10 font-mono uppercase tracking-[0.15em] text-[#ff9b8a]"
      >
        Room {room.code} ended
      </Badge>
      <h1 className="farebi-display text-5xl font-black tracking-[-0.05em] sm:text-6xl">
        That’s a wrap.
      </h1>
      <p className="mx-auto mt-4 max-w-lg leading-7 text-muted-foreground">
        This room is closed and won’t accept new players. The final scoreboard
        is here whenever you need one last victory lap.
      </p>
      {ranked.length ? (
        <div className="mt-9 grid gap-2 text-left">
          {ranked.map((player, index) => (
            <div
              key={player.id}
              className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.035] px-5 py-4"
            >
              <span className="w-6 font-mono text-xs text-muted-foreground">
                {String(index + 1).padStart(2, '0')}
              </span>
              <span className="font-medium">{player.name ?? 'Player'}</span>
              <span className="ml-auto font-mono text-sm text-[#d9ff43]">
                {player.score} pts
              </span>
            </div>
          ))}
        </div>
      ) : null}
      <Button asChild size="lg" className="mt-8">
        <Link to="/">
          Back to games <ArrowLeft />
        </Link>
      </Button>
    </section>
  )
}

function Results({ room }: { room: RoomState }) {
  return room.gameType === 'impostor' ? (
    <ImpostorResults room={room} />
  ) : (
    <ScoredResults room={room} />
  )
}

function ImpostorResults({ room }: { room: RoomState }) {
  const restartRound = useMutation(api.rooms.restartRound)
  const returnToLobby = useMutation(api.rooms.returnToLobby)
  const [pending, setPending] = useState<'restart' | 'lobby' | null>(null)

  async function restart() {
    setPending('restart')
    try {
      await restartRound({ roomId: room.id })
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Could not start a new game.',
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

  return (
    <section className="mx-auto max-w-3xl">
      <div className="text-center">
        <div className="mx-auto grid size-20 rotate-[-5deg] place-items-center rounded-[1.75rem] bg-[#8eb4ff] text-[#0c1424] shadow-[7px_7px_0_#ff765f]">
          <Fingerprint className="size-10" />
        </div>
        <Badge
          variant="outline"
          className="mb-5 mt-9 border-[#8eb4ff]/35 bg-[#8eb4ff]/10 font-mono uppercase tracking-[0.15em] text-[#9dbdff]"
        >
          Game complete
        </Badge>
        <h1 className="farebi-display text-5xl font-black tracking-[-0.055em] sm:text-7xl">
          Impostors found.
        </h1>
        <p className="mt-3 text-muted-foreground">
          Every odd word is out. Here’s what everyone was holding.
        </p>
      </div>

      {room.impostorLastResult ? (
        <ImpostorRoundResult result={room.impostorLastResult} />
      ) : null}

      <div className="mt-7 grid grid-cols-2 overflow-hidden rounded-[1.75rem] border border-[#8eb4ff]/25 bg-[#111b2e]">
        <div className="border-r border-[#8eb4ff]/20 p-5 sm:p-7">
          <p className="font-mono text-[10px] font-black uppercase tracking-[0.18em] text-[#9dbdff]">
            Main word
          </p>
          <p className="farebi-display mt-3 break-words text-3xl font-black sm:text-5xl">
            {room.impostorCommonWord}
          </p>
        </div>
        <div className="bg-[#8eb4ff] p-5 text-[#0c1424] sm:p-7">
          <p className="font-mono text-[10px] font-black uppercase tracking-[0.18em] opacity-60">
            Odd word
          </p>
          <p className="farebi-display mt-3 break-words text-3xl font-black sm:text-5xl">
            {room.impostorDifferentWord}
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-2 sm:grid-cols-2">
        {room.players.map((player) => (
          <div
            key={player.id}
            className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-4"
          >
            <span
              className={cn(
                'grid size-9 place-items-center rounded-xl text-xs font-black',
                player.impostorRole === 'impostor'
                  ? 'bg-[#ff765f] text-[#10130c]'
                  : 'bg-[#8eb4ff]/10 text-[#9dbdff]',
              )}
            >
              {(player.name ?? 'P').slice(0, 1).toUpperCase()}
            </span>
            <span className="font-medium">{player.name ?? 'Player'}</span>
            <Badge variant="outline" className="ml-auto capitalize">
              {player.impostorRole === 'impostor' ? 'Impostor' : 'Player'}
            </Badge>
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
          <Button
            size="lg"
            className="bg-[#8eb4ff] text-[#0c1424] hover:bg-[#a9c5ff]"
            disabled={pending !== null}
            onClick={() => void restart()}
          >
            <RotateCcw /> {pending === 'restart' ? 'Starting…' : 'Play again'}
          </Button>
        </div>
      ) : (
        <p className="mt-6 text-center text-sm text-muted-foreground">
          The host can start another game or return to the shelf.
        </p>
      )}
    </section>
  )
}

function ScoredResults({ room }: { room: RoomState }) {
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
        <Badge
          variant="outline"
          className="mb-5 border-[#d9ff43]/30 bg-[#d9ff43]/10 font-mono uppercase tracking-[0.15em] text-[#d9ff43]"
        >
          Results
        </Badge>
        <h1 className="farebi-display text-5xl font-black tracking-[-0.05em] sm:text-6xl">
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
            className={cn(
              'grid grid-cols-[32px_1fr_auto_auto] items-center gap-3 rounded-2xl border px-4 py-4',
              index === 0
                ? 'rotate-[-0.5deg] border-[#d9ff43] bg-[#d9ff43] text-[#10130c] shadow-[5px_5px_0_#ff765f]'
                : 'border-border bg-card/85',
            )}
          >
            <span
              className={cn(
                'font-mono text-sm',
                index === 0 ? 'text-[#10130c]/55' : 'text-muted-foreground',
              )}
            >
              {index + 1}
            </span>
            <div>
              <p className="font-medium">{player.name ?? 'Player'}</p>
              <p
                className={cn(
                  'mt-0.5 text-xs',
                  index === 0 ? 'text-[#10130c]/60' : 'text-muted-foreground',
                )}
              >
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
    </section>
  )
}

function PlayerRow({ player }: { player: Player }) {
  const name = player.name ?? 'Player'

  return (
    <div className="flex h-16 items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.035] px-4 transition-transform hover:-translate-y-0.5 hover:border-[#d9ff43]/25">
      <div className="grid size-9 rotate-[-3deg] place-items-center rounded-xl bg-[#d9ff43] text-xs font-black text-[#10130c]">
        {name.slice(0, 1).toUpperCase()}
      </div>
      <span className="text-sm font-medium">{name}</span>
      {player.isHost ? (
        <Crown className="ml-auto size-4 text-[#ffd84d]" />
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
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-[#10130c] px-6 py-16">
      <PartyBackdrop />
      <Card className="relative w-full max-w-sm border-[#d9ff43]/25 bg-[#171a14]/95 text-center">
        <Brand className="mx-auto" />
        <CardHeader>
          <CardTitle className="farebi-display text-3xl font-black leading-tight tracking-[-0.04em]">
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">{children}</CardContent>
      </Card>
    </main>
  )
}

function PartyBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_8%_14%,rgba(217,255,67,0.12),transparent_24%),radial-gradient(circle_at_92%_76%,rgba(255,118,95,0.11),transparent_27%),radial-gradient(circle_at_55%_105%,rgba(100,216,255,0.07),transparent_30%)]" />
      <div className="absolute -left-24 top-1/3 size-48 rotate-12 rounded-[3rem] border-[24px] border-[#d9ff43]/[0.035]" />
      <div className="absolute -right-12 top-28 size-36 rounded-full border-[18px] border-[#ff765f]/[0.045]" />
    </div>
  )
}

function RoomLoading({ label }: { label: string }) {
  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-[#10130c] px-6">
      <PartyBackdrop />
      <div className="relative text-center">
        <img
          src="/favicon-48.png"
          alt=""
          width={48}
          height={48}
          className="mx-auto size-12 animate-pulse"
        />
        <p className="mt-5 font-mono text-xs font-black uppercase tracking-[0.18em] text-[#d9ff43]">
          {label}
        </p>
      </div>
    </main>
  )
}

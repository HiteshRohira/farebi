import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Expand,
  ImageOff,
  LoaderCircle,
  RotateCcw,
  RotateCw,
  Sparkles,
  X,
} from 'lucide-react'

import type { Celebrity } from '@/lib/celebrities'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { resolveCelebrityPhoto } from '@/lib/celebrities'
import { createCelebrityDeck } from '@/lib/solo-game'
import { cn } from '@/lib/utils'

type Phase = 'intro' | 'playing' | 'finished'
type RoundStage = 'countdown' | 'guessing' | 'feedback'
type AnswerResult = 'correct' | 'skip'
type AppleNavigator = Navigator & { standalone?: boolean }
type FullscreenElement = {
  requestFullscreen?: (options?: FullscreenOptions) => Promise<void>
  webkitRequestFullscreen?: () => Promise<void> | void
}
type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null
}

const CARD_COLORS = ['#d9ff43', '#ff765f', '#64d8ff', '#ffd84d'] as const
const PHOTO_CACHE = new Map<string, Promise<string | undefined>>()

function loadCelebrityPhoto(celebrity: Celebrity) {
  const cached = PHOTO_CACHE.get(celebrity.wikipediaTitle)
  if (cached) return cached

  const request = resolveCelebrityPhoto(celebrity.wikipediaTitle).catch(
    () => undefined,
  )
  PHOTO_CACHE.set(celebrity.wikipediaTitle, request)
  return request
}

function isAppleMobile() {
  const navigatorWithStandalone = navigator as AppleNavigator
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ||
    navigatorWithStandalone.standalone === true
  )
}

function isStandalone() {
  return (
    (navigator as AppleNavigator).standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches
  )
}

export const Route = createFileRoute('/solo/whos-that')({
  component: SoloWhosThat,
})

function SoloWhosThat() {
  const [phase, setPhase] = useState<Phase>('intro')
  const [roundStage, setRoundStage] = useState<RoundStage>('countdown')
  const [current, setCurrent] = useState<Celebrity | null>(null)
  const [queued, setQueued] = useState<Celebrity | null>(null)
  const [photoUrl, setPhotoUrl] = useState<string | undefined>()
  const [photoLoading, setPhotoLoading] = useState(false)
  const [countdown, setCountdown] = useState(3)
  const [lastResult, setLastResult] = useState<AnswerResult | null>(null)
  const [correct, setCorrect] = useState(0)
  const [skipped, setSkipped] = useState(0)
  const [fullscreenHelpOpen, setFullscreenHelpOpen] = useState(false)
  const [showAppleInstallTip] = useState(
    () => isAppleMobile() && !isStandalone(),
  )
  const deck = useRef<Array<Celebrity>>([])

  const takeNextCelebrity = useCallback((previousName?: string) => {
    if (deck.current.length === 0) {
      deck.current = createCelebrityDeck(Math.random, previousName)
    }
    return deck.current.pop() ?? null
  }, [])

  const queueNextCelebrity = useCallback(
    (previousName?: string) => {
      const next = takeNextCelebrity(previousName)
      setQueued(next)
      if (next) void loadCelebrityPhoto(next)
      return next
    },
    [takeNextCelebrity],
  )

  useEffect(() => {
    if (!current) return
    let active = true
    setPhotoLoading(true)
    setPhotoUrl(undefined)

    void loadCelebrityPhoto(current).then((url) => {
      if (!active) return
      setPhotoUrl(url)
      setPhotoLoading(false)
    })

    return () => {
      active = false
    }
  }, [current])

  useEffect(() => {
    if (phase !== 'playing' || roundStage !== 'countdown') return

    const timer = window.setTimeout(() => {
      if (countdown > 1) {
        setCountdown((value) => value - 1)
        return
      }

      setCurrent(queued)
      setQueued(null)
      setLastResult(null)
      setRoundStage('guessing')
    }, 1_000)

    return () => window.clearTimeout(timer)
  }, [countdown, phase, queued, roundStage])

  const answer = useCallback(
    (result: AnswerResult) => {
      if (roundStage !== 'guessing') return
      if (result === 'correct') setCorrect((score) => score + 1)
      if (result === 'skip') setSkipped((score) => score + 1)

      setLastResult(result)
      queueNextCelebrity(current?.name)
      setRoundStage('feedback')
    },
    [current?.name, queueNextCelebrity, roundStage],
  )

  const beginCountdown = useCallback(() => {
    if (!queued) return
    setCountdown(3)
    setRoundStage('countdown')
  }, [queued])

  useEffect(() => {
    if (phase !== 'playing') return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (roundStage === 'guessing') {
        if (event.key === 'ArrowRight' || event.key === 'Enter') {
          event.preventDefault()
          answer('correct')
        }
        if (event.key === 'ArrowLeft') {
          event.preventDefault()
          answer('skip')
        }
      } else if (roundStage === 'feedback' && event.key === 'Enter') {
        event.preventDefault()
        beginCountdown()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [answer, beginCountdown, phase, roundStage])

  async function requestLandscape() {
    const element = document.documentElement as unknown as FullscreenElement
    const fullscreenDocument = document as FullscreenDocument

    const isFullscreen = () =>
      Boolean(
        fullscreenDocument.fullscreenElement ??
        fullscreenDocument.webkitFullscreenElement,
      )

    if (!isFullscreen()) {
      if (element.requestFullscreen) {
        try {
          await element.requestFullscreen({ navigationUI: 'hide' })
        } catch {
          try {
            await element.requestFullscreen()
          } catch {
            // Some Safari versions expose this method but only accept the prefix.
          }
        }
      }

      if (!isFullscreen() && element.webkitRequestFullscreen) {
        try {
          await element.webkitRequestFullscreen()
        } catch {
          // Safari on iPhone offers a chrome-free view as a Home Screen app.
        }
      }
    }

    try {
      await screen.orientation.lock('landscape')
    } catch {
      // Safari may require the player to rotate manually.
    }

    return isFullscreen() || isStandalone()
  }

  async function openFullscreen() {
    const enteredFullscreen = await requestLandscape()
    if (!enteredFullscreen) setFullscreenHelpOpen(true)
  }

  function start() {
    // Keep this first: mobile browsers require fullscreen during the tap itself.
    void requestLandscape()
    setCorrect(0)
    setSkipped(0)
    setCurrent(null)
    setLastResult(null)
    deck.current = createCelebrityDeck()
    const first = deck.current.pop() ?? null
    setQueued(first)
    if (first) void loadCelebrityPhoto(first)
    setCountdown(3)
    setRoundStage('countdown')
    setPhase('playing')
  }

  if (phase === 'intro') {
    return (
      <SoloIntro showAppleInstallTip={showAppleInstallTip} onStart={start} />
    )
  }

  if (phase === 'finished') {
    return <SoloResults correct={correct} skipped={skipped} onRestart={start} />
  }

  const colorIndex = current ? current.name.length % CARD_COLORS.length : 0
  const accent = CARD_COLORS[colorIndex]

  return (
    <div
      className="fixed inset-0 h-[100dvh] max-h-[100dvh] overflow-hidden bg-[#0e100c] text-white select-none"
      style={{ '--solo-accent': accent } as React.CSSProperties}
    >
      <div className="solo-portrait-guard fixed inset-0 z-50 flex-col items-center justify-center bg-[#d9ff43] px-8 text-center text-[#10130c]">
        <RotateCw className="size-14 animate-pulse" />
        <h2 className="farebi-display mt-5 text-4xl font-black">
          Turn it sideways
        </h2>
        <p className="mt-3 max-w-xs leading-6 text-[#10130c]/70">
          Hold your phone sideways to keep playing.
        </p>
      </div>

      <FullscreenHelp
        open={fullscreenHelpOpen}
        appleDevice={showAppleInstallTip}
        onOpenChange={setFullscreenHelpOpen}
      />

      <div className="grid h-full grid-rows-[minmax(0,1fr)_52px] gap-1.5 p-1.5 [padding-bottom:max(0.375rem,env(safe-area-inset-bottom))]">
        <main
          className={cn(
            'min-h-0 overflow-hidden rounded-[1.2rem] sm:rounded-[1.5rem]',
            roundStage === 'guessing' &&
              'grid bg-[var(--solo-accent)] sm:grid-cols-[42%_1fr]',
            roundStage === 'feedback' &&
              (lastResult === 'correct'
                ? 'bg-[#d9ff43] text-[#10130c]'
                : 'bg-[#ff765f] text-[#10130c]'),
            roundStage === 'countdown' && 'bg-[#171a14] text-white',
          )}
          aria-live="polite"
        >
          {roundStage === 'guessing' ? (
            <GuessingCard
              celebrity={current}
              photoUrl={photoUrl}
              photoLoading={photoLoading}
              onPhotoError={() => setPhotoUrl(undefined)}
            />
          ) : null}

          {roundStage === 'feedback' && lastResult ? (
            <Feedback result={lastResult} celebrity={current} />
          ) : null}

          {roundStage === 'countdown' ? <Countdown value={countdown} /> : null}
        </main>

        <GameDock
          stage={roundStage}
          correct={correct}
          skipped={skipped}
          onPass={() => answer('skip')}
          onCorrect={() => answer('correct')}
          onNext={beginCountdown}
          onFullscreen={() => void openFullscreen()}
          onEnd={() => setPhase('finished')}
        />
      </div>
    </div>
  )
}

function GuessingCard({
  celebrity,
  photoUrl,
  photoLoading,
  onPhotoError,
}: {
  celebrity: Celebrity | null
  photoUrl: string | undefined
  photoLoading: boolean
  onPhotoError: () => void
}) {
  return (
    <>
      <div className="relative hidden min-h-0 overflow-hidden bg-black/10 sm:block">
        {photoLoading ? (
          <div className="grid h-full place-items-center">
            <LoaderCircle className="size-8 animate-spin text-[#10130c]/45" />
          </div>
        ) : photoUrl ? (
          <img
            src={photoUrl}
            alt={celebrity?.name ?? ''}
            className="h-full w-full object-cover object-top grayscale"
            draggable={false}
            onError={onPhotoError}
          />
        ) : (
          <div className="grid h-full place-items-center text-[#10130c]/35">
            <ImageOff className="size-12" />
          </div>
        )}
        <div className="absolute inset-y-0 right-0 w-12 bg-gradient-to-r from-transparent to-black/10" />
      </div>

      <div className="relative flex min-w-0 flex-col items-center justify-center px-4 text-center text-[#10130c] sm:px-7">
        <p className="font-mono text-[9px] font-black uppercase tracking-[0.24em] opacity-55 sm:text-[11px]">
          Who am I?
        </p>
        <h1 className="farebi-display mt-1.5 max-w-full text-[clamp(2.35rem,7.4vw,6.4rem)] font-black leading-[0.84] tracking-[-0.06em] text-balance">
          {celebrity?.name}
        </h1>
      </div>
    </>
  )
}

function Feedback({
  result,
  celebrity,
}: {
  result: AnswerResult
  celebrity: Celebrity | null
}) {
  const isCorrect = result === 'correct'

  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <span className="grid size-10 place-items-center rounded-full bg-[#10130c] text-white sm:size-12">
        {isCorrect ? (
          <Check className="size-5 sm:size-6" />
        ) : (
          <RotateCcw className="size-5 sm:size-6" />
        )}
      </span>
      <p className="mt-3 font-mono text-[10px] font-black uppercase tracking-[0.22em] opacity-55">
        {isCorrect ? 'That’s a point' : 'No worries'}
      </p>
      <h1 className="farebi-display mt-1 text-[clamp(2.8rem,8vw,6rem)] font-black leading-none tracking-[-0.05em]">
        {isCorrect ? 'Nailed it!' : 'Shake it off.'}
      </h1>
      <p className="mt-2 text-sm font-semibold opacity-55">{celebrity?.name}</p>
    </div>
  )
}

function Countdown({ value }: { value: number }) {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <p className="font-mono text-[10px] font-black uppercase tracking-[0.24em] text-[#d9ff43]">
        Phone up
      </p>
      <p
        key={value}
        className="farebi-display solo-countdown-pop mt-1 text-[clamp(6rem,25vh,13rem)] font-black leading-[0.8] tracking-[-0.08em]"
      >
        {value}
      </p>
      <p className="mt-2 text-xs font-semibold text-white/40">
        Get ready to guess
      </p>
    </div>
  )
}

function GameDock({
  stage,
  correct,
  skipped,
  onPass,
  onCorrect,
  onNext,
  onFullscreen,
  onEnd,
}: {
  stage: RoundStage
  correct: number
  skipped: number
  onPass: () => void
  onCorrect: () => void
  onNext: () => void
  onFullscreen: () => void
  onEnd: () => void
}) {
  return (
    <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] gap-1.5 rounded-xl bg-[#181b16] p-1 sm:rounded-2xl">
      <div className="flex items-center gap-2 px-2 font-mono text-[10px] font-black uppercase tracking-[0.1em] sm:gap-3 sm:px-3 sm:text-xs">
        <span className="text-[#d9ff43]">{correct} right</span>
        <span className="text-white/35">{skipped} passed</span>
      </div>

      <div className="min-w-0">
        {stage === 'guessing' ? (
          <div className="grid h-full grid-cols-2 gap-1.5">
            <button
              type="button"
              className="flex min-w-0 items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-[11px] font-black uppercase tracking-[0.12em] text-white/70 active:scale-[0.99] sm:rounded-xl sm:text-xs"
              onClick={onPass}
            >
              <RotateCcw className="size-4" /> Pass
            </button>
            <button
              type="button"
              className="flex min-w-0 items-center justify-center gap-1.5 rounded-lg bg-white px-3 text-[11px] font-black uppercase tracking-[0.12em] text-[#10130c] active:scale-[0.99] sm:rounded-xl sm:text-xs"
              onClick={onCorrect}
            >
              Got it <Check className="size-4" />
            </button>
          </div>
        ) : stage === 'feedback' ? (
          <button
            type="button"
            className="flex h-full w-full items-center justify-center gap-2 rounded-lg bg-[#d9ff43] px-5 text-xs font-black uppercase tracking-[0.13em] text-[#10130c] active:scale-[0.99] sm:rounded-xl"
            onClick={onNext}
          >
            Next <ArrowRight className="size-4" />
          </button>
        ) : (
          <div className="flex h-full items-center justify-center font-mono text-[10px] font-black uppercase tracking-[0.18em] text-white/35">
            Get ready
          </div>
        )}
      </div>

      <div className="flex items-center gap-0.5">
        <button
          type="button"
          aria-label="Enter fullscreen"
          className="grid size-10 place-items-center rounded-lg text-white/45 hover:bg-white/5 hover:text-white sm:rounded-xl"
          onClick={onFullscreen}
        >
          <Expand className="size-4" />
        </button>
        <button
          type="button"
          aria-label="End round"
          className="grid size-10 place-items-center rounded-lg text-white/45 hover:bg-white/5 hover:text-white sm:rounded-xl"
          onClick={onEnd}
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  )
}

function FullscreenHelp({
  open,
  appleDevice,
  onOpenChange,
}: {
  open: boolean
  appleDevice: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-3 border-white/12 bg-[#10130c] p-4 text-white sm:p-5">
        <DialogHeader className="gap-1.5">
          <p className="font-mono text-[10px] font-black uppercase tracking-[0.2em] text-[#d9ff43]">
            Full-screen view
          </p>
          <DialogTitle className="farebi-display text-2xl font-black tracking-[-0.03em]">
            Add Farebi to your Home Screen
          </DialogTitle>
          <DialogDescription className="leading-5">
            {appleDevice
              ? 'Safari and Brave can’t hide their bars from a regular iPhone or iPad tab. Open Farebi from your Home Screen instead.'
              : 'This browser blocked full screen. Opening Farebi from your Home Screen gives the game more room.'}
          </DialogDescription>
        </DialogHeader>

        <ol className="grid grid-cols-3 gap-2 text-center font-mono text-[9px] font-black uppercase tracking-[0.08em] text-white/70 sm:text-[10px]">
          <li className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-2.5">
            <span className="block text-[#d9ff43]">1</span>
            Tap Share
          </li>
          <li className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-2.5">
            <span className="block text-[#d9ff43]">2</span>
            Add to Home Screen
          </li>
          <li className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-2.5">
            <span className="block text-[#d9ff43]">3</span>
            Open Farebi
          </li>
        </ol>

        <DialogClose asChild>
          <button
            type="button"
            className="mt-1 h-10 rounded-lg bg-[#d9ff43] text-xs font-black uppercase tracking-[0.12em] text-[#10130c]"
          >
            Got it
          </button>
        </DialogClose>
      </DialogContent>
    </Dialog>
  )
}

function SoloIntro({
  showAppleInstallTip,
  onStart,
}: {
  showAppleInstallTip: boolean
  onStart: () => void
}) {
  return (
    <div className="relative grid min-h-[100dvh] place-items-center overflow-hidden bg-[#d9ff43] px-6 py-12 text-[#10130c]">
      <div className="absolute -left-16 -top-16 size-56 rounded-full border-[34px] border-[#10130c]/8" />
      <div className="absolute -bottom-20 -right-12 size-64 rotate-12 rounded-[3rem] bg-[#ff765f]" />
      <div className="relative w-full max-w-xl text-center">
        <Link
          to="/"
          className="absolute -top-10 left-0 flex items-center gap-2 text-sm font-bold opacity-60 hover:opacity-100 sm:-top-14"
        >
          <ArrowLeft className="size-4" /> Games
        </Link>
        <span className="inline-flex rotate-[-2deg] items-center gap-2 rounded-full bg-[#10130c] px-4 py-2 font-mono text-xs font-black uppercase tracking-[0.18em] text-white">
          <Sparkles className="size-4 text-[#d9ff43]" /> Solo mode
        </span>
        <h1 className="farebi-display mt-6 text-6xl font-black leading-[0.85] tracking-[-0.06em] sm:text-8xl">
          Who’s
          <br />
          That?
        </h1>
        <p className="mx-auto mt-6 max-w-md text-base font-medium leading-7 text-[#10130c]/70 sm:text-lg">
          Turn your phone sideways and hold it over your head. Everyone else
          sees a famous face and helps you guess.
        </p>
        <div className="mx-auto mt-7 grid max-w-md grid-cols-3 gap-2 font-mono text-[10px] font-black uppercase tracking-[0.1em] sm:text-xs">
          <span className="rounded-xl border border-[#10130c]/20 px-2 py-3">
            1 · Rotate
          </span>
          <span className="rounded-xl border border-[#10130c]/20 px-2 py-3">
            2 · Hold up
          </span>
          <span className="rounded-xl border border-[#10130c]/20 px-2 py-3">
            3 · Guess
          </span>
        </div>
        <button
          type="button"
          className="mt-7 inline-flex h-14 items-center gap-3 rounded-full bg-[#10130c] px-8 text-base font-black text-white shadow-[6px_6px_0_rgba(255,118,95,1)] transition-transform hover:-translate-y-0.5 active:translate-y-0"
          onClick={onStart}
        >
          Start now <RotateCw className="size-5" />
        </button>
        {showAppleInstallTip ? (
          <p className="mx-auto mt-5 max-w-sm text-xs font-semibold leading-5 text-[#10130c]/55">
            For a full-screen view on iPhone or iPad, tap Share, then Add to
            Home Screen.
          </p>
        ) : (
          <p className="mt-5 text-xs font-semibold text-[#10130c]/45">
            One phone · endless famous faces
          </p>
        )}
      </div>
    </div>
  )
}

function SoloResults({
  correct,
  skipped,
  onRestart,
}: {
  correct: number
  skipped: number
  onRestart: () => void
}) {
  return (
    <div className="grid min-h-[100dvh] place-items-center bg-[#10130c] px-6 py-12 text-white">
      <div className="w-full max-w-lg text-center">
        <p className="font-mono text-xs font-black uppercase tracking-[0.24em] text-[#d9ff43]">
          Round over
        </p>
        <h1 className="farebi-display mt-4 text-5xl font-black tracking-[-0.05em] sm:text-7xl">
          Nice guessing.
        </h1>
        <div className="mt-10 grid grid-cols-2 overflow-hidden rounded-[1.5rem] border border-white/12">
          <div className="bg-[#d9ff43] p-7 text-[#10130c]">
            <p className="farebi-display text-5xl font-black">{correct}</p>
            <p className="mt-1 font-mono text-xs font-black uppercase tracking-[0.16em] opacity-55">
              Got right
            </p>
          </div>
          <div className="p-7">
            <p className="farebi-display text-5xl font-black">{skipped}</p>
            <p className="mt-1 font-mono text-xs font-black uppercase tracking-[0.16em] text-white/45">
              Passed
            </p>
          </div>
        </div>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <button
            type="button"
            className="inline-flex h-13 items-center justify-center gap-2 rounded-full bg-white px-7 font-black text-[#10130c]"
            onClick={onRestart}
          >
            <RotateCcw className="size-5" /> Play again
          </button>
          <Link
            to="/"
            className="inline-flex h-13 items-center justify-center rounded-full border border-white/15 px-7 font-bold text-white/70 hover:text-white"
          >
            Back to games
          </Link>
        </div>
      </div>
    </div>
  )
}

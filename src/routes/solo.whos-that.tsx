import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import {
  ArrowLeft,
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
import { resolveCelebrityPhoto } from '@/lib/celebrities'
import { createCelebrityDeck } from '@/lib/solo-game'

type Phase = 'intro' | 'playing' | 'finished'

const CARD_COLORS = ['#d9ff43', '#ff765f', '#64d8ff', '#ffd84d'] as const

export const Route = createFileRoute('/solo/whos-that')({
  component: SoloWhosThat,
})

function SoloWhosThat() {
  const [phase, setPhase] = useState<Phase>('intro')
  const [current, setCurrent] = useState<Celebrity | null>(null)
  const [photoUrl, setPhotoUrl] = useState<string | undefined>()
  const [photoLoading, setPhotoLoading] = useState(false)
  const [correct, setCorrect] = useState(0)
  const [skipped, setSkipped] = useState(0)
  const deck = useRef<Array<Celebrity>>([])

  const draw = useCallback(
    (result?: 'correct' | 'skip') => {
      if (result === 'correct') setCorrect((score) => score + 1)
      if (result === 'skip') setSkipped((score) => score + 1)

      if (deck.current.length === 0) {
        deck.current = createCelebrityDeck(Math.random, current?.name)
      }
      setCurrent(deck.current.pop() ?? null)
    },
    [current?.name],
  )

  useEffect(() => {
    if (!current) return
    let active = true
    setPhotoLoading(true)
    setPhotoUrl(undefined)

    void resolveCelebrityPhoto(current.wikipediaTitle)
      .then((url) => {
        if (active) setPhotoUrl(url)
      })
      .catch(() => {
        if (active) setPhotoUrl(undefined)
      })
      .finally(() => {
        if (active) setPhotoLoading(false)
      })

    return () => {
      active = false
    }
  }, [current])

  useEffect(() => {
    if (phase !== 'playing') return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight' || event.key === 'Enter') {
        event.preventDefault()
        draw('correct')
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        draw('skip')
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [draw, phase])

  async function requestLandscape() {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen()
      }
    } catch {
      // Fullscreen is best-effort on mobile browsers.
    }
    try {
      await screen.orientation.lock('landscape')
    } catch {
      // iOS and some browsers require the player to rotate manually.
    }
  }

  function start() {
    setCorrect(0)
    setSkipped(0)
    deck.current = createCelebrityDeck()
    setCurrent(deck.current.pop() ?? null)
    setPhase('playing')
    void requestLandscape()
  }

  if (phase === 'intro') {
    return <SoloIntro onStart={start} />
  }

  if (phase === 'finished') {
    return <SoloResults correct={correct} skipped={skipped} onRestart={start} />
  }

  const colorIndex = current ? current.name.length % CARD_COLORS.length : 0
  const accent = CARD_COLORS[colorIndex]

  return (
    <div
      className="relative min-h-[100svh] overflow-hidden bg-[#0e100c] text-white select-none"
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

      <div className="grid h-[100svh] grid-rows-[44px_1fr_64px] p-2 sm:grid-rows-[52px_1fr_76px] sm:p-3">
        <header className="flex items-center justify-between px-2">
          <div className="flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-[0.16em]">
            <span className="rounded-full bg-[#d9ff43] px-3 py-1 text-[#10130c]">
              {correct} right
            </span>
            <span className="text-white/45">{skipped} passed</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Enter fullscreen"
              className="grid size-9 place-items-center rounded-full text-white/60 hover:bg-white/10 hover:text-white"
              onClick={() => void requestLandscape()}
            >
              <Expand className="size-4" />
            </button>
            <button
              type="button"
              className="flex h-9 items-center gap-2 rounded-full px-3 text-xs font-bold text-white/60 hover:bg-white/10 hover:text-white"
              onClick={() => setPhase('finished')}
            >
              End <X className="size-4" />
            </button>
          </div>
        </header>

        <main
          className="grid min-h-0 overflow-hidden rounded-[1.25rem] sm:grid-cols-[43%_1fr] sm:rounded-[1.75rem]"
          style={{ backgroundColor: accent }}
          aria-live="polite"
        >
          <div className="relative hidden min-h-0 overflow-hidden bg-black/10 sm:block">
            {photoLoading ? (
              <div className="grid h-full place-items-center">
                <LoaderCircle className="size-8 animate-spin text-[#10130c]/45" />
              </div>
            ) : photoUrl ? (
              <img
                src={photoUrl}
                alt={current?.name ?? ''}
                className="h-full w-full object-cover object-top grayscale"
                draggable={false}
                onError={() => setPhotoUrl(undefined)}
              />
            ) : (
              <div className="grid h-full place-items-center text-[#10130c]/35">
                <ImageOff className="size-12" />
              </div>
            )}
            <div className="absolute inset-y-0 right-0 w-16 bg-gradient-to-r from-transparent to-black/10" />
          </div>

          <div className="relative flex min-w-0 flex-col items-center justify-center px-5 text-center text-[#10130c] sm:px-8">
            <p className="font-mono text-[10px] font-black uppercase tracking-[0.24em] opacity-55 sm:text-xs">
              Who am I?
            </p>
            <h1 className="farebi-display mt-2 max-w-full text-[clamp(2.6rem,8.5vw,7rem)] font-black leading-[0.86] tracking-[-0.06em] text-balance">
              {current?.name}
            </h1>
            <p className="mt-4 hidden text-xs font-semibold opacity-55 md:block">
              Friends: give clues, but don’t say the name
            </p>
          </div>
        </main>

        <div className="grid grid-cols-2 gap-2 pt-2 sm:gap-3 sm:pt-3">
          <button
            type="button"
            className="flex items-center justify-center gap-2 rounded-xl border border-white/12 bg-white/[0.06] text-sm font-black uppercase tracking-[0.14em] text-white/75 active:scale-[0.99] sm:rounded-2xl"
            onClick={() => draw('skip')}
          >
            <RotateCcw className="size-5" /> Pass
          </button>
          <button
            type="button"
            className="flex items-center justify-center gap-2 rounded-xl bg-white text-sm font-black uppercase tracking-[0.14em] text-[#10130c] active:scale-[0.99] sm:rounded-2xl"
            onClick={() => draw('correct')}
          >
            Got it <Check className="size-5" />
          </button>
        </div>
      </div>
    </div>
  )
}

function SoloIntro({ onStart }: { onStart: () => void }) {
  return (
    <div className="relative grid min-h-[100svh] place-items-center overflow-hidden bg-[#d9ff43] px-6 py-12 text-[#10130c]">
      <div className="absolute -left-16 -top-16 size-56 rounded-full border-[34px] border-[#10130c]/8" />
      <div className="absolute -bottom-20 -right-12 size-64 rotate-12 rounded-[3rem] bg-[#ff765f]" />
      <div className="relative w-full max-w-xl text-center">
        <Link
          to="/"
          className="absolute -top-14 left-0 flex items-center gap-2 text-sm font-bold opacity-60 hover:opacity-100"
        >
          <ArrowLeft className="size-4" /> Games
        </Link>
        <span className="inline-flex rotate-[-2deg] items-center gap-2 rounded-full bg-[#10130c] px-4 py-2 font-mono text-xs font-black uppercase tracking-[0.18em] text-white">
          <Sparkles className="size-4 text-[#d9ff43]" /> Solo mode
        </span>
        <h1 className="farebi-display mt-7 text-6xl font-black leading-[0.85] tracking-[-0.06em] sm:text-8xl">
          Who’s
          <br />
          That?
        </h1>
        <p className="mx-auto mt-7 max-w-md text-base font-medium leading-7 text-[#10130c]/70 sm:text-lg">
          Turn your phone sideways and hold it over your head. Everyone else
          sees a random famous face and helps you guess.
        </p>
        <div className="mx-auto mt-8 grid max-w-md grid-cols-3 gap-2 font-mono text-[10px] font-black uppercase tracking-[0.1em] sm:text-xs">
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
          className="mt-8 inline-flex h-14 items-center gap-3 rounded-full bg-[#10130c] px-8 text-base font-black text-white shadow-[6px_6px_0_rgba(255,118,95,1)] transition-transform hover:-translate-y-0.5 active:translate-y-0"
          onClick={onStart}
        >
          Start now <RotateCw className="size-5" />
        </button>
        <p className="mt-5 text-xs font-semibold text-[#10130c]/45">
          One phone · endless famous faces
        </p>
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
    <div className="grid min-h-[100svh] place-items-center bg-[#10130c] px-6 py-12 text-white">
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

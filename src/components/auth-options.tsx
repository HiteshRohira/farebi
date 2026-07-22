import { useState } from 'react'
import type { FormEvent } from 'react'
import { ArrowRight, UserRound } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { signInAnonymously, useFarebiAuth } from '@/lib/auth-client'

export function AuthOptions() {
  const auth = useFarebiAuth()
  const [pending, setPending] = useState(false)

  async function signInWithGoogle() {
    setPending(true)
    try {
      await auth.signIn()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Sign-in failed.')
      setPending(false)
    }
  }

  return (
    <div className="grid gap-5">
      <NameSignIn />
      <div className="flex items-center gap-3 text-xs uppercase tracking-[0.18em] text-muted-foreground">
        <span className="h-px flex-1 bg-border" /> or{' '}
        <span className="h-px flex-1 bg-border" />
      </div>
      <Button
        variant="outline"
        size="lg"
        className="w-full"
        disabled={pending}
        onClick={() => void signInWithGoogle()}
      >
        {pending ? 'Opening Google…' : 'Continue with Google'}
        <ArrowRight />
      </Button>
    </div>
  )
}

function NameSignIn() {
  const [name, setName] = useState('')
  const [pending, setPending] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    try {
      await signInAnonymously(name)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Could not create a guest.',
      )
      setPending(false)
    }
  }

  return (
    <form className="grid gap-3" onSubmit={(event) => void submit(event)}>
      <label className="grid gap-2 text-sm font-medium">
        Your name
        <Input
          id="player-name"
          aria-label="Your name"
          placeholder="Enter your name"
          value={name}
          minLength={2}
          maxLength={40}
          autoComplete="nickname"
          disabled={pending}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <Button
        type="submit"
        size="lg"
        className="w-full"
        disabled={pending || name.trim().length < 2}
      >
        <UserRound /> {pending ? 'Joining…' : 'Continue with name'}
      </Button>
    </form>
  )
}

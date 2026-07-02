import { useState } from 'react'
import type { FormEvent } from 'react'
import { ArrowRight, UserRound } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useFarebiAuth } from '@/lib/auth-client'

export function AuthOptions() {
  const auth = useFarebiAuth()
  const [name, setName] = useState('')
  const [pending, setPending] = useState<'google' | 'guest' | null>(null)

  async function signInWithGoogle() {
    setPending('google')
    try {
      await auth.signIn()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Sign-in failed.')
      setPending(null)
    }
  }

  async function signInAsGuest(event: FormEvent) {
    event.preventDefault()
    setPending('guest')
    try {
      await auth.signInAnonymously(name)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Could not create a guest.',
      )
      setPending(null)
    }
  }

  return (
    <div className="grid gap-5">
      <Button
        size="lg"
        className="w-full"
        disabled={pending !== null}
        onClick={() => void signInWithGoogle()}
      >
        {pending === 'google' ? 'Opening Google…' : 'Continue with Google'}
        <ArrowRight />
      </Button>
      <div className="flex items-center gap-3 text-xs uppercase tracking-[0.18em] text-muted-foreground">
        <span className="h-px flex-1 bg-border" /> or play locally{' '}
        <span className="h-px flex-1 bg-border" />
      </div>
      <form
        className="flex gap-2"
        onSubmit={(event) => void signInAsGuest(event)}
      >
        <Input
          aria-label="Your name"
          placeholder="Your name"
          value={name}
          minLength={2}
          maxLength={40}
          autoComplete="nickname"
          disabled={pending !== null}
          onChange={(event) => setName(event.target.value)}
        />
        <Button
          type="submit"
          variant="outline"
          size="lg"
          disabled={pending !== null || name.trim().length < 2}
        >
          <UserRound /> {pending === 'guest' ? 'Joining…' : 'Play'}
        </Button>
      </form>
    </div>
  )
}

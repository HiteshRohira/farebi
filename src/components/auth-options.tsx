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
      <Button
        size="lg"
        className="w-full"
        disabled={pending}
        onClick={() => void signInWithGoogle()}
      >
        {pending ? 'Opening Google…' : 'Continue with Google'}
        <ArrowRight />
      </Button>
      {import.meta.env.DEV ? <LocalGuestSignIn /> : null}
    </div>
  )
}

function LocalGuestSignIn() {
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
    <>
      <div className="flex items-center gap-3 text-xs uppercase tracking-[0.18em] text-muted-foreground">
        <span className="h-px flex-1 bg-border" /> or play locally{' '}
        <span className="h-px flex-1 bg-border" />
      </div>
      <form className="flex gap-2" onSubmit={(event) => void submit(event)}>
        <Input
          aria-label="Your name"
          placeholder="Your name"
          value={name}
          minLength={2}
          maxLength={40}
          autoComplete="nickname"
          disabled={pending}
          onChange={(event) => setName(event.target.value)}
        />
        <Button
          type="submit"
          variant="outline"
          size="lg"
          disabled={pending || name.trim().length < 2}
        >
          <UserRound /> {pending ? 'Joining…' : 'Play'}
        </Button>
      </form>
    </>
  )
}

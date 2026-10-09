'use client'

import { useActionState } from 'react'
import { logout } from '@/app/login/actions'

export default function SignOutButton() {
  const [state, action, pending] = useActionState(logout, null)
  return <form action={action}><button type="submit" disabled={pending} aria-busy={pending}>{pending ? 'Signing out…' : 'Sign out'}</button>{state?.error && <p className="sign-out-error" role="alert">{state.error}</p>}</form>
}

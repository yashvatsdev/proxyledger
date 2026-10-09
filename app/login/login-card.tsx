'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { motion, useReducedMotion } from 'motion/react'
import { ArrowLeft, ArrowRight, CircleAlert, LoaderCircle } from 'lucide-react'
import { loginWithGoogle } from './actions'

export default function LoginCard({ initialError }: { initialError: string | null }) {
  const [state, action, pending] = useActionState(loginWithGoogle, null)
  const reducedMotion = useReducedMotion()
  const error = state?.error || initialError
  return (
    <main className="auth-shell">
      <motion.section className="auth-card" aria-labelledby="welcome-heading" initial={{ opacity: 0, y: reducedMotion ? 0 : 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
        <Link href="/" className="brand-row auth-brand" aria-label="Proxy Ledger homepage"><div className="brand-mark"><ArrowRight aria-hidden="true" /></div><div><strong>proxyledger</strong><span>your favor network</span></div></Link>
        <span className="auth-kicker">YOUR CIRCLE STARTS HERE</span>
        <h1 id="welcome-heading">Welcome to<br /><em>Proxy Ledger.</em></h1>
        <p>Every favor, accounted for. Sign in to keep up with your circle.</p>
        <form action={action}>
          <motion.button type="submit" className="button primary auth-google" disabled={pending} aria-busy={pending} whileHover={reducedMotion || pending ? undefined : { y: -2 }} whileTap={reducedMotion || pending ? undefined : { scale: 0.98 }}>
            {pending ? <LoaderCircle className="auth-spinner" aria-hidden="true" /> : <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor"><path d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-1.99 3.02v2.51h3.23c1.89-1.74 2.98-4.31 2.98-7.36ZM12 22c2.7 0 4.96-.9 6.62-2.41l-3.23-2.51c-.9.6-2.05.96-3.39.96-2.61 0-4.82-1.76-5.61-4.12H3.05v2.59A10 10 0 0 0 12 22ZM6.39 13.92a6 6 0 0 1 0-3.84V7.49H3.05a10 10 0 0 0 0 9.02l3.34-2.59ZM12 5.96c1.47 0 2.79.51 3.83 1.51l2.87-2.87A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.95 5.49l3.34 2.59A5.92 5.92 0 0 1 12 5.96Z" /></svg>}
            {pending ? 'Connecting to Google…' : 'Continue with Google'}
          </motion.button>
        </form>
        {error && <div className="auth-error" role="alert"><CircleAlert aria-hidden="true" /><span>{error}</span></div>}
        <p className="auth-note">New here? Your account is created when you first sign in.</p>
        <Link className="auth-back" href="/"><ArrowLeft aria-hidden="true" /> Back to homepage</Link>
      </motion.section>
    </main>
  )
}

'use client'

export default function AppError({ reset }: { reset: () => void }) {
  return <main className="auth-shell"><section className="auth-card"><h1>Temporarily unavailable</h1><p>Please try loading your workspace again in a moment.</p><button className="button primary" onClick={reset}>Try again</button></section></main>
}

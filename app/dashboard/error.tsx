'use client'

import Link from 'next/link'

export default function DashboardError({ reset }: { reset: () => void }) {
  return <div className="page-content"><section className="panel circle-empty" role="alert"><h1>Your workspace is temporarily unavailable</h1><p>Please try again in a moment. Your saved history remains in your account.</p><div className="circle-card-actions"><button className="button primary" onClick={reset}>Try again</button><Link className="button outline" href="/dashboard">Return to overview</Link></div></section></div>
}

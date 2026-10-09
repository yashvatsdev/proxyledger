'use client'

export default function DashboardError({ reset }: { reset: () => void }) {
  return <div className="page-content"><section className="panel circle-empty"><h2>Your workspace is temporarily unavailable</h2><p>Please try again in a moment.</p><button className="button primary" onClick={reset}>Try again</button></section></div>
}

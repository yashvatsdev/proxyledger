import Link from 'next/link'

export default function DashboardNotFound() {
  return <div className="page-content"><section className="panel circle-empty"><h1>This page is unavailable</h1><p>The record may be unavailable to your account, or the link may be incorrect.</p><Link className="button primary" href="/dashboard">Return to your overview</Link></section></div>
}

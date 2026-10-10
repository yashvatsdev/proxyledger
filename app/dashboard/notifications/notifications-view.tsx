'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Bell } from 'lucide-react'
import { markNotificationRead } from '../friends/actions'
import { activityTimestamp } from '@/lib/display'

type Notice = { id: string; title: string; message: string; readAt: string | null; createdAt: string; href: string }
export default function NotificationsView({ rows, count, page }: { rows: Notice[]; count: number; page: number }) {
  const [pending, startTransition] = useTransition()
  const [active, setActive] = useState<{ id: string; opening: boolean } | null>(null)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const router = useRouter()
  function read(id: string, href?: string) {
    setActive({ id, opening: Boolean(href) }); setError(''); setFeedback('')
    startTransition(async () => {
      try {
        const result = await markNotificationRead(id)
        if (!result.ok) { setError(result.error); return }
        setFeedback('Notification marked as read.')
        if (href) router.push(href)
        else router.refresh()
      } catch { setError('Could not connect. Please try again.') }
    })
  }
  return <div className="page-content circle-page"><div className="hero-row"><div><h1>Notifications</h1><p>Invitations, favor updates and settlements from your circle.</p></div></div>
    {error && <p className="circle-feedback" role="alert">{error}</p>}{feedback && <p className="circle-feedback" role="status">{feedback}</p>}
    <section className="panel" aria-label="Your notifications" aria-busy={pending}>{rows.map(row => <article className={`circle-notice ${!row.readAt ? 'unread' : ''}`} key={row.id}><Bell aria-hidden="true" /><div><h2>{row.title}</h2><p>{row.message}</p><small><time dateTime={row.createdAt}>{activityTimestamp(row.createdAt)} · India time</time></small><div className="circle-card-actions">{row.readAt ? <Link className="text-button" href={row.href}>View update</Link> : <><button className="text-button" disabled={pending} onClick={() => read(row.id, row.href)}>{pending && active?.id === row.id && active.opening ? 'Opening…' : 'View update'}</button><button className="text-button" disabled={pending} onClick={() => read(row.id)}>{pending && active?.id === row.id && !active.opening ? 'Marking read…' : 'Mark as read'}</button></>}</div></div>{!row.readAt && <span className="circle-badge">New</span>}</article>)}{!rows.length && <div className="circle-empty"><Bell aria-hidden="true" /><h2>You’re all caught up</h2><p>Invitations, favor updates and settlements will appear here.</p><Link className="button primary" href="/dashboard/friends">Explore your circle</Link></div>}</section>
    <nav className="circle-pagination" aria-label="Notification pages"><span>{count ? `Page ${page} · ${count} notifications` : 'No notifications yet'}</span>{page > 1 && <Link className="button outline" href={`/dashboard/notifications?page=${page - 1}`}>Previous</Link>}{page * 20 < count && <Link className="button outline" href={`/dashboard/notifications?page=${page + 1}`}>Next</Link>}</nav>
  </div>
}

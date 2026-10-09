'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Bell } from 'lucide-react'
import { markNotificationRead } from '../friends/actions'

type Notice = { id: string; title: string; message: string; readAt: string | null; createdAt: string; href: string }
export default function NotificationsView({ rows, count, page }: { rows: Notice[]; count: number; page: number }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const router = useRouter()
  function read(id: string, href?: string) {
    startTransition(async () => {
      try {
      const result = await markNotificationRead(id)
      if (!result.ok) { setError(result.error); return }
      setError(''); router.refresh()
      if (href) router.push(href)
      } catch { setError('Could not connect. Please try again.') }
    })
  }
  return <div className="page-content circle-page"><div className="hero-row"><div><h1>Notifications</h1><p>Invitations and updates from your circle.</p></div></div>{error && <p className="circle-feedback" role="alert">{error}</p>}<section className="panel">{rows.map((row) => <article className={`circle-notice ${!row.readAt ? 'unread' : ''}`} key={row.id}><Bell aria-hidden="true" /><div><h2>{row.title}</h2><p>{row.message}</p><small>{new Date(row.createdAt).toLocaleDateString('en', { timeZone: 'Asia/Calcutta' })}</small><div className="circle-card-actions">{row.readAt ? <Link className="text-button" href={row.href}>View update</Link> : <><button className="text-button" disabled={pending} onClick={() => read(row.id, row.href)}>View update</button><button className="text-button" disabled={pending} onClick={() => read(row.id)}>Mark as read</button></>}</div></div>{!row.readAt && <span className="circle-badge">New</span>}</article>)}{!rows.length && <div className="circle-empty"><Bell /><h2>You’re all caught up</h2><p>Circle invitations and responses will appear here.</p><Link className="button primary" href="/dashboard/friends">Explore your circle</Link></div>}</section><div className="circle-pagination">{page > 1 && <Link className="button outline" href={`/dashboard/notifications?page=${page - 1}`}>Previous</Link>}{page * 20 < count && <Link className="button outline" href={`/dashboard/notifications?page=${page + 1}`}>Next</Link>}</div></div>
}

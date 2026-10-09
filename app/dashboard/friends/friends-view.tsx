'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ArrowRight, Check, Users, X } from 'lucide-react'
import AddFriend from '@/components/add-friend'
import CircleDialog from '@/components/circle-dialog'
import UserAvatar from '@/components/user-avatar'
import { changeFriendship } from './actions'
import type { CircleSummary, FriendCard, FriendOperation, FriendTab } from '@/lib/friend-types'
import { balanceExplanation } from '@/lib/settlement-types'

export function displayDate(date: string | null) { return date ? new Date(date).toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Calcutta' }) : 'Date unavailable' }

export default function FriendsView({ summary, rows, count, tab, page, outstandingCount, balances }: { summary: CircleSummary; rows: FriendCard[]; count: number; tab: FriendTab; page: number; outstandingCount:number;balances:Record<string,number> }) {
  const [remove, setRemove] = useState<FriendCard | null>(null)
  const [message, setMessage] = useState('')
  const [pending, startTransition] = useTransition()
  const router = useRouter()
  const reduce = useReducedMotion()
  function act(operation: FriendOperation, id: string) {
    startTransition(async () => {
      try {
      const result = await changeFriendship({ operation, id })
      setMessage(result.ok ? ({ accept: 'Invitation accepted. Your circle is updated.', reject: 'Invitation declined.', cancel: 'Invitation cancelled.', remove: 'Connection removed. Your favor history is preserved.', send: 'Invitation sent.' })[operation] : result.error)
      if (result.ok) { setRemove(null); router.refresh() }
      } catch { setMessage('Your action could not connect. Please try again.') }
    })
  }
  return <div className="page-content circle-page">
    <motion.div className="hero-row" initial={{ opacity: 0, y: reduce ? 0 : 10 }} animate={{ opacity: 1, y: 0 }}><div><span className="eyebrow">YOUR FAVOR NETWORK</span><h1>Your Circle <span className="circle-badge">{summary.accepted}</span></h1><p>The people you exchange favors with.</p></div><AddFriend /></motion.div>
    <section className="stats-grid" aria-label="Circle overview">{[['Total friends', summary.accepted], ['Incoming requests', summary.incoming], ['Sent requests', summary.outgoing], ['Outstanding balances', outstandingCount]].map(([label, value]) => <article className="stat-card" key={label}><span>{label}</span><strong>{value}</strong><small>{label === 'Outstanding balances' ? 'All shared history, including former friends' : 'Live circle data'}</small></article>)}</section>
    <nav className="circle-tabs" aria-label="Friend lists">{([['all', 'All Friends', summary.accepted], ['incoming', 'Incoming Requests', summary.incoming], ['sent', 'Sent Requests', summary.outgoing]] as const).map(([key, label, total]) => <Link href={`/dashboard/friends?tab=${key}`} key={key} aria-current={tab === key ? 'page' : undefined} className={tab === key ? 'selected' : ''}>{label}<span>{total}</span></Link>)}</nav>
    <AnimatePresence mode="wait"><motion.section key={`${tab}:${page}`} className="circle-grid" aria-label="Connections" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduce ? 0 : .12 }}>
      {rows.map((row, index) => <motion.article key={row.id} className="panel circle-card" initial={{ opacity: 0, y: reduce ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: reduce ? 0 : Math.min(index, 5) * .03 }}>
        <div className="circle-card-header"><UserAvatar user={row.person} /><div><h2>{row.person.name || 'Google user'}</h2><p>{row.person.email}</p></div><span className="circle-badge">{row.status === 'ACCEPTED' ? 'Connected' : 'Pending'}</span></div>
        <p className="circle-date">{tab === 'all' ? 'Connected' : 'Invited'} {displayDate(tab === 'all' ? row.connectedAt : row.createdAt)}</p>
        {tab==='all'&&<p className="ledger-friend-balance">{balanceExplanation(balances[row.person.id]??0,row.person.name)}</p>}
        <div className="circle-card-actions">{tab === 'all' ? <><Link className="text-button" href={`/dashboard/friends/${row.person.id}`}>View Profile <ArrowRight /></Link><button className="text-button circle-danger" disabled={pending} onClick={() => setRemove(row)}>Remove Friend</button></> : tab === 'incoming' ? <><button className="button primary" disabled={pending} onClick={() => act('accept', row.id)}><Check />Accept</button><button className="button outline" disabled={pending} onClick={() => act('reject', row.id)}>Decline</button></> : <button className="button outline" disabled={pending} onClick={() => act('cancel', row.id)}>Cancel invitation</button>}</div>
      </motion.article>)}
      {!rows.length && <div className="panel circle-empty"><Users /><h2>{tab === 'all' ? 'Your circle starts with one connection' : tab === 'incoming' ? 'No incoming requests' : 'No outgoing requests'}</h2><p>{tab === 'all' ? 'Invite someone you know to start keeping track together.' : 'When you connect with someone, their invitation will appear here.'}</p><AddFriend label="Find a friend" />{tab !== 'all' && <Link className="text-button" href="/dashboard/friends">Back to your circle</Link>}</div>}
    </motion.section></AnimatePresence>
    <div className="circle-pagination">{page > 1 && <Link className="button outline" href={`/dashboard/friends?tab=${tab}&page=${page - 1}`}>Previous</Link>}<span>{count ? `${(page - 1) * 20 + 1}–${Math.min(page * 20, count)} of ${count}` : 'No connections in this list'}</span>{page * 20 < count && <Link className="button outline" href={`/dashboard/friends?tab=${tab}&page=${page + 1}`}>Next</Link>}</div>
    <CircleDialog open={!!remove} onClose={() => { if (!pending) setRemove(null) }} title="Remove this friend?" description="Existing favor history will be preserved. Future favors require reconnecting. Reconnect invitations become available after 24 hours."><div className="circle-card-actions"><button className="button outline" disabled={pending} onClick={() => setRemove(null)}>Keep connection</button><button className="button circle-remove" disabled={pending} onClick={() => remove && act('remove', remove.id)}>{pending ? 'Removing…' : 'Remove Friend'}</button></div>{message && <p role="status">{message}</p>}</CircleDialog>
    <AnimatePresence>{message && !remove && <motion.div className="toast" role="status" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}><span>{message}</span><button aria-label="Dismiss feedback" onClick={() => setMessage('')}><X /></button></motion.div>}</AnimatePresence>
  </div>
}

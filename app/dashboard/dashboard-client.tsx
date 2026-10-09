'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { motion } from 'motion/react'
import { ArrowRight, ArrowUpRight, Bell } from 'lucide-react'
import UserAvatar from '@/components/user-avatar'
import AddFriend from '@/components/add-friend'
import type { UserProfile } from '@/lib/auth-utils'
import type { CircleSummary } from '@/lib/friend-types'
import { attendanceLabel, favorDirection, type FavorSummary } from '@/lib/favor-types'
import { balanceExplanation,ledgerEntryLabel,signedUnits,type BalanceTotals,type BalanceCard,type LedgerEntry } from '@/lib/settlement-types'
import BalanceNumber from '@/components/balance-number'

const MotionLink = motion.create(Link)

export default function DashboardClient({ actor, user, summary, favors, ledger, circleBalances }: { actor: string; user: UserProfile; summary: CircleSummary; favors: FavorSummary; ledger:{summary:BalanceTotals;preview:BalanceCard[];recent:LedgerEntry[]};circleBalances:Record<string,number> }) {

  const greeting = useMemo(() => {
    const hour = new Date().getHours()
    return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  }, [])
  return <>
    <div className="page-content">
      <div className="eyebrow">YOUR NETWORK OVERVIEW <span className="live-pill"><i /> Live circle · Live favors</span></div>
      <div className="hero-row"><div><h1>{greeting}, {user.name?.trim().split(/\s+/)[0] || 'friend'}.</h1><p>Here&apos;s where things stand with your circle.</p></div><time>{new Intl.DateTimeFormat('en-IN', { dateStyle: 'full', timeZone: 'Asia/Kolkata' }).format(new Date())}</time></div>
      <motion.section className="stats-grid" aria-label="Ledger summary" initial="hidden" animate="visible" variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.07, delayChildren: 0.12 } } }}>
        <StatCard label="You owe" value={String(ledger.summary.iOwe)} description={`${ledger.summary.iOweCount} relationships · Global proxies`} tone="negative" />
        <StatCard label="Owed to you" value={String(ledger.summary.owedToMe)} description={`${ledger.summary.owesMeCount} relationships · Global proxies`} tone="positive" />
        <StatCard label="Active friends" value={String(summary.accepted).padStart(2, '0')} description="Live connections" />
        <StatCard label="Confirmed favors" value={String(favors.confirmed).padStart(2, '0')} description={`${favors.pending} pending · ${favors.awaiting} awaiting you`} />
      </motion.section>
      <div className="dashboard-grid">
        <section className="panel circle-panel"><div className="section-heading"><div><h2>Your circle</h2><p>Your live connections.</p></div><Link className="text-button" href="/dashboard/friends">View all <ArrowUpRight /></Link></div>
          <div className="friend-list">{summary.preview.map((friend) => <MotionLink className="friend-row" key={friend.id} href={`/dashboard/friends/${friend.person.id}`} whileHover={{ x: 4 }} whileTap={{ scale: .99 }}><UserAvatar user={friend.person} /><span className="friend-info"><strong>{friend.person.name || 'Your friend'}</strong><small>{balanceExplanation(circleBalances[friend.person.id]??0,friend.person.name)}</small></span><ArrowRight className="row-arrow" /></MotionLink>)}{!summary.preview.length && <p className="circle-muted">Your circle is ready for its first connection.</p>}</div>
          <AddFriend className="button primary full-button" />
        </section>
        <section className="panel activity-panel"><div className="section-heading"><div><h2>Recent ledger activity</h2><p>Favors and agreed settlements.</p></div></div>
          <div className="activity-list">{ledger.recent.map(row => <Link className="activity-row favor-activity-link" key={`${row.kind}:${row.id}`} href={`/dashboard/${row.kind==='favor'?'transactions':'settlements'}/${row.id}`}><UserAvatar user={{ ...row.friend, email: null }} /><div className="activity-copy"><strong>{ledgerEntryLabel(row)}</strong><span>{row.subject || (row.kind==='favor'?'Subject not recorded':'Settlement')} <em>·</em> {row.status.charAt(0)+row.status.slice(1).toLowerCase()}</span></div><span className={`ledger-units ${row.delta>0?'positive':row.delta<0?'negative':''}`}>{signedUnits(row.delta)}</span></Link>)}{!ledger.recent.length && <p className="circle-muted">No activity yet. Record an attendance proxy to begin.</p>}</div>
          <Link className="text-button activity-link" href="/dashboard/balances">View all balances <ArrowRight /></Link>
        </section>
      </div>
      <section className="panel ledger-preview"><div className="section-heading"><div><h2>Where you stand</h2><p>{ledger.summary.outstandingCount} outstanding · {ledger.summary.settledCount} settled relationships</p></div><Link className="text-button" href="/dashboard/balances">View balances <ArrowUpRight /></Link></div>{ledger.preview.map(row=><Link className="activity-row favor-activity-link" href={`/dashboard/balances/${row.person.id}`} key={row.person.id}><UserAvatar user={{...row.person,email:null}}/><span className="activity-copy"><strong>{row.person.name||'Your friend'}</strong><span>{balanceExplanation(row.balance,row.person.name)}</span></span><span className={`ledger-units ${row.balance>0?'positive':row.balance<0?'negative':''}`}>{signedUnits(row.balance)}</span></Link>)}{!ledger.preview.length&&<p className="circle-muted">Your balances appear when you connect or share a favor.</p>}</section>
      <section className="pending-strip"><div className="pending-icon"><Bell /></div><div><strong>{ledger.summary.incomingSettlements} settlements await your confirmation</strong><span>{ledger.summary.pendingSettlements} pending requests in total. No balance changes until confirmation.</span></div><Link className="button outline" href="/dashboard/settlements?tab=incoming">Review settlements <ArrowRight /></Link></section>
      <section className="pending-strip"><div className="pending-icon"><Bell /></div><div><strong>{favors.awaiting} favors await your confirmation</strong><span>Review the participants, subject and date before confirming.</span></div><Link className="button outline" href="/dashboard/transactions?status=awaiting">Review favors <ArrowRight /></Link></section>
      {favors.recentConfirmed.length > 0 && <section className="panel favor-confirmed-preview"><div className="section-heading"><div><h2>Recently confirmed</h2><p>One attendance favor, one unit, across all subjects.</p></div><Link className="text-button" href="/dashboard/transactions?status=confirmed">View confirmed <ArrowUpRight /></Link></div>{favors.recentConfirmed.map(row => <Link className="activity-row favor-activity-link" href={`/dashboard/transactions/${row.id}`} key={row.id}><span className="activity-copy"><strong>{favorDirection(row, actor)}</strong><span>{row.subject?.name || 'Subject not recorded'} · {attendanceLabel(row.attendanceDate)}</span></span><span className="circle-badge">Confirmed</span></Link>)}</section>}
      <section className="pending-strip"><div className="pending-icon"><Bell /></div><div><strong>{summary.incoming} incoming friend {summary.incoming === 1 ? 'invitation' : 'invitations'}</strong><span>Review requests to grow your circle.</span></div><Link className="button outline" href="/dashboard/friends?tab=incoming">Review requests <ArrowRight /></Link></section>
    </div>
  </>
}
function StatCard({ label, value, description, tone = '' }: { label: string; value: string; description: string; tone?: string }) {
  return <motion.article className="stat-card" variants={{ hidden: { opacity: 0, y: 14 }, visible: { opacity: 1, y: 0, transition: { duration: 0.32, ease: 'easeOut' } } }}><span>{label}</span><BalanceNumber value={Number(value)} tone={tone}/><small>{description}</small></motion.article>
}


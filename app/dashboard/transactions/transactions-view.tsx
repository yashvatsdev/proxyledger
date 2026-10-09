'use client'

import { motion } from 'motion/react'
import Link from 'next/link'
import RecordFavor from '@/components/record-favor'
import FavorActions from '@/components/favor-actions'
import UserAvatar from '@/components/user-avatar'
import FavorFilterPicker from '@/components/favor-filter-picker'
import { attendanceLabel, favorDirection, type FavorFilters, type FavorRecord } from '@/lib/favor-types'

const MotionLink = motion.create(Link)
const tabs = [['all', 'All'], ['pending', 'Pending'], ['awaiting', 'Awaiting my confirmation'], ['confirmed', 'Confirmed'], ['closed', 'Rejected / Canceled']] as const
export function transactionHref(filters: FavorFilters, update: Partial<FavorFilters>) {
  const value = { ...filters, ...update }
  const params = new URLSearchParams()
  Object.entries(value).forEach(([key, item]) => { if (item && !(key === 'status' && item === 'all') && !(key === 'page' && item === 1)) params.set(key, String(item)) })
  return `/dashboard/transactions${params.size ? `?${params}` : ''}`
}
export default function TransactionsView({ actor, result, filters, invalid }: { actor: string; result: { count: number; rows: FavorRecord[] }; filters: FavorFilters; invalid: boolean }) {
  const friend = result.rows.flatMap(row => [row.provider, row.beneficiary]).find(person => person.id === filters.friend)
  const subject = result.rows.find(row => row.subject?.id === filters.subject)?.subject
  return <div className="page-content">
    <div className="hero-row"><div><div className="eyebrow">YOUR FAVOR HISTORY</div><h1>Transactions</h1><p>Every favor, tracked. Every exchange, accounted for.</p></div><RecordFavor /></div>
    {invalid && <p role="alert" className="circle-feedback">Those filters were invalid. Showing all your transactions.</p>}
    <nav className="circle-tabs favor-tabs" aria-label="Transaction status">{tabs.map(([value, label]) => <MotionLink key={value} href={transactionHref(filters, { status: value, page: 1 })} className={filters.status === value ? 'active' : ''} aria-current={filters.status === value ? 'page' : undefined} whileTap={{ scale: .98 }}>{label}</MotionLink>)}</nav>
    <form className="panel favor-filters" action="/dashboard/transactions" method="get">
      <input type="hidden" name="status" value={filters.status} />
      <label>Search<input className="favor-input" name="q" placeholder="Friend or subject name" maxLength={80} defaultValue={filters.q} /></label>
      <FavorFilterPicker key={`friend-${filters.friend || ''}`} kind="friend" initialId={filters.friend} initialLabel={friend?.name} />
      <FavorFilterPicker key={`subject-${filters.subject || ''}`} kind="subject" initialId={filters.subject} initialLabel={subject?.name} />
      <label>From<input className="favor-input" type="date" name="from" defaultValue={filters.from || ''} /></label><label>To<input className="favor-input" type="date" name="to" defaultValue={filters.to || ''} /></label>
      <div className="circle-card-actions"><button className="button primary" type="submit">Apply filters</button><Link className="button outline" href="/dashboard/transactions">Reset</Link></div>
    </form>
    <p className="circle-muted" aria-live="polite">{result.count} {result.count === 1 ? 'transaction' : 'transactions'} · Page {filters.page}</p>
    <motion.section className="favor-list" key={JSON.stringify(filters)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} aria-label="Transactions">
      {result.rows.map((row, index) => {
        const other = row.provider.id === actor ? row.beneficiary : row.provider
        return <motion.article className="panel favor-card" key={row.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index, 5) * .03 }}>
          <div className="favor-card-heading"><UserAvatar user={{ ...other, email: null }} /><div><Link href={transactionHref(filters, { friend: other.id, page: 1 })}>{other.name || 'Your friend'}</Link><h2>{favorDirection(row, actor)}</h2></div><span className={`circle-badge favor-status-${row.status.toLowerCase()}`}>{row.status === 'PENDING' && row.createdBy.id !== actor ? 'Awaiting you' : row.status.charAt(0) + row.status.slice(1).toLowerCase()}</span></div>
          <p className="favor-meta">{row.subject ? <Link href={transactionHref(filters, { subject: row.subject.id, page: 1 })}>{row.subject.name}</Link> : 'Legacy subject not recorded'} <span>·</span> Attendance: {attendanceLabel(row.attendanceDate)}</p>
          {row.note && <p className="favor-note favor-note-preview">{row.note}</p>}
          <p className="circle-muted">Submitted by {row.createdBy.id === actor ? 'you' : row.createdBy.name || 'your friend'} · Created {new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(new Date(row.createdAt))}</p>
          <div className="favor-card-footer"><Link className="text-button" href={`/dashboard/transactions/${row.id}`}>View details →</Link><FavorActions row={row} actor={actor} /></div>
        </motion.article>
      })}
      {!result.rows.length && <motion.div className="panel circle-empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}><h2>{filters.status === 'awaiting' ? 'No favors awaiting you' : filters.status === 'confirmed' ? 'No confirmed favors yet' : filters.q || filters.friend || filters.subject || filters.from || filters.to ? 'No matching transactions' : 'Your favor story starts here'}</h2><p>{filters.status === 'awaiting' ? 'You are caught up. New confirmation requests appear here.' : 'Record an attendance proxy with a friend, or adjust your filters.'}</p><RecordFavor /></motion.div>}
    </motion.section>
    <nav className="circle-pagination" aria-label="Transaction pages">{filters.page > 1 && <Link className="button outline" href={transactionHref(filters, { page: filters.page - 1 })}>Previous</Link>}{result.count > filters.page * 20 && <Link className="button outline" href={transactionHref(filters, { page: filters.page + 1 })}>Next</Link>}</nav>
  </div>
}

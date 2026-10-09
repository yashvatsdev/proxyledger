import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth-session'
import { getPrisma } from '@/lib/db'
import { createFavorsService } from '@/lib/favors-service'
import { attendanceLabel, favorDirection } from '@/lib/favor-types'
import FavorActions from '@/components/favor-actions'

export default async function TransactionDetails({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  const { id } = await params
  if (!id || id.length > 128) notFound()
  const row = await createFavorsService(getPrisma()).detail(user.id, id)
  if (!row) notFound()
  const name = (person: typeof row.provider) => person.id === user.id ? 'You' : person.name || 'Your friend'
  const reviewer = row.createdBy.id === row.provider.id ? row.beneficiary : row.provider
  const timestamp = (value: string) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(value))
  return <div className="page-content"><Link className="text-button" href="/dashboard/transactions">← Transactions</Link><div className="hero-row"><div><div className="eyebrow">FAVOR DETAILS</div><h1>{favorDirection(row, user.id)}</h1><p>{name(row.provider)} marked attendance for {row.beneficiary.id === user.id ? 'you' : name(row.beneficiary)} in {row.subject?.name || 'the recorded subject'}.</p></div><span className={`circle-badge favor-status-${row.status.toLowerCase()}`}>{row.status}</span></div>
    <section className="panel favor-detail"><p className="favor-explanation">{row.status === 'PENDING' ? `After confirmation, ${row.beneficiary.id === user.id ? 'you will owe' : `${name(row.beneficiary)} will owe`} ${row.provider.id === user.id ? 'you' : name(row.provider)} one proxy. No balance changes until then.` : row.status === 'CONFIRMED' ? `Confirmed: ${row.beneficiary.id === user.id ? 'you owe' : `${name(row.beneficiary)} owes`} ${row.provider.id === user.id ? 'you' : name(row.provider)} one proxy for this record. Other confirmed favors may offset it globally.` : 'This record does not count toward balances.'}</p>
      <dl className="favor-detail-grid"><div><dt>Performer</dt><dd>{name(row.provider)}</dd></div><div><dt>Receiver</dt><dd>{name(row.beneficiary)}</dd></div><div><dt>Submitted by</dt><dd>{name(row.createdBy)}</dd></div><div><dt>Confirmation participant</dt><dd>{name(reviewer)}</dd></div><div><dt>Subject</dt><dd>{row.subject?.name || 'Legacy subject not recorded'}</dd></div><div><dt>Attendance date</dt><dd>{attendanceLabel(row.attendanceDate)}</dd></div><div><dt>Created (India time)</dt><dd>{timestamp(row.createdAt)}</dd></div><div><dt>Last updated (India time)</dt><dd>{timestamp(row.updatedAt)}</dd></div>{row.confirmedAt && <div><dt>Confirmed</dt><dd>{timestamp(row.confirmedAt)}</dd></div>}{row.resolvedAt && row.status !== 'CONFIRMED' && <div><dt>{row.status === 'CANCELED' ? 'Canceled' : 'Rejected'}</dt><dd>{timestamp(row.resolvedAt)}</dd></div>}</dl>
      <h2>Note</h2><p className="favor-note">{row.note || 'No note added.'}</p><FavorActions actor={user.id} row={row} />
    </section>
  </div>
}

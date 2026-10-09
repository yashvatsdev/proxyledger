import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth-session'
import { getPrisma } from '@/lib/db'
import { createSettlementsService } from '@/lib/settlements-service'
import { createLedgerService } from '@/lib/ledger-service'
import { balanceExplanation } from '@/lib/settlement-types'
import SettlementActions from '@/components/settlement-actions'

export default async function SettlementDetails({params}:{params:Promise<{id:string}>}) {
  const user=await requireUser();const {id}=await params
  if(!id||id.length>128)notFound()
  const row=await createSettlementsService(getPrisma()).detail(user.id,id)
  if(!row)notFound()
  const friend=row.requester.id===user.id?row.recipient:row.requester
  const relationship=await createLedgerService(getPrisma()).pair(user.id,friend.id)
  const name=(person:typeof friend)=>person.id===user.id?'You':person.name||'Your friend'
  const time=(value:string)=>new Intl.DateTimeFormat('en-IN',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Kolkata'}).format(new Date(value))
  return <div className="page-content circle-page"><Link className="text-button" href="/dashboard/settlements">← Settlements</Link><div className="hero-row"><div><div className="eyebrow">SETTLEMENT DETAILS</div><h1>Settle {row.amount} {row.amount===1?'proxy':'proxies'}</h1><p>An agreed reduction of the debt {row.debtor.id===user.id?'you owe':`${name(row.debtor)} owes`} {row.creditor.id===user.id?'you':name(row.creditor)}.</p></div><span className={`circle-badge favor-status-${row.status.toLowerCase()}`}>{row.status}</span></div><section className="panel favor-detail"><p className="ledger-explanation">{row.status==='PENDING'?'Pending: your balance is unchanged. Confirmation rechecks the current debt.':row.status==='CONFIRMED'?'Applied exactly once. Original favors remain unchanged.':'This request does not affect balances.'}{relationship&&` ${balanceExplanation(relationship.balance,friend.name)}`}</p><dl className="favor-detail-grid">{[['Debtor',name(row.debtor)],['Creditor',name(row.creditor)],['Submitted by',name(row.requester)],['Confirmation participant',name(row.recipient)],['Amount',`${row.amount} proxies`],['Created (India time)',time(row.createdAt)],...(row.confirmedAt?[['Confirmed',time(row.confirmedAt)]]:[]),...(row.resolvedAt&&row.status!=='CONFIRMED'?[[row.status==='CANCELED'?'Canceled':'Rejected',time(row.resolvedAt)]]:[])].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><h2>Note</h2><p className="favor-note">{row.reason||'No note added.'}</p><SettlementActions actor={user.id} row={row}/><p><Link className="text-button" href={`/dashboard/balances/${friend.id}`}>View shared ledger →</Link></p></section></div>
}

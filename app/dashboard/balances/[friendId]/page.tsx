import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth-session'
import { getPrisma } from '@/lib/db'
import { createLedgerService } from '@/lib/ledger-service'
import { createSettlementsService } from '@/lib/settlements-service'
import { balanceExplanation,balanceFilters,signedUnits } from '@/lib/settlement-types'
import UserAvatar from '@/components/user-avatar'
import SettlementDialog from '@/components/settlement-dialog'
import SettlementList from '@/components/settlement-list'
import LedgerTimeline from '@/components/ledger-timeline'

export default async function FriendLedger({params,searchParams}:{params:Promise<{friendId:string}>;searchParams:Promise<{page?:string}>}) {
  const actor=await requireUser()
  const {friendId}=await params
  if(!friendId||friendId.length>128||friendId===actor.id)notFound()
  const parsed=balanceFilters.safeParse(await searchParams)
  const page=parsed.success?parsed.data.page:1
  const service=createLedgerService(getPrisma())
  const relationship=await service.pair(actor.id,friendId)
  if(!relationship)notFound()
  const settlements=createSettlementsService(getPrisma())
  const [history,incoming,outgoing]=await Promise.all([service.entries(actor.id,friendId,page),settlements.list(actor.id,{friend:friendId,tab:'incoming'}),settlements.list(actor.id,{friend:friendId,tab:'outgoing'})])
  return <div className="page-content circle-page"><Link className="text-button" href="/dashboard/balances">← Balances</Link><div className="hero-row"><div><div className="eyebrow">GLOBAL SHARED LEDGER</div><div className="circle-card-header"><UserAvatar user={{...relationship.person,email:null}}/><h1>{relationship.person.name||'Your friend'}</h1></div><p>{relationship.connected?'Connected':'Former connection · History is preserved'}</p></div><SettlementDialog relationship={relationship}/></div><section className="panel ledger-pair-summary"><strong className={`ledger-pair-number ${relationship.balance>0?'positive':relationship.balance<0?'negative':''}`}>{signedUnits(relationship.balance)}</strong><div><h2>{balanceExplanation(relationship.balance,relationship.person.name)}</h2><p>{relationship.favors} confirmed favors across all subjects · {relationship.pendingSettlements} pending settlement requests</p><Link className="text-button" href={`/dashboard/settlements?friend=${friendId}`}>All settlement requests →</Link></div></section>
    {(incoming.count+outgoing.count)>0&&<section className="ledger-pending"><div className="section-heading"><div><h2>Pending settlements</h2><p>{incoming.count} awaiting you · {outgoing.count} submitted by you. No balance change until confirmation.</p></div></div><SettlementList rows={[...incoming.rows.slice(0,5),...outgoing.rows.slice(0,5)]} actor={actor.id}/>{incoming.count>5||outgoing.count>5?<Link className="text-button" href={`/dashboard/settlements?friend=${friendId}`}>View all requests →</Link>:null}</section>}
    <section className="panel ledger-history"><div className="section-heading"><div><h2>Complete activity timeline</h2><p>{history.count} entries · Oldest to newest balance calculation, latest activity first.</p></div></div><LedgerTimeline rows={history.rows}/></section><nav className="circle-pagination" aria-label="Ledger pages">{page>1&&<Link className="button outline" href={`/dashboard/balances/${friendId}?page=${page-1}`}>Previous</Link>}{history.count>page*20&&<Link className="button outline" href={`/dashboard/balances/${friendId}?page=${page+1}`}>Next</Link>}</nav>
  </div>
}

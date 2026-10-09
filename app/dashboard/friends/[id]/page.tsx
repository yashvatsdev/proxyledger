import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth-session'
import { getPrisma } from '@/lib/db'
import { createFriendsService } from '@/lib/friends-service'
import { createLedgerService } from '@/lib/ledger-service'
import { balanceExplanation,signedUnits } from '@/lib/settlement-types'
import UserAvatar from '@/components/user-avatar'
import SettlementDialog from '@/components/settlement-dialog'
import LedgerTimeline from '@/components/ledger-timeline'

export default async function FriendProfile({params}:{params:Promise<{id:string}>}) {
  const actor=await requireUser();const {id}=await params
  if(!id||id.length>128||id===actor.id)notFound()
  const ledger=createLedgerService(getPrisma())
  const [profile,relationship]=await Promise.all([createFriendsService(getPrisma()).profile(actor.id,id),ledger.pair(actor.id,id)])
  if(!relationship)notFound()
  const person=profile?.person??{...relationship.person,email:null}
  const history=await ledger.entries(actor.id,id)
  return <div className="page-content circle-page"><Link className="text-button" href="/dashboard/friends">← Back to Your Circle</Link><section className="panel friend-profile"><UserAvatar user={person}/><h1>{person.name||'Your friend'}</h1>{person.email&&<p>{person.email}</p>}<span className="circle-badge">{relationship.connected?'Connected':'Former connection · Shared history'}</span>{profile?.connectedAt&&<p>Connected {new Date(profile.connectedAt).toLocaleDateString('en',{timeZone:'Asia/Kolkata'})}</p>}</section><section className="panel ledger-pair-summary"><strong className={`ledger-pair-number ${relationship.balance>0?'positive':relationship.balance<0?'negative':''}`}>{signedUnits(relationship.balance)}</strong><div><h2>{balanceExplanation(relationship.balance,person.name)}</h2><p>{relationship.favors} confirmed favors across all subjects.</p><div className="circle-card-actions"><Link className="button outline" href={`/dashboard/balances/${id}`}>View full ledger</Link><SettlementDialog relationship={relationship}/></div></div></section><section className="panel ledger-history"><div className="section-heading"><div><h2>Recent shared ledger activity</h2><p>Confirmed favors, settlements and pending activity.</p></div></div><LedgerTimeline rows={history.rows.slice(0,5)}/></section></div>
}

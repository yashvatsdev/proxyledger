import Link from 'next/link'
import { requireUser } from '@/lib/auth-session'
import { getPrisma } from '@/lib/db'
import { createSettlementsService } from '@/lib/settlements-service'
import { settlementFilters } from '@/lib/settlement-types'
import SettlementList from '@/components/settlement-list'

export default async function SettlementsPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const user=await requireUser()
  const params=await searchParams
  const parsed=settlementFilters.safeParse(Object.fromEntries(Object.entries(params).filter(([,value])=>typeof value==='string'&&value!=='')))
  const filters=parsed.success?parsed.data:settlementFilters.parse({})
  const result=await createSettlementsService(getPrisma()).list(user.id,filters)
  const href=(tab=filters.tab,page=1)=>`/dashboard/settlements?${new URLSearchParams({tab,page:String(page),...(filters.friend?{friend:filters.friend}:{})})}`
  return <div className="page-content circle-page"><div className="hero-row"><div><div className="eyebrow">AGREED DEBT REDUCTIONS</div><h1>Settlements</h1><p>Resolve your balance together. Every original favor stays in your ledger.</p></div><Link className="button outline" href="/dashboard/balances">View balances</Link></div><nav className="circle-tabs" aria-label="Settlement requests">{([['all','All'],['incoming','Incoming'],['outgoing','Outgoing'],['confirmed','Confirmed'],['closed','Rejected / Canceled']]as const).map(([tab,label])=><Link href={href(tab)} className={filters.tab===tab?'selected':''} aria-current={filters.tab===tab?'page':undefined} key={tab}>{label}</Link>)}</nav>{!parsed.success&&<p className="circle-feedback" role="alert">Invalid filters. Showing all your requests.</p>}{filters.friend&&<p className="circle-muted">Filtered to this shared relationship. <Link className="text-button" href="/dashboard/settlements">Clear filter</Link></p>}<p className="circle-muted">{result.count} requests · Page {filters.page}</p><SettlementList key={`${filters.tab}:${filters.page}:${filters.friend||''}`} rows={result.rows} actor={user.id}/>{!result.rows.length&&<div className="panel circle-empty"><h2>{filters.tab==='incoming'?'You’re caught up':'No settlements here yet'}</h2><p>Propose a reduction from a nonzero balance, then let the other participant review it.</p><Link className="button outline" href="/dashboard/balances">Open balances</Link></div>}<nav className="circle-pagination" aria-label="Settlement pages">{filters.page>1&&<Link className="button outline" href={href(filters.tab,filters.page-1)}>Previous</Link>}{result.count>filters.page*20&&<Link className="button outline" href={href(filters.tab,filters.page+1)}>Next</Link>}</nav></div>
}

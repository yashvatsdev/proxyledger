import { requireUser } from '@/lib/auth-session'
import { getPrisma } from '@/lib/db'
import { createFriendsService } from '@/lib/friends-service'
import FriendsView from './friends-view'
import type { FriendTab } from '@/lib/friend-types'
import { getCircleSummary } from '@/lib/circle-data'
import { createLedgerService } from '@/lib/ledger-service'
import { getLedgerTotals } from '@/lib/ledger-data'

export default async function FriendsPage({ searchParams }: { searchParams: Promise<{ tab?: string; page?: string }> }) {
  const user = await requireUser()
  const params = await searchParams
  const tab: FriendTab = params.tab === 'incoming' || params.tab === 'sent' ? params.tab : 'all'
  const page = Math.max(1, Math.min(1000, Number(params.page) || 1)) | 0
  const service = createFriendsService(getPrisma())
  const [summary, list, ledgerTotals] = await Promise.all([getCircleSummary(user.id), service.list(user.id, tab, page), getLedgerTotals(user.id)])
  const balances=tab==='all'?await createLedgerService(getPrisma()).balancesFor(user.id,list.rows.map(row=>row.person.id)):[]
  return <FriendsView summary={summary} rows={list.rows} count={list.count} page={page} tab={tab} outstandingCount={ledgerTotals.outstandingCount} balances={Object.fromEntries(balances.map(row=>[row.person.id,row.balance]))} />
}

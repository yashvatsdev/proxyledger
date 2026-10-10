import { requireUser } from '@/lib/auth-session'
import DashboardClient from './dashboard-client'
import { getCircleSummary } from '@/lib/circle-data'
import { getFavorSummary } from '@/lib/favor-data'
import { getLedgerOverview } from '@/lib/ledger-data'
import { createLedgerService } from '@/lib/ledger-service'
import { getPrisma } from '@/lib/db'

export default async function DashboardPage() {
  const user = await requireUser()
  const [summary, favors, ledger] = await Promise.all([getCircleSummary(user.id), getFavorSummary(user.id), getLedgerOverview(user.id)])
  const circleRows = await createLedgerService(getPrisma()).balancesFor(user.id,summary.preview.map(row=>row.person.id))
  const circleBalances = Object.fromEntries(circleRows.map(row=>[row.person.id,row.balance]))
  const publicSummary = { ...summary, preview: summary.preview.map(row => ({ ...row, person: { ...row.person, email: null } })) }
  return <DashboardClient now={new Date().toISOString()} actor={user.id} favors={favors} ledger={ledger} circleBalances={circleBalances} user={{ name: user.name ?? null, email: user.email ?? null, image: user.image ?? null }} summary={publicSummary} />
}

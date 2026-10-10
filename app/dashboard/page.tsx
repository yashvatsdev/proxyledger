import { requireUser } from '@/lib/auth-session'
import DashboardClient from './dashboard-client'
import { getCircleSummary } from '@/lib/circle-data'
import { getFavorSummary } from '@/lib/favor-data'
import { getLedgerOverview } from '@/lib/ledger-data'
import { timeOperation } from '@/lib/performance-timing'

export default async function DashboardPage() {
  return timeOperation('dashboard-data', loadDashboard)
}
async function loadDashboard() {
  const user = await requireUser()
  // Avoid adding ledger transactions to the circle/favor query fan-out on
  // the single connection shared by concurrent serverless invocations.
  const summary = await getCircleSummary(user.id)
  const favors = await getFavorSummary(user.id)
  const ledger = await getLedgerOverview(user.id,summary.preview.map(row=>row.person.id))
  const circleBalances = ledger.circleBalances
  const publicSummary = { ...summary, preview: summary.preview.map(row => ({ ...row, person: { ...row.person, email: null } })) }
  return <DashboardClient now={new Date().toISOString()} actor={user.id} favors={favors} ledger={ledger} circleBalances={circleBalances} user={{ name: user.name ?? null, email: user.email ?? null, image: user.image ?? null }} summary={publicSummary} />
}

import { requireUser } from '@/lib/auth-session'
import { getCircleSummary } from '@/lib/circle-data'
import DashboardShell from '@/components/dashboard-shell'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()
  const summary = await getCircleSummary(user.id)
  return <DashboardShell user={{ name: user.name ?? null, email: user.email ?? null, image: user.image ?? null }} unread={summary.unread}>{children}</DashboardShell>
}

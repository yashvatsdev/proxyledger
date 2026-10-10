import { requireUser } from '@/lib/auth-session'
import { getCircleUnread } from '@/lib/circle-data'
import DashboardShell from '@/components/dashboard-shell'
import { Geist } from 'next/font/google'

const dashboardFont = Geist({ subsets: ['latin'], display: 'swap', variable: '--dashboard-font' })

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()
  const unread = await getCircleUnread(user.id)
  return <div className={dashboardFont.variable}><DashboardShell user={{ name: user.name ?? null, email: user.email ?? null, image: user.image ?? null }} unread={unread}>{children}</DashboardShell></div>
}

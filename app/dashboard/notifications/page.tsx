import { requireUser } from '@/lib/auth-session'
import { getPrisma } from '@/lib/db'
import { createFriendsService } from '@/lib/friends-service'
import NotificationsView from './notifications-view'

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const user = await requireUser()
  const params = await searchParams
  const page = Math.max(1, Math.min(1000, Number(params.page) || 1)) | 0
  const data = await createFriendsService(getPrisma()).notifications(user.id, page)
  return <NotificationsView rows={data.rows} count={data.count} page={page} />
}

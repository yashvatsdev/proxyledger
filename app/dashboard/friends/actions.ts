'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth-session'
import { getPrisma } from '@/lib/db'
import { reportOperationalFailure } from '@/lib/operational-log'
import { createFriendsService, FriendError } from '@/lib/friends-service'
import { mutationInput, searchInput, type ActionResult, type SearchPerson } from '@/lib/friend-types'

export async function changeFriendship(input: unknown): Promise<ActionResult> {
  const user = await requireUser()
  const parsed = mutationInput.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Invalid circle action.' }
  try {
    const service = createFriendsService(getPrisma())
    await service.rateLimit(user.id, parsed.data.operation === 'send' ? 'send' : 'mutation')
    await service.change(user.id, parsed.data.operation, parsed.data.id)
    revalidatePath('/dashboard', 'layout')
    return { ok: true, data: null }
  } catch (error) {
    if (!(error instanceof FriendError)) reportOperationalFailure('friend-action-failed')
    return { ok: false, error: error instanceof FriendError ? error.message : 'Your action could not be completed. Please try again.' }
  }
}

export async function searchPeople(input: unknown): Promise<ActionResult<{ people: SearchPerson[]; hasMore: boolean }>> {
  const user = await requireUser()
  const parsed = searchInput.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Enter at least 3 characters of a name or a complete email address.' }
  try { return { ok: true, data: await createFriendsService(getPrisma()).search(user.id, parsed.data) } }
  catch (error) { if (!(error instanceof FriendError)) reportOperationalFailure('search-action-failed'); return { ok: false, error: error instanceof FriendError ? error.message : 'Search is unavailable. Please try again.' } }
}

export async function markNotificationRead(id: string): Promise<ActionResult> {
  const user = await requireUser()
  try {
    const service = createFriendsService(getPrisma())
    await service.rateLimit(user.id, 'mutation')
    await service.markRead(user.id, id)
    revalidatePath('/dashboard', 'layout')
    return { ok: true, data: null }
  } catch (error) { if (!(error instanceof FriendError)) reportOperationalFailure('notification-action-failed'); return { ok: false, error: error instanceof FriendError ? error.message : 'Could not mark this notification as read.' } }
}

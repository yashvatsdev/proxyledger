import { beforeEach, expect, it, vi } from 'vitest'

const mock = vi.hoisted(() => ({ user: vi.fn(), change: vi.fn(), search: vi.fn(), read: vi.fn(), rate: vi.fn(), revalidate: vi.fn() }))
vi.mock('../lib/auth-session', () => ({ requireUser: mock.user }))
vi.mock('../lib/db', () => ({ getPrisma: () => ({}) }))
vi.mock('next/cache', () => ({ revalidatePath: mock.revalidate }))
vi.mock('../lib/friends-service', () => ({ createFriendsService: () => ({ change: mock.change, search: mock.search, markRead: mock.read, rateLimit: mock.rate }), FriendError: class extends Error {} }))
import { changeFriendship, searchPeople, markNotificationRead } from '../app/dashboard/friends/actions'

beforeEach(() => { vi.resetAllMocks(); mock.user.mockResolvedValue({ id: 'session-actor' }) })

it('uses the session actor and ignores forged requester IDs', async () => {
  expect((await changeFriendship({ operation: 'send', id: 'target', requesterId: 'forged-user' })).ok).toBe(true)
  expect(mock.change).toHaveBeenCalledWith('session-actor', 'send', 'target')
  expect(mock.revalidate).toHaveBeenCalledWith('/dashboard', 'layout')
})

it.each(['send', 'accept', 'reject', 'cancel', 'remove'])('rejects unauthenticated %s operations', async (operation) => {
  mock.user.mockRejectedValue(new Error('login redirect'))
  await expect(changeFriendship({ operation, id: 'target' })).rejects.toThrow('login redirect')
  expect(mock.change).not.toHaveBeenCalled()
})

it('protects discovery and notification actions', async () => {
  mock.user.mockRejectedValue(new Error('login redirect'))
  await expect(searchPeople({ query: 'name' })).rejects.toThrow('login redirect')
  await expect(markNotificationRead('notice')).rejects.toThrow('login redirect')
  expect(mock.search).not.toHaveBeenCalled(); expect(mock.read).not.toHaveBeenCalled()
})

it('rejects invalid IDs, operations and enumeration requests', async () => {
  expect((await changeFriendship({ operation: 'drop', id: 'target' })).ok).toBe(false)
  expect((await changeFriendship({ operation: 'send', id: '' })).ok).toBe(false)
  expect((await searchPeople({ query: '' })).ok).toBe(false)
  expect((await searchPeople({ query: 'aa' })).ok).toBe(false)
  expect((await searchPeople({ query: 'name', page: 6 })).ok).toBe(false)
  expect((await searchPeople({ query: '%%%' })).ok).toBe(false)
  expect((await searchPeople({ query: '___' })).ok).toBe(false)
  expect((await searchPeople({ query: 'not-an-email@' })).ok).toBe(false)
  expect(mock.change).not.toHaveBeenCalled(); expect(mock.search).not.toHaveBeenCalled()
})

it('returns safe database failure feedback', async () => {
  mock.change.mockRejectedValue(new Error('sensitive database detail'))
  const result = await changeFriendship({ operation: 'send', id: 'target' })
  expect(JSON.stringify(result)).not.toContain('sensitive database detail')
  expect(mock.revalidate).not.toHaveBeenCalled()
})

it('marks notifications only for the authenticated actor', async () => {
  await markNotificationRead('notice')
  expect(mock.read).toHaveBeenCalledWith('session-actor', 'notice')
})

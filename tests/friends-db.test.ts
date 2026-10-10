import 'dotenv/config'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { getTestPrisma } from './helpers/test-database'
import { createFriendsService } from '../lib/friends-service'

// Explicit opt-in. Fixtures are isolated by freshly generated IDs and cleaned up.
describe.skipIf(process.env.RUN_FRIENDS_DB_TESTS !== '1')('PostgreSQL friendship integration', () => {
  const db = getTestPrisma(process.env.RUN_FRIENDS_DB_TESTS === '1')
  const service = createFriendsService(db)
  const marker = `Phase3Test${randomUUID().replaceAll('-', '')}`
  const ids = [randomUUID(), randomUUID(), randomUUID()]
  const [a, b, outsider] = ids
  async function clearFixtures() {
    await db.notification.deleteMany({ where: { userId: { in: ids } } })
    await db.favor.deleteMany({ where: { providerId: { in: ids } } })
    await db.friendship.deleteMany({ where: { OR: [{ requesterId: { in: ids } }, { recipientId: { in: ids } }] } })
    await db.rateLimitBucket.deleteMany({ where: { key: { in: ids.flatMap((id) => ['search', 'send', 'mutation'].map((scope) => `${scope}:${id}`)) } } })
  }
  beforeAll(async () => {
    for (const [index, id] of ids.entries()) await db.user.create({ data: { id, name: `${marker} ${index}`, email: `${id}@example.invalid`, accounts: { create: { type: 'oidc', provider: 'google', providerAccountId: id } } } })
  }, 20000)
  beforeEach(clearFixtures)
  afterAll(async () => { await clearFixtures(); await db.user.deleteMany({ where: { id: { in: ids } } }); await db.$disconnect() }, 20000)

  it('sends one pending invitation and a linked recipient notification atomically', async () => {
    const id = await service.change(a, 'send', b)
    expect(await db.friendship.findUnique({ where: { id } })).toMatchObject({ requesterId: a, recipientId: b, status: 'PENDING' })
    expect(await db.notification.count({ where: { friendshipId: id, userId: b, type: 'FRIEND_REQUEST_RECEIVED' } })).toBe(1)
    expect((await service.summary(b)).incoming).toBe(1)
    expect((await service.list(a, 'sent')).rows[0].person.email).toBeNull()
    expect((await service.list(b, 'incoming')).rows[0].person.email).toBeNull()
  })

  it('rejects self invitations and nonexistent targets', async () => {
    await expect(service.change(a, 'send', a)).rejects.toThrow('yourself')
    await expect(service.change(a, 'send', 'missing-user')).rejects.toThrow('not available')
  })

  it('prevents duplicate and reverse requests', async () => {
    await service.change(a, 'send', b)
    await expect(service.change(a, 'send', b)).rejects.toThrow()
    await expect(service.change(b, 'send', a)).rejects.toThrow()
    expect(await db.friendship.count({ where: { requesterId: a } })).toBe(1)
    expect(await db.notification.count({ where: { userId: b } })).toBe(1)
  })

  it('allows only the recipient to accept once and notifies the requester', async () => {
    const id = await service.change(a, 'send', b)
    await expect(service.change(a, 'accept', id)).rejects.toThrow()
    await expect(service.change(outsider, 'accept', id)).rejects.toThrow()
    await service.change(b, 'accept', id)
    await expect(service.change(b, 'accept', id)).rejects.toThrow()
    expect((await service.summary(a)).accepted).toBe(1)
    expect((await service.summary(b)).accepted).toBe(1)
    expect((await service.summary(b)).incoming).toBe(0)
    expect((await service.summary(b)).unread).toBe(0)
    expect(await db.notification.count({ where: { userId: a, type: 'FRIEND_REQUEST_ACCEPTED' } })).toBe(1)
    expect((await db.friendship.findUnique({ where: { id } }))?.connectedAt).not.toBeNull()
  })

  it('allows only the recipient to reject, preserves the row and enforces a reconnect cooldown', async () => {
    const id = await service.change(a, 'send', b)
    await expect(service.change(a, 'reject', id)).rejects.toThrow()
    await service.change(b, 'reject', id)
    await expect(service.change(b, 'reject', id)).rejects.toThrow()
    expect((await db.friendship.findUnique({ where: { id } }))?.status).toBe('REJECTED')
    await expect(service.change(a, 'send', b)).rejects.toThrow('24 hours')
    expect((await service.notifications(a)).rows[0].href).toContain('tab=sent')
  })

  it('allows only the requester to cancel a pending invitation', async () => {
    const id = await service.change(a, 'send', b)
    await expect(service.change(b, 'cancel', id)).rejects.toThrow()
    await expect(service.change(outsider, 'cancel', id)).rejects.toThrow()
    await service.change(a, 'cancel', id)
    await expect(service.change(a, 'cancel', id)).rejects.toThrow()
    expect((await service.summary(a)).outgoing).toBe(0)
    expect((await service.summary(b)).unread).toBe(0)
  })

  it('removes an accepted friend without deleting history and blocks future favors', async () => {
    const id = await service.change(a, 'send', b)
    await service.change(b, 'accept', id)
    const favor = await db.favor.create({ data: { providerId: a, beneficiaryId: b, createdById: a, status: 'CONFIRMED', occurredAt: new Date(), confirmedAt: new Date() } })
    await expect(service.change(outsider, 'remove', id)).rejects.toThrow()
    await service.change(a, 'remove', id)
    expect(await db.favor.findUnique({ where: { id: favor.id } })).not.toBeNull()
    expect((await service.summary(b)).accepted).toBe(0)
    await expect(service.assertConnected(a, b)).rejects.toThrow()
    await expect(db.favor.create({ data: { providerId: a, beneficiaryId: b, createdById: a, occurredAt: new Date() } })).rejects.toThrow()
  })

  it('allows either participant to remove and requires acceptance before removal', async () => {
    const id = await service.change(a, 'send', b)
    await expect(service.change(a, 'remove', id)).rejects.toThrow()
    await service.change(b, 'accept', id)
    await service.change(b, 'remove', id)
    await expect(service.change(a, 'remove', id)).rejects.toThrow()
  })

  it('reuses the same canonical row for a reverse-direction reconnect after cooldown', async () => {
    const id = await service.change(a, 'send', b)
    const createdAt = (await db.friendship.findUniqueOrThrow({ where: { id } })).createdAt
    await service.change(b, 'reject', id)
    await db.friendship.update({ where: { id }, data: { updatedAt: new Date(Date.now() - 86400001) } })
    expect(await service.change(b, 'send', a)).toBe(id)
    expect((await db.friendship.findUniqueOrThrow({ where: { id } })).createdAt).toEqual(createdAt)
    await service.change(a, 'accept', id)
    expect(await db.friendship.count({ where: { OR: [{ requesterId: a }, { recipientId: a }] } })).toBe(1)
  })

  it('handles concurrent opposite requests with one record and one invitation', async () => {
    const results = await Promise.allSettled([service.change(a, 'send', b), service.change(b, 'send', a)])
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(await db.friendship.count({ where: { OR: [{ requesterId: a }, { recipientId: a }] } })).toBe(1)
    expect(await db.notification.count({ where: { userId: { in: [a, b] } } })).toBe(1)
  })

  it('handles concurrent accept/reject with exactly one transition and response notification', async () => {
    const id = await service.change(a, 'send', b)
    const results = await Promise.allSettled([service.change(b, 'accept', id), service.change(b, 'reject', id)])
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(await db.notification.count({ where: { userId: a } })).toBe(1)
  })

  it('limits discovery to public fields, excludes self, and matches email/name case-insensitively', async () => {
    const result = await service.search(a, { query: marker.toLowerCase() })
    expect(result.people).toHaveLength(2)
    expect(result.people.some((person) => person.id === a)).toBe(false)
    expect(Object.keys(result.people[0]).sort()).toEqual(['id', 'name', 'image', 'relationship', 'friendshipId'].sort())
    const email = await service.search(a, { query: `${b}@EXAMPLE.INVALID` })
    expect(email.people.map((person) => person.id)).toEqual([b])
    await expect(service.search(a, { query: b.slice(0, 8) + '@' })).rejects.toThrow()
    for (const query of ['%%%', '___', '\\\\\\']) await expect(service.search(a, { query })).rejects.toThrow()
    await expect(service.search(a, { query: '' })).rejects.toThrow()
    await expect(service.search(a, { query: marker, page: 6 })).rejects.toThrow()
  })

  it('reports incoming/outgoing/friend status and hides blocked users', async () => {
    const id = await service.change(a, 'send', b)
    expect((await service.search(a, { query: `${b}@example.invalid` })).people[0].relationship).toBe('outgoing')
    expect((await service.search(b, { query: `${a}@example.invalid` })).people[0].relationship).toBe('incoming')
    await service.change(b, 'accept', id)
    expect((await service.search(a, { query: `${b}@example.invalid` })).people[0].relationship).toBe('accepted')
    await db.friendship.update({ where: { id }, data: { status: 'BLOCKED' } })
    expect((await service.search(a, { query: `${b}@example.invalid` })).people).toHaveLength(0)
    await expect(service.change(b, 'send', a)).rejects.toThrow()
  })

  it('restricts profile/history to accepted friends', async () => {
    const id = await service.change(a, 'send', b)
    expect(await service.profile(a, b)).toBeNull()
    await service.change(b, 'accept', id)
    expect((await service.profile(a, b))?.activity).toEqual([])
    expect(await service.profile(outsider, b)).toBeNull()
    await service.change(b, 'remove', id)
    expect(await service.profile(a, b)).toBeNull()
  })

  it('authorizes notification reads and mutations by owner', async () => {
    const id = await service.change(a, 'send', b)
    const notice = await db.notification.findFirstOrThrow({ where: { friendshipId: id } })
    expect((await service.notifications(a)).rows).toEqual([])
    await expect(service.markRead(a, notice.id)).rejects.toThrow()
    expect((await service.summary(b)).unread).toBe(1)
    await service.markRead(b, notice.id)
    expect((await service.summary(b)).unread).toBe(0)
  })

  it('shares rate limits across concurrent requests and app instances', async () => {
    const results = await Promise.allSettled(Array.from({ length: 12 }, () => service.rateLimit(a, 'send')))
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(10)
    await expect(createFriendsService(db).rateLimit(a, 'send')).rejects.toThrow('Too many attempts')
    await db.rateLimitBucket.update({ where: { key: `send:${a}` }, data: { expiresAt: new Date(Date.now() - 1000) } })
    await expect(service.rateLimit(a, 'send')).resolves.toBeUndefined()
  }, 15000)

  it('paginates discovery without leaking email or returning the complete directory', async () => {
    for (let index = 3; index < 23; index++) {
      const id = randomUUID(); ids.push(id)
      await db.user.create({ data: { id, name: `${marker} ${index}`, email: `${id}@example.invalid`, accounts: { create: { provider: 'google', type: 'oidc', providerAccountId: id } } } })
    }
    const first = await service.search(a, { query: marker, page: 1 })
    const second = await service.search(a, { query: marker, page: 2 })
    expect(first.people).toHaveLength(10); expect(first.hasMore).toBe(true)
    expect(second.people).toHaveLength(10)
    expect(first.people.some((person) => second.people.some((other) => other.id === person.id))).toBe(false)
    expect(first.people.every((person) => !('email' in person))).toBe(true)
  }, 15000)
})

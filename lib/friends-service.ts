import type { PrismaClient, Prisma } from '@/generated/prisma/client'
import { entityId, searchInput, type FriendOperation, type FriendTab } from './friend-types'
import { dbErrorCode as code } from './db-errors'
import { consumeRateLimit } from './rate-limit'

export class FriendError extends Error {}
const publicProfile = { id: true, name: true, image: true } as const
const contactProfile = { ...publicProfile, email: true } as const
const pair = (a: string, b: string) => ({ OR: [{ requesterId: a, recipientId: b }, { requesterId: b, recipientId: a }] })
const participant = (id: string) => ({ OR: [{ requesterId: id }, { recipientId: id }] })

export function createFriendsService(db: PrismaClient) {
  async function transaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try { return await db.$transaction(work, { isolationLevel: 'Serializable', timeout: 10000 }) }
      catch (error) {
        if (code(error) === 'P2034' && attempt < 2) continue
        if (code(error) === 'P2002') throw new FriendError('A request already exists between you. Refresh your circle.')
        if (code(error) === 'P2034') throw new FriendError('Your circle changed. Please try again.')
        throw error
      }
    }
  }

  async function rateLimit(actor: string, scope: 'search' | 'send' | 'mutation') {
    entityId.parse(actor)
    const limit = scope === 'search' ? 30 : scope === 'send' ? 10 : 30
    const windowMs = scope === 'search' ? 60000 : scope === 'send' ? 3600000 : 600000
    if (!await consumeRateLimit(db,actor,scope,limit,windowMs)) throw new FriendError('Too many attempts. Please wait before trying again.')
  }

  async function change(actor: string, operation: FriendOperation, id: string) {
    entityId.parse(actor); entityId.parse(id)
    return transaction(async (tx) => {
      if (operation === 'send') {
        if (actor === id) throw new FriendError('You cannot invite yourself.')
        const target = await tx.user.findFirst({ where: { id, accounts: { some: { provider: 'google' } } }, select: { id: true } })
        if (!target) throw new FriendError('This person is not available.')
        const existing = await tx.friendship.findFirst({ where: pair(actor, id) })
        if (existing && existing.status !== 'REJECTED') throw new FriendError('This connection is already active or unavailable.')
        if (existing && Date.now() - existing.updatedAt.getTime() < 86400000) throw new FriendError('Please wait 24 hours before reconnecting.')
        const friendship = existing
          ? await tx.friendship.update({ where: { id: existing.id }, data: { requesterId: actor, recipientId: id, status: 'PENDING', connectedAt: null } })
          : await tx.friendship.create({ data: { requesterId: actor, recipientId: id } })
        await tx.notification.create({ data: { userId: id, friendshipId: friendship.id, type: 'FRIEND_REQUEST_RECEIVED', title: 'New circle invitation', message: 'Someone would like to connect with you. Review your incoming requests.' } })
        return friendship.id
      }

      const friendship = await tx.friendship.findFirst({ where: { id, ...participant(actor) } })
      if (!friendship) throw new FriendError('This connection is not available.')
      const isRecipient = friendship.recipientId === actor
      const expectedStatus = operation === 'remove' ? 'ACCEPTED' : 'PENDING'
      if (friendship.status !== expectedStatus || (['accept', 'reject'].includes(operation) && !isRecipient) || (operation === 'cancel' && isRecipient)) {
        throw new FriendError('This action is no longer available to you.')
      }
      const updated = await tx.friendship.updateMany({
        where: { id, status: expectedStatus, ...participant(actor) },
        data: { status: operation === 'accept' ? 'ACCEPTED' : 'REJECTED', ...(operation === 'accept' ? { connectedAt: new Date() } : {}) },
      })
      if (updated.count !== 1) throw new FriendError('This request changed. Refresh your circle.')
      await tx.notification.updateMany({ where: { friendshipId: id, type: { in: ['FRIENDSHIP_REQUEST', 'FRIEND_REQUEST_RECEIVED'] }, readAt: null }, data: { readAt: new Date() } })
      if (operation === 'accept' || operation === 'reject') {
        await tx.notification.create({ data: {
          userId: friendship.requesterId, friendshipId: id,
          type: operation === 'accept' ? 'FRIEND_REQUEST_ACCEPTED' : 'FRIEND_REQUEST_REJECTED',
          title: operation === 'accept' ? 'Invitation accepted' : 'Invitation declined',
          message: operation === 'accept' ? 'Your circle has a new connection.' : 'Your invitation was declined.',
        } })
      }
      return id
    })
  }

  async function search(actor: string, input: unknown) {
    const { query, page } = searchInput.parse(input)
    await rateLimit(actor, 'search')
    // Exact email only. Name prefix search is bounded to 50 matches per query.
    // Requiring a Google account excludes seeds and unregistered identities.
    const people = await db.user.findMany({
      where: {
        id: { not: actor }, accounts: { some: { provider: 'google' } },
        ...(query.includes('@') ? { email: { equals: query, mode: 'insensitive' as const } } : { name: { startsWith: query, mode: 'insensitive' as const } }),
        NOT: { OR: [{ friendshipsRequested: { some: { recipientId: actor, status: 'BLOCKED' } } }, { friendshipsReceived: { some: { requesterId: actor, status: 'BLOCKED' } } }] },
      },
      select: publicProfile, orderBy: [{ name: 'asc' }, { id: 'asc' }], skip: (page - 1) * 10, take: page === 5 ? 10 : 11,
    })
    const matches = people.slice(0, 10)
    const relations = await db.friendship.findMany({ where: { AND: [participant(actor), { OR: [{ requesterId: { in: matches.map((person) => person.id) } }, { recipientId: { in: matches.map((person) => person.id) } }] }] } })
    return { hasMore: page < 5 && people.length > 10, people: matches.map((person) => {
      const relation = relations.find((row) => row.requesterId === person.id || row.recipientId === person.id)
      const relationship = relation?.status === 'ACCEPTED' ? 'accepted' : relation?.status === 'PENDING' ? relation.recipientId === actor ? 'incoming' : 'outgoing' : 'none'
      return { ...person, relationship: relationship as 'accepted' | 'incoming' | 'outgoing' | 'none', friendshipId: relation?.id ?? null }
    }) }
  }

  async function list(actor: string, tab: FriendTab, page = 1) {
    const where: Prisma.FriendshipWhereInput = tab === 'incoming' ? { recipientId: actor, status: 'PENDING' } : tab === 'sent' ? { requesterId: actor, status: 'PENDING' } : { ...participant(actor), status: 'ACCEPTED' }
    const [count, rows] = await Promise.all([
      db.friendship.count({ where }),
      db.friendship.findMany({ where, include: { requester: { select: contactProfile }, recipient: { select: contactProfile } }, orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }], skip: (page - 1) * 20, take: 20 }),
    ])
    return { count, rows: rows.map((row) => {
      const person = row.requesterId === actor ? row.recipient : row.requester
      return { id: row.id, person: { ...person, email: row.status === 'ACCEPTED' ? person.email : null }, status: row.status, connectedAt: row.connectedAt?.toISOString() ?? null, createdAt: (row.status === 'PENDING' ? row.updatedAt : row.createdAt).toISOString() }
    }) }
  }

  async function summary(actor: string) {
    const [accepted, incoming, outgoing, unread, preview] = await Promise.all([
      db.friendship.count({ where: { ...participant(actor), status: 'ACCEPTED' } }),
      db.friendship.count({ where: { recipientId: actor, status: 'PENDING' } }),
      db.friendship.count({ where: { requesterId: actor, status: 'PENDING' } }),
      db.notification.count({ where: { userId: actor, readAt: null } }),
      db.friendship.findMany({ where: { ...participant(actor), status: 'ACCEPTED' }, take: 4, orderBy: { connectedAt: 'desc' }, include: { requester: { select: contactProfile }, recipient: { select: contactProfile } } }),
    ])
    return { accepted, incoming, outgoing, unread, preview: preview.map((row) => ({ id: row.id, person: row.requesterId === actor ? row.recipient : row.requester, status: row.status, connectedAt: row.connectedAt?.toISOString() ?? null, createdAt: row.createdAt.toISOString() })) }
  }

  async function profile(actor: string, target: string) {
    entityId.parse(target)
    const friendship = await db.friendship.findFirst({ where: { ...pair(actor, target), status: 'ACCEPTED' }, include: { requester: { select: contactProfile }, recipient: { select: contactProfile } } })
    if (!friendship) return null
    const activity = await db.favor.findMany({ where: { status: 'CONFIRMED', OR: [{ providerId: actor, beneficiaryId: target }, { providerId: target, beneficiaryId: actor }] }, select: { id: true, providerId: true, occurredAt: true, subject: { select: { name: true } } }, orderBy: { occurredAt: 'desc' }, take: 10 })
    return { person: friendship.requesterId === actor ? friendship.recipient : friendship.requester, status: friendship.status, connectedAt: friendship.connectedAt?.toISOString() ?? null, activity: activity.map((row) => ({ id: row.id, description: row.providerId === actor ? 'You provided a favor' : 'Your friend provided a favor', subject: row.subject?.name ?? null, occurredAt: row.occurredAt.toISOString() })) }
  }

  async function notifications(actor: string, page = 1) {
    const [count, rows] = await Promise.all([
      db.notification.count({ where: { userId: actor } }),
      db.notification.findMany({ where: { userId: actor }, select: { id: true, title: true, message: true, type: true, readAt: true, createdAt: true, favorId: true, settlementId: true, friendship: { select: { requesterId: true, recipientId: true, status: true } } }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], skip: (page - 1) * 20, take: 20 }),
    ])
    return { count, rows: rows.map(({ friendship, ...row }) => ({ ...row, createdAt: row.createdAt.toISOString(), readAt: row.readAt?.toISOString() ?? null, href: row.settlementId ? `/dashboard/settlements/${row.settlementId}` : row.favorId ? `/dashboard/transactions/${row.favorId}` : friendship?.status === 'ACCEPTED' ? `/dashboard/friends/${friendship.requesterId === actor ? friendship.recipientId : friendship.requesterId}` : row.type === 'FRIEND_REQUEST_REJECTED' ? '/dashboard/friends?tab=sent' : friendship ? '/dashboard/friends?tab=incoming' : '/dashboard' })) }
  }
  async function markRead(actor: string, id: string) {
    entityId.parse(id)
    const result = await db.notification.updateMany({ where: { id, userId: actor, readAt: null }, data: { readAt: new Date() } })
    if (!result.count) throw new FriendError('This notification is already read or unavailable.')
  }
  async function assertConnected(actor: string, target: string) {
    if (!await db.friendship.findFirst({ where: { ...pair(actor, target), status: 'ACCEPTED' }, select: { id: true } })) throw new FriendError('An accepted connection is required.')
  }
  return { change, search, list, summary, profile, notifications, markRead, rateLimit, assertConnected }
}


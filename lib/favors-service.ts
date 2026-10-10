import 'server-only'
import type { Prisma, PrismaClient } from '@/generated/prisma/client'
import { createFavorInput, changeFavorInput, subjectInput, favorFilters, choiceInput, type FavorRecord } from './favor-types'
import { entityId } from './friend-types'
import { favorInputSchema } from './ledger'
import { dbErrorCode as errorCode } from './db-errors'
import { lockLedgerPair, ledgerTimestamp } from './ledger-lock'
import { consumeRateLimit } from './rate-limit'

export class FavorError extends Error {}
const person = { id: true, name: true, image: true } as const
const selection = {
  id: true, provider: { select: person }, beneficiary: { select: person }, createdBy: { select: person },
  subject: { select: { id: true, name: true } }, status: true, note: true, occurredAt: true,
  createdAt: true, updatedAt: true, confirmedAt: true, resolvedAt: true,
} as const
type Row = Prisma.FavorGetPayload<{ select: typeof selection }>
const dto = ({ occurredAt, createdAt, updatedAt, confirmedAt, resolvedAt, ...row }: Row): FavorRecord => ({ ...row, attendanceDate: occurredAt.toISOString().slice(0, 10), createdAt: createdAt.toISOString(), updatedAt: updatedAt.toISOString(), confirmedAt: confirmedAt?.toISOString() ?? null, resolvedAt: resolvedAt?.toISOString() ?? null })
const involved = (actor: string): Prisma.FavorWhereInput => ({ OR: [{ providerId: actor }, { beneficiaryId: actor }] })
// Prisma contains uses LIKE internally; escape metacharacters for literal search.
const literal = (value: string) => value.replace(/[\\%_]/g, '\\$&')

export function createFavorsService(db: PrismaClient) {
  async function transaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>, isolationLevel: 'ReadCommitted' | 'Serializable' = 'ReadCommitted') {
    for (let attempt = 0; ; attempt++) {
      try { return await db.$transaction(work, { isolationLevel, timeout: 10000 }) }
      catch (error) {
        if (['P2034', 'P2002'].includes(String(errorCode(error))) && attempt < 3) continue
        if (errorCode(error) === 'P2034') throw new FavorError('This record changed. Please refresh and try again.')
        if (errorCode(error) === 'P2002') throw new FavorError('This record already exists.')
        throw error
      }
    }
  }
  async function rateLimit(actor: string, scope: 'create' | 'change' | 'subject' | 'choices') {
    entityId.parse(actor)
    const limit = scope === 'create' ? 20 : scope === 'subject' ? 20 : 60
    const minutes = scope === 'create' || scope === 'subject' ? 60 : scope === 'choices' ? 1 : 10
    if (!await consumeRateLimit(db,actor,`favor-${scope}`,limit,minutes*60000)) throw new FavorError('Too many attempts. Please wait before trying again.')
  }
  async function create(actor: string, input: unknown) {
    entityId.parse(actor)
    const value = createFavorInput.parse(input)
    if (value.friendId === actor) throw new FavorError('Choose a friend other than yourself.')
    const data = favorInputSchema.parse({ providerId: value.direction === 'provided' ? actor : value.friendId, beneficiaryId: value.direction === 'provided' ? value.friendId : actor, createdById: actor, subjectId: value.subjectId, occurredAt: new Date(`${value.attendanceDate}T00:00:00Z`), note: value.note })
    return transaction(async tx => {
      const existing = await tx.favor.findUnique({ where: { createdById_submissionKey: { createdById: actor, submissionKey: value.submissionKey } } })
      if (existing) {
        if (existing.providerId !== data.providerId || existing.beneficiaryId !== data.beneficiaryId || existing.subjectId !== data.subjectId || existing.occurredAt.getTime() !== data.occurredAt.getTime() || (existing.note ?? '') !== value.note) throw new FavorError('This submission was already used. Start a new record.')
        return existing.id
      }
      const connection = await tx.friendship.findFirst({ where: { status: 'ACCEPTED', OR: [{ requesterId: actor, recipientId: value.friendId }, { requesterId: value.friendId, recipientId: actor }] }, select: { id: true } })
      if (!connection) throw new FavorError('An accepted friendship is required to record a favor.')
      if (!await tx.subject.findFirst({ where: { id: value.subjectId, ownerId: actor }, select: { id: true } })) throw new FavorError('Choose one of your own subjects.')
      const row = await tx.favor.create({ data: { ...data, submissionKey: value.submissionKey } })
      await tx.notification.create({ data: { userId: value.friendId, favorId: row.id, type: 'FAVOR_REQUEST_RECEIVED', title: 'Favor awaiting your confirmation', message: 'Review who helped whom, the subject, and the attendance date before confirming.' } })
      return row.id
    })
  }
  async function change(actor: string, input: unknown) {
    entityId.parse(actor)
    const { id, operation } = changeFavorInput.parse(input)
    return transaction(async tx => {
      const row = await tx.favor.findFirst({ where: { id, ...involved(actor) } })
      if (!row || row.status !== 'PENDING' || (operation === 'cancel' ? row.createdById !== actor : row.createdById === actor)) throw new FavorError('This action is no longer available to you.')
      await lockLedgerPair(tx, row.providerId, row.beneficiaryId)
      const now = await ledgerTimestamp(tx)
      const updated = await tx.favor.updateMany({ where: { id, status: 'PENDING', ...involved(actor), createdById: operation === 'cancel' ? actor : { not: actor } }, data: { status: operation === 'confirm' ? 'CONFIRMED' : operation === 'reject' ? 'REJECTED' : 'CANCELED', confirmedAt: operation === 'confirm' ? now : null, resolvedAt: now } })
      if (updated.count !== 1) throw new FavorError('This request changed. Refresh your transactions.')
      await tx.notification.updateMany({ where: { favorId: id, type: { in: ['FAVOR_REQUEST', 'FAVOR_REQUEST_RECEIVED'] }, readAt: null }, data: { readAt: now } })
      await tx.notification.create({ data: { userId: operation === 'cancel' ? row.providerId === actor ? row.beneficiaryId : row.providerId : row.createdById, favorId: id, type: operation === 'confirm' ? 'FAVOR_CONFIRMED' : operation === 'reject' ? 'FAVOR_REJECTED' : 'FAVOR_CANCELED', title: operation === 'confirm' ? 'Favor confirmed' : operation === 'reject' ? 'Favor rejected' : 'Favor canceled', message: operation === 'confirm' ? 'Both participants have acknowledged this favor. It now counts as one favor unit.' : 'This record remains in your history and does not affect balances.' } })
      return id
    })
  }
  async function createSubject(actor: string, input: unknown) {
    entityId.parse(actor)
    const { name } = subjectInput.parse(input)
    return transaction(async tx => {
      if (await tx.subject.findFirst({ where: { ownerId: actor, name: { equals: name, mode: 'insensitive' } }, select: { id: true } })) throw new FavorError('You already have a subject with that name.')
      return tx.subject.create({ data: { ownerId: actor, name }, select: { id: true, name: true } })
    }, 'Serializable')
  }
  async function subjects(actor: string, input: unknown = {}) {
    entityId.parse(actor)
    const { query, page } = choiceInput.parse(input)
    const where: Prisma.SubjectWhereInput = { ownerId: actor, ...(query ? { name: { contains: literal(query), mode: 'insensitive' } } : {}) }
    const [count, rows] = await Promise.all([db.subject.count({ where }), db.subject.findMany({ where, select: { id: true, name: true, _count: { select: { favors: true } } }, orderBy: [{ name: 'asc' }, { id: 'asc' }], skip: (page - 1) * 20, take: 20 })])
    return { count, rows }
  }
  async function friends(actor: string, input: unknown = {}) {
    entityId.parse(actor)
    const { query, page } = choiceInput.parse(input)
    const name = query ? { name: { contains: literal(query), mode: 'insensitive' as const } } : {}
    const rows = await db.friendship.findMany({ where: { status: 'ACCEPTED', OR: [{ requesterId: actor, recipient: name }, { recipientId: actor, requester: name }] }, select: { requesterId: true, requester: { select: person }, recipient: { select: person } }, orderBy: [{ connectedAt: 'desc' }, { id: 'asc' }], skip: (page - 1) * 20, take: 21 })
    return { hasMore: rows.length > 20, rows: rows.slice(0, 20).map(row => row.requesterId === actor ? row.recipient : row.requester) }
  }
  async function detail(actor: string, id: string) {
    entityId.parse(actor); entityId.parse(id)
    const row = await db.favor.findFirst({ where: { id, ...involved(actor) }, select: selection })
    return row ? dto(row) : null
  }
  async function historyChoices(actor: string, kind: 'friend' | 'subject', input: unknown = {}) {
    entityId.parse(actor)
    const { query, page } = choiceInput.parse(input)
    const name = query ? { name: { contains: literal(query), mode: 'insensitive' as const } } : {}
    const options = { orderBy: [{ name: 'asc' as const }, { id: 'asc' as const }], skip: (page - 1) * 20, take: 21, select: { id: true, name: true } }
    const rows = kind === 'subject'
      ? await db.subject.findMany({ ...options, where: { ...name, favors: { some: involved(actor) } } })
      : await db.user.findMany({ ...options, where: { ...name, id: { not: actor }, OR: [{ favorsProvided: { some: { beneficiaryId: actor } } }, { favorsReceived: { some: { providerId: actor } } }] } })
    return { rows: rows.slice(0, 20), hasMore: rows.length > 20 }
  }
  async function list(actor: string, input: unknown = {}) {
    entityId.parse(actor)
    const filter = favorFilters.parse(input)
    const and: Prisma.FavorWhereInput[] = [involved(actor)]
    if (filter.status === 'awaiting') and.push({ status: 'PENDING', createdById: { not: actor } })
    else if (filter.status !== 'all') and.push({ status: filter.status === 'closed' ? { in: ['REJECTED', 'CANCELED'] } : filter.status === 'pending' ? 'PENDING' : 'CONFIRMED' })
    if (filter.friend) and.push({ OR: [{ providerId: actor, beneficiaryId: filter.friend }, { providerId: filter.friend, beneficiaryId: actor }] })
    if (filter.subject) and.push({ subjectId: filter.subject })
    if (filter.from || filter.to) and.push({ occurredAt: { ...(filter.from ? { gte: new Date(`${filter.from}T00:00:00Z`) } : {}), ...(filter.to ? { lt: new Date(new Date(`${filter.to}T00:00:00Z`).getTime() + 86400000) } : {}) } })
    if (filter.q) {
      const contains = { contains: literal(filter.q), mode: 'insensitive' as const }
      and.push({ OR: [{ providerId: actor, beneficiary: { name: contains } }, { beneficiaryId: actor, provider: { name: contains } }, { subject: { name: contains } }] })
    }
    const where = { AND: and }
    const [count, rows] = await Promise.all([db.favor.count({ where }), db.favor.findMany({ where, select: selection, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], skip: (filter.page - 1) * 20, take: 20 })])
    return { count, rows: rows.map(dto) }
  }
  async function summary(actor: string, includeRecent = true) {
    entityId.parse(actor)
    const [confirmed, pending, awaiting, recent, recentConfirmed] = await Promise.all([
      db.favor.count({ where: { ...involved(actor), status: 'CONFIRMED' } }), db.favor.count({ where: { ...involved(actor), status: 'PENDING' } }),
      db.favor.count({ where: { ...involved(actor), status: 'PENDING', createdById: { not: actor } } }),
      includeRecent ? db.favor.findMany({ where: involved(actor), select: selection, orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }], take: 3 }) : Promise.resolve([]),
      db.favor.findMany({ where: { ...involved(actor), status: 'CONFIRMED' }, select: selection, orderBy: [{ confirmedAt: 'desc' }, { id: 'asc' }], take: 3 }),
    ])
    return { confirmed, pending, awaiting, recent: recent.map(dto), recentConfirmed: recentConfirmed.map(dto) }
  }
  return { create, change, createSubject, subjects, friends, historyChoices, detail, list, summary, rateLimit }
}

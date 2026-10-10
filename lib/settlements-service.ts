import 'server-only'
import type { Prisma, PrismaClient } from '@/generated/prisma/client'
import { entityId } from './friend-types'
import { proposeSettlementInput, resolveSettlementInput, settlementFilters, type SettlementRecord } from './settlement-types'
import { settlementDelta, settlementInputSchema, settlementParties } from './ledger'
import { authoritativePairBalance, lockLedgerPair, ledgerTimestamp } from './ledger-lock'
import { dbErrorCode } from './db-errors'
import { consumeRateLimit } from './rate-limit'

export class SettlementError extends Error {}
const person = { id: true, name: true, image: true } as const
const select = { id: true, requester: { select: person }, recipient: { select: person }, signedAmount: true, reason: true, status: true, createdAt: true, confirmedAt: true, resolvedAt: true } as const
const involved = (actor: string): Prisma.SettlementWhereInput => ({ OR: [{ requesterId: actor }, { recipientId: actor }] })
function dto(row: Prisma.SettlementGetPayload<{ select: typeof select }>): SettlementRecord {
  const parties = settlementParties(row.requester.id, row.recipient.id, row.signedAmount)
  return { ...row, debtor: row.requester.id === parties.debtorId ? row.requester : row.recipient, creditor: row.requester.id === parties.creditorId ? row.requester : row.recipient, amount: Math.abs(row.signedAmount), createdAt: row.createdAt.toISOString(), confirmedAt: row.confirmedAt?.toISOString() ?? null, resolvedAt: row.resolvedAt?.toISOString() ?? null }
}
export function createSettlementsService(db: PrismaClient) {
  async function transaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>) {
    for (let attempt = 0; ; attempt++) {
      try { return await db.$transaction(work, { isolationLevel: 'ReadCommitted', timeout: 15000 }) }
      catch (error) {
        if (['P2034','P2002'].includes(String(dbErrorCode(error))) && attempt < 3) continue
        if (dbErrorCode(error) === 'P2034') throw new SettlementError('Your ledger changed. Please try again.')
        if (dbErrorCode(error) === 'P2002') throw new SettlementError('This submission already exists.')
        throw error
      }
    }
  }
  async function rateLimit(actor: string, scope: 'create' | 'change') {
    if (!await consumeRateLimit(db, actor, `settlement-${scope}`, scope === 'create' ? 20 : 60, scope === 'create' ? 3600000 : 600000)) throw new SettlementError('Too many attempts. Please wait before trying again.')
  }
  async function propose(actor: string, input: unknown) {
    entityId.parse(actor)
    const value = proposeSettlementInput.parse(input)
    if (actor === value.friendId) throw new SettlementError('You cannot settle with yourself.')
    return transaction(async tx => {
      await lockLedgerPair(tx, actor, value.friendId)
      const previous = await tx.settlement.findUnique({ where: { requesterId_submissionKey: { requesterId: actor, submissionKey: value.submissionKey } } })
      if (previous) {
        if (previous.recipientId !== value.friendId || Math.abs(previous.signedAmount) !== value.amount || (previous.signedAmount > 0 ? 'i-owe' : 'owes-me') !== value.direction || (previous.reason ?? '') !== value.note) throw new SettlementError('This submission key was already used. Start a new request.')
        return previous.id
      }
      const balance = await authoritativePairBalance(tx, actor, value.friendId)
      let signedAmount: number
      try { signedAmount = settlementDelta(balance, value.amount, value.direction) } catch (error) { throw new SettlementError((error as Error).message) }
      const data = settlementInputSchema.parse({ requesterId: actor, recipientId: value.friendId, signedAmount, reason: value.note })
      const row = await tx.settlement.create({ data: { ...data, submissionKey: value.submissionKey } })
      await tx.notification.create({ data: { userId: value.friendId, settlementId: row.id, type: 'SETTLEMENT_REQUEST_RECEIVED', title: 'Settlement awaiting your confirmation', message: 'Review who owes whom and the proxy amount. The balance changes only after confirmation.' } })
      return row.id
    })
  }
  async function change(actor: string, input: unknown) {
    entityId.parse(actor)
    const { id, operation } = resolveSettlementInput.parse(input)
    // Immutable participants can be identified before locking. Read the current
    // status again after the lock; ReadCommitted then uses a fresh snapshot.
    const pair = await db.settlement.findFirst({ where: { id, ...involved(actor) }, select: { requesterId: true, recipientId: true } })
    if (!pair) throw new SettlementError('This settlement is unavailable.')
    return transaction(async tx => {
      await lockLedgerPair(tx, pair.requesterId, pair.recipientId)
      const row = await tx.settlement.findFirst({ where: { id, ...involved(actor) } })
      if (!row || row.status !== 'PENDING' || (operation === 'cancel' ? row.requesterId !== actor : row.recipientId !== actor)) throw new SettlementError('This action is no longer available to you.')
      if (operation === 'confirm') {
        const balance = await authoritativePairBalance(tx, row.requesterId, row.recipientId)
        try { settlementDelta(balance, Math.abs(row.signedAmount), row.signedAmount > 0 ? 'i-owe' : 'owes-me') } catch { throw new SettlementError('The debt changed. This request exceeds or contradicts the current balance. Reject or cancel it and propose a new amount.') }
      }
      const now = await ledgerTimestamp(tx)
      const updated = await tx.settlement.updateMany({ where: { id, status: 'PENDING', ...involved(actor), ...(operation === 'cancel' ? { requesterId: actor } : { recipientId: actor }) }, data: { status: operation === 'confirm' ? 'CONFIRMED' : operation === 'reject' ? 'REJECTED' : 'CANCELED', confirmedAt: operation === 'confirm' ? now : null, resolvedAt: now } })
      if (updated.count !== 1) throw new SettlementError('This request changed. Please refresh.')
      await tx.notification.updateMany({ where: { settlementId: id, type: { in: ['SETTLEMENT_REQUEST','SETTLEMENT_REQUEST_RECEIVED'] }, readAt: null }, data: { readAt: now } })
      await tx.notification.create({ data: { userId: operation === 'cancel' ? row.recipientId : row.requesterId, settlementId: id, type: operation === 'confirm' ? 'SETTLEMENT_CONFIRMED' : operation === 'reject' ? 'SETTLEMENT_REJECTED' : 'SETTLEMENT_CANCELED', title: operation === 'confirm' ? 'Settlement confirmed' : operation === 'reject' ? 'Settlement rejected' : 'Settlement canceled', message: operation === 'confirm' ? 'The agreed proxy reduction is now applied once to your shared ledger.' : 'This request remains in history without changing your balance.' } })
      return id
    })
  }
  async function detail(actor: string, id: string) {
    entityId.parse(actor); entityId.parse(id)
    const row = await db.settlement.findFirst({ where: { id, ...involved(actor) }, select })
    return row ? dto(row) : null
  }
  async function list(actor: string, input: unknown = {}) {
    entityId.parse(actor)
    const { tab, friend, page } = settlementFilters.parse(input)
    const and: Prisma.SettlementWhereInput[] = [involved(actor)]
    if (tab === 'incoming') and.push({ recipientId: actor, status: 'PENDING' })
    if (tab === 'outgoing') and.push({ requesterId: actor, status: 'PENDING' })
    if (tab === 'confirmed') and.push({ status: 'CONFIRMED' })
    if (tab === 'closed') and.push({ status: { in: ['REJECTED','CANCELED'] } })
    if (friend) and.push({ OR: [{ requesterId: actor, recipientId: friend }, { requesterId: friend, recipientId: actor }] })
    const where = { AND: and }
    const [count, rows] = await Promise.all([db.settlement.count({ where }), db.settlement.findMany({ where, select, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], take: 20, skip: (page - 1) * 20 })])
    return { count, rows: rows.map(dto) }
  }
  return { propose, change, detail, list, rateLimit }
}

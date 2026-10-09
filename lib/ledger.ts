import { z } from 'zod'

const id = z.string().min(1)
/** Positive input amounts reduce debt; the persisted sign is requester's delta. */
export function settlementDelta(balance: number, amount: number, direction: 'i-owe' | 'owes-me'): number {
  if (!Number.isSafeInteger(balance) || !Number.isInteger(amount) || amount < 1 || amount > 2147483647) throw new Error('Use a positive whole number of proxies.')
  if (!balance || (balance > 0 ? 'owes-me' : 'i-owe') !== direction || amount > Math.abs(balance)) throw new Error('The debt changed. Refresh and choose an amount within the current balance.')
  return balance > 0 ? -amount : amount
}
export function settlementParties(requesterId: string, recipientId: string, signedAmount: number) {
  return signedAmount > 0 ? { debtorId: requesterId, creditorId: recipientId } : { debtorId: recipientId, creditorId: requesterId }
}
export const favorInputSchema = z.object({
  providerId: id, beneficiaryId: id, createdById: id,
  subjectId: id.optional(), occurredAt: z.date(), note: z.string().max(2000).optional(),
}).superRefine((value, context) => {
  if (value.providerId === value.beneficiaryId) context.addIssue({ code: 'custom', message: 'Favor participants must differ', path: ['beneficiaryId'] })
  if (value.createdById !== value.providerId && value.createdById !== value.beneficiaryId) context.addIssue({ code: 'custom', message: 'Creator must be a participant', path: ['createdById'] })
})

export const settlementInputSchema = z.object({
  requesterId: id, recipientId: id,
  signedAmount: z.number().int().min(-2147483648).max(2147483647).refine((amount) => amount !== 0, 'Adjustment cannot be zero'),
  reason: z.string().max(2000).optional(),
}).refine((value) => value.requesterId !== value.recipientId, 'Settlement participants must differ')

export type LedgerFavor = {
  providerId: string; beneficiaryId: string; subjectId?: string | null
  status: 'PENDING' | 'CONFIRMED' | 'REJECTED' | 'REVERSED' | 'CANCELED'
}
export type LedgerSettlement = {
  requesterId: string; recipientId: string; signedAmount: number
  status: 'PENDING' | 'CONFIRMED' | 'REJECTED' | 'CANCELED'
}

/** Positive: friend owes current user. Negative: current user owes friend.
 * Each confirmed favor is one unit; subjects never partition the balance.
 * A settlement adds signedAmount for its requester and subtracts it for its recipient.
 */
export function calculateBilateralBalance(currentUserId: string, friendId: string, favors: readonly LedgerFavor[], settlements: readonly LedgerSettlement[] = []): number {
  if (!currentUserId || !friendId || currentUserId === friendId) throw new Error('Two distinct user IDs are required')
  let balance = 0
  for (const favor of favors) {
    if (favor.providerId === favor.beneficiaryId) throw new Error('Favor participants must differ')
    if (favor.status !== 'CONFIRMED') continue
    if (favor.providerId === currentUserId && favor.beneficiaryId === friendId) balance += 1
    else if (favor.providerId === friendId && favor.beneficiaryId === currentUserId) balance -= 1
  }
  for (const settlement of settlements) {
    settlementInputSchema.parse(settlement)
    if (settlement.status !== 'CONFIRMED') continue
    if (settlement.requesterId === currentUserId && settlement.recipientId === friendId) balance += settlement.signedAmount
    else if (settlement.requesterId === friendId && settlement.recipientId === currentUserId) balance -= settlement.signedAmount
  }
  if (!Number.isSafeInteger(balance)) throw new Error('Balance exceeds safe integer range')
  return balance
}

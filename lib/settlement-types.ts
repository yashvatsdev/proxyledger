import { z } from 'zod'
import { entityId, type PublicPerson } from './friend-types'

export const proposeSettlementInput = z.object({ friendId: entityId, amount: z.number().int().min(1).max(2147483647), direction: z.enum(['i-owe', 'owes-me']), note: z.string().trim().max(2000).default(''), submissionKey: z.uuid() })
export const resolveSettlementInput = z.object({ id: entityId, operation: z.enum(['confirm', 'reject', 'cancel']) })
export const settlementFilters = z.object({ tab: z.enum(['all', 'incoming', 'outgoing', 'confirmed', 'closed']).default('all'), friend: entityId.optional(), page: z.coerce.number().int().min(1).max(1000).default(1) })
export const balanceFilters = z.object({ tab: z.enum(['all', 'owes-me', 'i-owe', 'settled']).default('all'), sort: z.enum(['owed', 'owe', 'name', 'recent']).default('recent'), q: z.string().trim().max(80).default(''), page: z.coerce.number().int().min(1).max(1000).default(1) })
export type BalanceFilters = z.infer<typeof balanceFilters>
export type BalanceCard = { person: PublicPerson; balance: number; favors: number; pendingSettlements: number; lastActive: string | null; connected: boolean }
export type BalanceTotals = { owedToMe: number; iOwe: number; owesMeCount: number; iOweCount: number; settledCount: number; outstandingCount: number; relationshipCount: number; pendingSettlements: number; incomingSettlements: number }
export type SettlementRecord = { id: string; requester: PublicPerson; recipient: PublicPerson; debtor: PublicPerson; creditor: PublicPerson; amount: number; signedAmount: number; reason: string | null; status: 'PENDING' | 'CONFIRMED' | 'REJECTED' | 'CANCELED'; createdAt: string; confirmedAt: string | null; resolvedAt: string | null }
export type LedgerEntry = { id: string; kind: 'favor' | 'settlement'; friend: PublicPerson; submittedById: string; status: string; subject: string | null; note: string | null; attendanceDate: string | null; effectiveAt: string; createdAt: string; delta: number; plannedDelta: number; resultingBalance: number }
export function balanceExplanation(balance: number, name: string | null) {
  const friend = name || 'Your friend'
  return balance > 0 ? `${friend} owes you ${balance} ${balance === 1 ? 'proxy' : 'proxies'}.` : balance < 0 ? `You owe ${friend} ${Math.abs(balance)} ${balance === -1 ? 'proxy' : 'proxies'}.` : `You’re even with ${friend}.`
}
export const signedUnits = (value: number) => value > 0 ? `+${value}` : String(value)
export function ledgerEntryLabel(row: LedgerEntry) {
  const friend = row.friend.name || 'Your friend'
  if (row.kind === 'favor') return row.plannedDelta > 0 ? `You helped ${friend}` : `${friend} helped you`
  const amount = `${Math.abs(row.plannedDelta)} ${Math.abs(row.plannedDelta) === 1 ? 'proxy' : 'proxies'}`
  return row.status === 'CONFIRMED' ? `Settled ${amount} ${row.plannedDelta > 0 ? `you owed ${friend}` : `${friend} owed you`}` : `Settlement request: reduce ${amount} owed ${row.plannedDelta > 0 ? `by you to ${friend}` : `by ${friend} to you`}`
}

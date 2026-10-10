import 'server-only'
import type { Prisma } from '@/generated/prisma/client'

/** Acquire before reading the balance or changing a confirmed ledger event.
 * This is transaction-scoped and uses the same canonical key as DB triggers. */
export async function lockLedgerPair(tx: Prisma.TransactionClient, a: string, b: string) {
  await tx.$executeRaw`SELECT "proxy_lock_pair"(${a}, ${b})`
}
export async function authoritativePairBalance(tx: Prisma.TransactionClient, a: string, b: string) {
  const [row] = await tx.$queryRaw<{ balance: bigint }[]>`SELECT "proxy_pair_balance"(${a}, ${b}) AS balance`
  const balance = Number(row.balance)
  if (!Number.isSafeInteger(balance)) throw new Error('Balance exceeds safe integer range')
  return balance
}
export async function ledgerTimestamp(tx: Prisma.TransactionClient) {
  const [row] = await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`
  return row.now
}

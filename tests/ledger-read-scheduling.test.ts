import { expect, it, vi } from 'vitest'
import type { PrismaClient } from '../generated/prisma/client'
import { createLedgerService } from '../lib/ledger-service'

it('queues overview snapshots sequentially and retains repeatable-read isolation', async () => {
  let release!: (value: unknown) => void
  const summary = new Promise(resolve => { release = resolve })
  const raw = vi.fn().mockReturnValue(summary)
  let releaseSnapshot!: (value: unknown) => void
  const snapshot = new Promise(resolve => { releaseSnapshot = resolve })
  const transaction = vi.fn().mockReturnValueOnce(snapshot).mockResolvedValue([[{ count: BigInt(0) }], []])
  const db = { $queryRaw: raw, $transaction: transaction } as unknown as PrismaClient
  const pending = createLedgerService(db).overview('test-actor')
  expect(transaction).not.toHaveBeenCalled()
  raw.mockResolvedValue([])
  release([{ owedToMe: BigInt(0) }])
  await vi.waitFor(() => expect(transaction).toHaveBeenCalledTimes(1))
  releaseSnapshot([[{ count: BigInt(0) }], []])
  const result = await pending
  expect(result).toEqual({ summary: { owedToMe: 0 }, preview: [], recent: [] })
  expect(transaction).toHaveBeenCalledTimes(2)
  expect(transaction.mock.calls.every(call => call[1].isolationLevel === 'RepeatableRead')).toBe(true)
})

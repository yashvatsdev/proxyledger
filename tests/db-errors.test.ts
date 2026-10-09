import { expect, it } from 'vitest'
import { dbErrorCode } from '../lib/db-errors'
import { createFavorsService } from '../lib/favors-service'
import type { PrismaClient } from '../generated/prisma/client'

it.each(['40001', '40P01'])('recognizes PostgreSQL %s conflicts exposed at commit by the Prisma 7 adapter', originalCode => {
  expect(dbErrorCode({ name: 'DriverAdapterError', cause: { kind: 'TransactionWriteConflict', originalCode } })).toBe('P2034')
})
it('keeps known Prisma conflicts and uniqueness errors, without retrying unrelated failures', () => {
  expect(dbErrorCode({ code: 'P2034' })).toBe('P2034')
  expect(dbErrorCode({ name: 'DriverAdapterError', cause: { originalCode: '23505' } })).toBe('P2002')
  expect(dbErrorCode(new Error('connection closed'))).toBeNull()
  expect(dbErrorCode({ name: 'DriverAdapterError', cause: { originalCode: '23514' } })).toBeNull()
})
it('retries the complete serializable operation after an adapter commit conflict', async () => {
  let attempts = 0
  const db = { $transaction: async (work: (tx: unknown) => unknown) => {
    attempts++
    if (attempts === 1) throw Object.assign(new Error('TransactionWriteConflict'), { name: 'DriverAdapterError', cause: { kind: 'TransactionWriteConflict', originalCode: '40001' } })
    return work({ subject: { findFirst: async () => null, create: async () => ({ id: 'subject', name: 'Physics' }) } })
  } } as unknown as PrismaClient
  expect(await createFavorsService(db).createSubject('session-actor', { name: 'Physics' })).toEqual({ id: 'subject', name: 'Physics' })
  expect(attempts).toBe(2)
})

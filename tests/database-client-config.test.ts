import { afterEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ options: vi.fn() }))
vi.mock('../generated/prisma/client', () => ({ PrismaClient: class {
  constructor(options: unknown) { mocks.options(options) }
} }))
vi.mock('@prisma/adapter-pg', () => ({ PrismaPg: class {} }))
vi.mock('../lib/env', () => ({ getDatabaseEnv: () => ({ DATABASE_URL: 'postgresql://test:test@localhost/test' }) }))
import { getPrisma } from '../lib/db'
const singleton = globalThis as unknown as { prisma?: unknown }
afterEach(() => { delete singleton.prisma; vi.restoreAllMocks() })

it('uses one shared client with a bounded transaction acquisition wait', () => {
  delete singleton.prisma
  expect(getPrisma()).toBe(getPrisma())
  expect(mocks.options).toHaveBeenCalledTimes(1)
  expect(mocks.options.mock.calls[0][0].transactionOptions).toEqual({ maxWait: 10000 })
})

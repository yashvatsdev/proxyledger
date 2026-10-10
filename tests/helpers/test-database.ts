import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../../generated/prisma/client'

type Environment = Record<string, string | undefined>

// Test writes never fall back to the application or migration connection.
export function testDatabaseUrl(env: Environment = process.env) {
  const fail = () => { throw new Error('Integration tests require a separate TEST_DATABASE_URL and TEST_DATABASE_ISOLATED=1. Use a disposable, migrated non-production database.') }
  if (env.TEST_DATABASE_ISOLATED !== '1' || !env.TEST_DATABASE_URL || env.NODE_ENV === 'production') return fail()
  let target: URL
  try { target = new URL(env.TEST_DATABASE_URL) } catch { return fail() }
  if (!['postgres:', 'postgresql:'].includes(target.protocol) || !target.hostname || target.pathname === '/') return fail()
  for (const value of [env.DATABASE_URL, env.DIRECT_DATABASE_URL]) {
    if (!value) continue
    let application: URL
    try { application = new URL(value) } catch { return fail() }
    // Ignore credentials and ports: different roles/pooler ports can reach the same DB.
    if (application.hostname === target.hostname && decodeURIComponent(application.pathname) === decodeURIComponent(target.pathname)) return fail()
  }
  return target.href
}

export function getTestPrisma(enabled = true) {
  const connectionString = enabled ? testDatabaseUrl() : 'postgresql://test:test@localhost:5432/skipped_test'
  return new PrismaClient({ adapter: new PrismaPg({ connectionString, max: 5, connectionTimeoutMillis: 10000, idleTimeoutMillis: 30000 }) })
}

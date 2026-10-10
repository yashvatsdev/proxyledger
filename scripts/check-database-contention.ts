import 'dotenv/config'
import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma/client'
import { databasePoolConfig, databaseTransactionOptions } from '../lib/database-pool-config'
import { getDatabaseEnv } from '../lib/env'
import { authFailureSummary } from '../lib/auth-diagnostics'
import { randomUUID } from 'node:crypto'
import { createFriendsService } from '../lib/friends-service'
import { createFavorsService } from '../lib/favors-service'
import { createLedgerService } from '../lib/ledger-service'

// Two bounded SELECT-only scenarios. Never reads application rows or writes data.
async function scenario(maxWait: number, checkDashboard = false) {
  const pool = new Pool(databasePoolConfig(getDatabaseEnv().DATABASE_URL, true))
  // The project and adapter resolve different @types/pg versions; both accept
  // this runtime Pool, as verified by the shared-connection contention check.
  const adapter = new PrismaPg(pool as unknown as ConstructorParameters<typeof PrismaPg>[0])
  const db = new PrismaClient({ adapter, transactionOptions: { maxWait } })
  try {
    await db.$queryRaw`SELECT 1`
    const holder = await pool.connect()
    const occupied = holder.query('SELECT pg_sleep(2.6)').finally(() => holder.release())
    const start = performance.now()
    let code = 'passed'
    try {
      await db.$transaction(async tx => {
        await tx.$executeRaw`SET TRANSACTION READ ONLY`
        await tx.$queryRaw`SELECT 1`
      })
    } catch (error) {
      code = authFailureSummary(error).causes.find(cause => cause.code)?.code ?? 'unknown'
    }
    const elapsedMs = Math.round(performance.now() - start)
    await occupied
    if (checkDashboard && code === 'passed') {
      // Random non-existent actors: exercise the real queries without fetching
      // private user data, starting sessions or consuming rate-limit buckets.
      await Promise.all(Array.from({ length: 2 }, async () => {
        const actor = `read-only-probe-${randomUUID()}`
        await createFriendsService(db).summary(actor)
        await createFavorsService(db).summary(actor, false)
        await createLedgerService(db).overview(actor)
      }))
    }
    return { maxWait, result: code, elapsedMs, ...(checkDashboard && code === 'passed' ? { concurrentDashboardReads: 'passed' } : {}) }
  } finally { await db.$disconnect(); await pool.end() }
}
async function main() {
  const before = await scenario(2000)
  const after = await scenario(databaseTransactionOptions.maxWait, true)
  console.log(JSON.stringify({ event: 'read-only-connection-contention', before, after, writes: 'none' }))
  if (before.result !== 'P2028' || after.result !== 'passed') process.exitCode = 1
}
void main().catch(error => { console.error(JSON.stringify(authFailureSummary(error, 'database-probe'))); process.exitCode = 1 })

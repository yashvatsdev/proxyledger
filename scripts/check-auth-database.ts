import 'dotenv/config'
import { getPrisma } from '../lib/db'
import { authFailureSummary } from '../lib/auth-diagnostics'
import { Pool } from 'pg'
import { getDatabaseEnv } from '../lib/env'
import { databasePoolConfig } from '../lib/database-pool-config'
import { checkServerIdentity, type TLSSocket } from 'node:tls'

// Operator-only probe: SELECTs only, no OAuth requests or adapter writes.
async function main() {
  let db: ReturnType<typeof getPrisma> | undefined
  let pool: Pool | undefined
  let tlsVerified = false
  try {
    // Prisma maps TLS errors to P1011; this preserves the native safe TLS code.
    const config = databasePoolConfig(getDatabaseEnv().DATABASE_URL)
    pool = new Pool(config)
    const client = await pool.connect()
    try {
      if (config.ssl) {
        const stream = (client as unknown as { connection: { stream: TLSSocket } }).connection.stream
        if (!stream.authorized) throw new Error('Database TLS chain verification failed')
        const mismatch = checkServerIdentity(new URL(config.connectionString).hostname, stream.getPeerCertificate())
        if (mismatch) throw mismatch
        tlsVerified = true
      }
      await client.query('SELECT 1')
    } finally { client.release() }
    await pool.end()
    pool = undefined
    db = getPrisma()
    await db.$transaction(async tx => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`
      await tx.$queryRaw`SELECT 1`
      await tx.$queryRaw`SELECT "id", "email", "emailVerified", "name", "image" FROM "User" LIMIT 0`
      await tx.$queryRaw`SELECT "userId", "provider", "providerAccountId", "access_token", "id_token" FROM "Account" LIMIT 0`
      await tx.$queryRaw`SELECT "sessionToken", "userId", "expires" FROM "Session" LIMIT 0`
    }, { maxWait: 15000, timeout: 15000 })
    console.log(JSON.stringify({ event: 'authentication-database-probe', connectivity: 'passed', tlsChainAndHostnameVerified: tlsVerified, authTableReads: 'passed', writes: 'not-tested', target: 'process-environment-not-necessarily-vercel' }))
  } catch (error) {
    console.error(JSON.stringify(authFailureSummary(error, 'database-probe')))
    process.exitCode = 1
  } finally { await pool?.end(); await db?.$disconnect() }
}
void main()

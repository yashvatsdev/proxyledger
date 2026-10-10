import 'server-only'
import { TimedPool, TimedPrismaPg } from './timed-database-adapter'
import { PrismaClient } from '@/generated/prisma/client'
import { getDatabaseEnv } from './env'
import { databasePoolConfig, databaseTransactionOptions } from './database-pool-config'
import { reportOperationalFailure } from './operational-log'

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export function getPrisma(): PrismaClient {
  if (typeof window !== 'undefined') throw new Error('Database client is server-only')
  if (!globalForPrisma.prisma) {
    const { DATABASE_URL } = getDatabaseEnv()
    globalForPrisma.prisma = new PrismaClient({
      transactionOptions: databaseTransactionOptions,
      // Adapter and application resolve different @types/pg versions; both
      // use the same supported pg Pool runtime interface.
      adapter: new TimedPrismaPg(new TimedPool(databasePoolConfig(DATABASE_URL)) as unknown as ConstructorParameters<typeof TimedPrismaPg>[0], {
        disposeExternalPool: true,
        onPoolError: () => reportOperationalFailure('database-connection-failed'),
        onConnectionError: () => reportOperationalFailure('database-connection-failed'),
      }),
    })
  }
  return globalForPrisma.prisma
}

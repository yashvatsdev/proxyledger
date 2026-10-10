import 'server-only'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@/generated/prisma/client'
import { getDatabaseEnv } from './env'
import { databasePoolConfig } from './database-pool-config'
import { reportOperationalFailure } from './operational-log'

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export function getPrisma(): PrismaClient {
  if (typeof window !== 'undefined') throw new Error('Database client is server-only')
  if (!globalForPrisma.prisma) {
    const { DATABASE_URL } = getDatabaseEnv()
    globalForPrisma.prisma = new PrismaClient({
      adapter: new PrismaPg(databasePoolConfig(DATABASE_URL), {
        onPoolError: () => reportOperationalFailure('database-connection-failed'),
        onConnectionError: () => reportOperationalFailure('database-connection-failed'),
      }),
    })
  }
  return globalForPrisma.prisma
}

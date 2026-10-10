import 'server-only'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@/generated/prisma/client'
import { getDatabaseEnv } from './env'

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export function getPrisma(): PrismaClient {
  if (typeof window !== 'undefined') throw new Error('Database client is server-only')
  if (!globalForPrisma.prisma) {
    const { DATABASE_URL } = getDatabaseEnv()
    globalForPrisma.prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: DATABASE_URL, max: 5, connectionTimeoutMillis: 10_000, idleTimeoutMillis: 30_000 }),
    })
  }
  return globalForPrisma.prisma
}

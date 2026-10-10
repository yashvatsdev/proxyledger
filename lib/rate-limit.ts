import 'server-only'
import type { PrismaClient } from '@/generated/prisma/client'
import { entityId } from './friend-types'

export async function consumeRateLimit(db: PrismaClient, actor: string, scope: string, limit: number, windowMs: number) {
  entityId.parse(actor)
  const key = `${scope}:${actor}`
  const [bucket] = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimitBucket" ("key", "count", "expiresAt") VALUES (${key}, 1, CURRENT_TIMESTAMP + ${windowMs} * INTERVAL '1 millisecond')
    ON CONFLICT ("key") DO UPDATE SET
      "count"=CASE WHEN "RateLimitBucket"."expiresAt"<=CURRENT_TIMESTAMP THEN 1 ELSE LEAST("RateLimitBucket"."count"+1,${limit+1}) END,
      "expiresAt"=CASE WHEN "RateLimitBucket"."expiresAt"<=CURRENT_TIMESTAMP THEN CURRENT_TIMESTAMP + ${windowMs} * INTERVAL '1 millisecond' ELSE "RateLimitBucket"."expiresAt" END
    RETURNING "count"`
  return Boolean(bucket && bucket.count <= limit)
}

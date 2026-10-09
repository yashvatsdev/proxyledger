import type { PrismaClient } from '@/generated/prisma/client'
import { entityId } from './friend-types'

export async function consumeRateLimit(db: PrismaClient, actor: string, scope: string, limit: number, windowMs: number) {
  entityId.parse(actor)
  const key = `${scope}:${actor}`
  const expires = new Date(Date.now() + windowMs)
  const [bucket] = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimitBucket" ("key", "count", "expiresAt") VALUES (${key}, 1, ${expires})
    ON CONFLICT ("key") DO UPDATE SET
      "count"=CASE WHEN "RateLimitBucket"."expiresAt"<=CURRENT_TIMESTAMP THEN 1 ELSE LEAST("RateLimitBucket"."count"+1,${limit+1}) END,
      "expiresAt"=CASE WHEN "RateLimitBucket"."expiresAt"<=CURRENT_TIMESTAMP THEN ${expires} ELSE "RateLimitBucket"."expiresAt" END
    RETURNING "count"`
  return Boolean(bucket && bucket.count <= limit)
}

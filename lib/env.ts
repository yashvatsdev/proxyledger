import { z } from 'zod'

const postgresUrl = z.string().url().refine((value) => {
  const protocol = new URL(value).protocol
  return protocol === 'postgresql:' || protocol === 'postgres:'
}, 'Must be a PostgreSQL connection URL')

export const databaseEnvSchema = z.object({
  DATABASE_URL: postgresUrl,
  DIRECT_DATABASE_URL: postgresUrl.optional(),
})

// Validate only when database tooling/client is used, so frontend builds need no DB secrets.
export function getDatabaseEnv(source: Record<string, string | undefined> = process.env) {
  const result = databaseEnvSchema.safeParse(source)
  if (!result.success) {
    // Do not include connection values (which can contain credentials) in errors.
    throw new Error(`Invalid database environment: ${result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`)
  }
  return result.data
}

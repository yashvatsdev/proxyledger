import 'dotenv/config'
import { defineConfig } from 'prisma/config'
import { getDatabaseEnv } from './lib/env'

const env = getDatabaseEnv()

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations', seed: 'node --conditions=react-server --import tsx prisma/seed.ts' },
  datasource: { url: env.DIRECT_DATABASE_URL ?? env.DATABASE_URL },
})

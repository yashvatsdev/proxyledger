import 'dotenv/config'
import { execFileSync } from 'node:child_process'

// Generation needs the datasource configuration, but never opens a connection.
execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'generate'], {
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL ?? 'postgresql://generation:generation@localhost:5432/generation' },
})

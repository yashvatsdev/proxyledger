import 'dotenv/config'
import pg from 'pg'

const db = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 })
try {
  await db.connect()
  const { rows } = await db.query(`
    SELECT c.relname AS table_name, c.relrowsecurity AS rls,
      has_table_privilege('anon', c.oid, 'SELECT') AS anon_read,
      has_table_privilege('authenticated', c.oid, 'SELECT') AS authenticated_read
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname IN ('Friendship', 'Notification', 'RateLimitBucket')
  `)
  const { rows: indexes } = await db.query(`SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'Friendship_unordered_pair_key'`)
  const { rows: constraints } = await db.query(`SELECT conname FROM pg_constraint WHERE conname = 'Friendship_distinct_participants'`)
  const { rows: triggers } = await db.query(`SELECT tgname FROM pg_trigger WHERE tgname = 'Favor_requires_accepted_friendship' AND NOT tgisinternal`)
  const { rows: fixtures } = await db.query(`SELECT COUNT(*)::int AS count FROM "User" WHERE "name" LIKE 'Phase3Test%' AND "email" LIKE '%@example.invalid'`)
  const safe = rows.length === 3 && rows.every((row) => row.rls && !row.anon_read && !row.authenticated_read)
  console.log(JSON.stringify({ circleTablesProtected: safe, canonicalIndexPreserved: indexes.length === 1, selfConstraintPreserved: constraints.length === 1, favorConnectionGuardPresent: triggers.length === 1, temporaryTestUsersRemaining: fixtures[0].count }, null, 2))
  if (!safe || !indexes.length || !constraints.length || !triggers.length || fixtures[0].count) process.exitCode = 1
} catch {
  console.error('Friendship database verification failed. Connection details withheld.')
  process.exitCode = 1
} finally { await db.end() }

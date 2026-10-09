import 'dotenv/config'
import pg from 'pg'

// Read-only verification; never print connection values, tokens, or user records.
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 })
try {
  await client.connect()
  // Check the current runtime connection can still read the server-only tables.
  await client.query('SELECT id FROM "User" LIMIT 0')
  await client.query('SELECT id FROM "Session" LIMIT 0')
  const result = await client.query(`
    SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled,
      has_table_privilege('anon', c.oid, 'SELECT') AS anon_select,
      has_table_privilege('authenticated', c.oid, 'SELECT') AS authenticated_select
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname IN ('User', 'Account', 'Session', 'VerificationToken')
    ORDER BY c.relname
  `)
  console.log('Runtime table access verified.')
  console.log(JSON.stringify(result.rows, null, 2))
  if (result.rows.length !== 4 || result.rows.some((row) => !row.rls_enabled && (row.anon_select || row.authenticated_select))) {
    console.error('Auth tables are missing or may be exposed through Supabase Data API roles.')
    process.exitCode = 1
  }
} catch {
  console.error('Database verification failed; details withheld to protect connection secrets.')
  process.exitCode = 1
} finally {
  await client.end()
}

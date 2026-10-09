import 'dotenv/config'
import pg from 'pg'
import { readFile, writeFile } from 'node:fs/promises'
const db = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 })
const file = new URL('../.phase4-baseline.json', import.meta.url)
try {
  await db.connect()
  const snapshot = {}
  const columns = { User: '"id", "name", "email", "createdAt", "updatedAt"', Friendship: '"id", "requesterId", "recipientId", "status", "createdAt", "updatedAt", "connectedAt"', Subject: '"id", "name", "code", "ownerId", "createdAt", "updatedAt"', Favor: '"id", "providerId", "beneficiaryId", "createdById", "subjectId", "occurredAt", "note", "status", "confirmedAt", "createdAt", "updatedAt"', Settlement: '"id", "requesterId", "recipientId", "signedAmount", "reason", "status", "confirmedAt", "createdAt"', Notification: '"id", "userId", "type", "title", "message", "readAt", "createdAt", "friendshipId"' }
  for (const [table, fields] of Object.entries(columns)) {
    const { rows } = await db.query(`SELECT count(*)::int AS count, md5(coalesce(string_agg(row_to_json(t)::text, '' ORDER BY t."id"), '')) AS checksum FROM (SELECT ${fields} FROM "${table}") t`)
    snapshot[table] = rows[0]
  }
  if (process.argv.includes('--snapshot')) { await writeFile(file, JSON.stringify(snapshot)); console.log('Saved original counts and checksums without personal data.') }
  else {
    const original = JSON.parse(await readFile(file, 'utf8'))
    const preserved = JSON.stringify(snapshot) === JSON.stringify(original)
    const { rows } = await db.query(`SELECT c.relname, c.relrowsecurity AS rls, has_table_privilege('anon', c.oid, 'SELECT') AS anon_read, has_table_privilege('authenticated', c.oid, 'SELECT') AS authenticated_read FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('Subject','Favor')`)
    const protectedTables = rows.length === 2 && rows.every(row => row.rls && !row.anon_read && !row.authenticated_read)
    console.log(JSON.stringify({ originalRecordsPreserved: preserved, favorTablesProtected: protectedTables, counts: Object.fromEntries(Object.entries(snapshot).map(([key,value]) => [key,value.count])) }, null, 2))
    if (!preserved || !protectedTables) process.exitCode = 1
  }
} catch { console.error('Favor database verification failed. Connection and personal details withheld.'); process.exitCode = 1 }
finally { await db.end() }

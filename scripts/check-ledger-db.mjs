import 'dotenv/config'
import pg from 'pg'
import { readFile, writeFile } from 'node:fs/promises'
const db = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 })
const file = new URL('../.phase5-baseline.json', import.meta.url)
try {
  await db.connect()
  const snapshot = {}
  for (const table of ['User','Friendship','Subject','Favor','Settlement','Notification']) {
    const columns = table === 'Settlement' ? '"id","requesterId","recipientId","signedAmount","reason","status","confirmedAt","createdAt"' : table === 'Notification' ? '"id","userId","type","title","message","readAt","createdAt","friendshipId","favorId"' : '*'
    const { rows } = await db.query(`SELECT count(*)::int AS count, md5(coalesce(string_agg(row_to_json(t)::text,'' ORDER BY t."id"),'')) AS checksum FROM (SELECT ${columns} FROM "${table}") t`)
    snapshot[table] = rows[0]
  }
  if (process.argv.includes('--snapshot')) { await writeFile(file, JSON.stringify(snapshot)); console.log('Saved original counts/checksums without disclosing record contents.') }
  else {
    const baseline = JSON.parse(await readFile(file,'utf8'))
    const preserved = JSON.stringify(snapshot) === JSON.stringify(baseline)
    const { rows: protection } = await db.query(`SELECT c.relname, c.relrowsecurity AS rls, has_table_privilege('anon',c.oid,'SELECT') AS anon_read,has_table_privilege('authenticated',c.oid,'SELECT') AS authenticated_read FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('Settlement','ProxyLedgerEvents')`)
    const protectedTables = protection.length===2 && protection.every(row => !row.anon_read && !row.authenticated_read && (row.relname!=='Settlement'||row.rls))
    const { rows: triggers } = await db.query(`SELECT tgname FROM pg_trigger WHERE NOT tgisinternal AND tgname IN ('Settlement_guards_ledger','Favor_serializes_ledger','Favor_preserves_history')`)
    console.log(JSON.stringify({ originalRecordsPreserved: preserved, ledgerAccessProtected: protectedTables, ledgerTriggersPresent: triggers.length===3, counts: Object.fromEntries(Object.entries(snapshot).map(([table,value])=>[table,value.count])) },null,2))
    if (!preserved||!protectedTables||triggers.length!==3) process.exitCode=1
  }
} catch { console.error('Ledger verification failed. Private connection and record details withheld.'); process.exitCode=1 }
finally { await db.end() }

import 'dotenv/config'
import pg from 'pg'
const db = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 })
try {
  await db.connect()
  const { rows: enums } = await db.query(`SELECT enumlabel FROM pg_enum JOIN pg_type ON pg_type.oid=enumtypid WHERE typname='FavorStatus' AND enumlabel='CANCELED'`)
  const { rows: columns } = await db.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='Favor' AND column_name IN ('resolvedAt','submissionKey')`)
  const { rows: migrations } = await db.query(`SELECT migration_name, finished_at IS NOT NULL AS finished, rolled_back_at IS NOT NULL AS rolled_back, applied_steps_count FROM "_prisma_migrations" WHERE migration_name='20261010020000_favors_confirmation'`)
  console.log(JSON.stringify({ newEnumPresent: enums.length > 0, newColumns: columns.map(row => row.column_name), migrations }, null, 2))
} catch { console.error('Migration inspection failed; private details withheld.'); process.exitCode=1 }
finally { await db.end() }

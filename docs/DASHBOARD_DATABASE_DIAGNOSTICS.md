# Dashboard P2028 investigation

10 October 2026. Owner reports successful production Google sign-in, followed by `/dashboard` failures with Prisma 7.10.0 `P2028`: unable to start a transaction in the given time. Work below is local code preparation and read-only database verification. No push, deployment, production settings change, migration or record mutation.

## Cause and evidence

The confirmed code defect is a mismatch between the shared pool and transaction acquisition budget, aggravated by dashboard query fan-out. `databasePoolConfig()` caps Vercel's pool at one connection per warm instance; all concurrent invocations on that instance share it. Prisma's installed runtime defaults to a 2,000 ms transaction acquisition wait, whereas `pg` allows 10,000 ms for connection acquisition. Thus a transaction can fail while ordinary reads legitimately occupy the connection. The transaction has not started yet; the raw query named by Prisma does not prove that its SQL executed or is invalid.

`app/dashboard/page.tsx` previously launched circle, favor and ledger summaries together. Circle summary launches five ordinary reads; favor summary launches four for the dashboard; ledger overview launches totals plus two transactions. `createLedgerService().list()` and `.entries()` each wrap count and page `$queryRaw` statements in a `RepeatableRead` batch transaction. Prisma 7's installed `requestBatch` implementation starts a driver transaction for these raw-query batches; its `startTransaction()` acquires a connection from the same pg pool and runs BEGIN. Concurrent requests add further contenders.

Read-only reproduction on the actual TLS-verified runtime endpoint: warm a one-connection pool, hold its connection with a single `SELECT pg_sleep(2.6)`, then request a read-only transaction. At `maxWait=2000`, it failed with **P2028 in 2006 ms**. At `maxWait=10000`, it succeeded in **2804 ms**. Two concurrent synthetic dashboard service loads subsequently passed on the same one-connection pool using the new scheduling. Actors were random, non-existent identifiers; no private row data was printed and no auth/session/rate-limit writes were performed. This confirms the acquisition-failure mechanism, not the exact queue lengths or server capacity during the reported production requests.

The installed Prisma 7 reference documents the two-second acquisition default and client-level `transactionOptions`: [Prisma 7 client reference](https://www.prisma.io/docs/orm/v7/reference/prisma-client-reference). Supabase recommends transaction pooling and a shared small pool for serverless workloads: [Supabase connection guidance](https://supabase.com/docs/guides/database/connecting-to-postgres). Current Prisma 8 examples do not apply to this Prisma 7 client.

## Configuration review

- Local runtime endpoint: `aws-0-ap-south-1.pooler.supabase.com:6543`, indicating the shared Supabase transaction pooler in AWS Mumbai (`ap-south-1`). Credentials and project reference are omitted. Live Vercel variable values and runtime region were not accessible and are not independently verified.
- `DATABASE_URL` is runtime; `DIRECT_DATABASE_URL` is for tooling. No migration connection was used.
- Adapter: `@prisma/adapter-pg` 7.10.0. It passes `databasePoolConfig()` to pg; URL `connection_limit`/`pool_timeout` are not used to set this driver's pool policy. The installed adapter supplies no named statement unless a `statementNameGenerator` is configured; none is configured, so no named prepared-statement defect was found.
- Pool cap remains one on Vercel and five locally; connection acquisition remains bounded at ten seconds and idle timeout at thirty seconds. One cached Prisma client is reused per warm instance. No connection is created per service/request and no handler disconnects the shared client.
- TLS remains `rejectUnauthorized: true` with validated `DATABASE_SSL_CA` PEM. CA-preservation and invalid TLS option tests still pass; no verification bypass introduced.
- No `regions`/`preferredRegion` setting exists in the repository. The existing deployment proposal recommends `bom1` near Mumbai. The owner should confirm the current Vercel function region and actual Supabase region; region alignment is a separate deployment decision, not a production setting changed here.

## Rate limits and transaction safety

`consumeRateLimit()` is a single parameterized atomic INSERT/ON CONFLICT/RETURNING statement using PostgreSQL CURRENT_TIMESTAMP. It does not fetch the clock in a separate query and has no explicit transaction wrapper. Dashboard loading does not call it; search/mutation actions do. Database-clock ledger timestamp reads are confined to accounting writes and run on the supplied transaction client. No nested root-client call or deadlock was found on the dashboard path. React request-scoped caches already deduplicate session and circle reads between page/layout.

Ledger count/page transactions remain `RepeatableRead`, preserving their shared snapshot. Friend/favor/settlement writes retain their isolation levels, execution timeouts, retry rules and pair locks. No automatic P2028 mutation retries were added. No accounting SQL, authorization, rate-limit policy or output DTO was changed.

## Exact changes

- `lib/database-pool-config.ts`: export a bounded 10,000 ms transaction acquisition policy.
- `lib/db.ts`: apply that policy through PrismaClient `transactionOptions`. Execution timeout and isolation defaults are unchanged; explicit service overrides remain unchanged.
- `app/dashboard/page.tsx`: await circle and favor summaries before ledger reads rather than launching all three groups together.
- `lib/ledger-service.ts`: await totals, balance snapshot and event snapshot sequentially in overview. Query contents and snapshots remain unchanged.
- `tests/database-pool-config.test.ts`, `tests/database-client-config.test.ts`, `tests/dashboard-data.test.ts`, `tests/ledger-read-scheduling.test.ts`: four regressions covering the bounded policy, shared-client wiring, dashboard scheduling and non-overlapping ledger snapshots with RepeatableRead intact.
- `scripts/check-database-contention.ts`: operator-only bounded SELECT reproduction and two concurrent synthetic dashboard service loads. Run explicitly with `node --conditions=react-server --import tsx scripts/check-database-contention.ts`; never part of normal build/runtime.
- This report. The previously modified `.env.example` is unrelated to this fix and remains uncommitted.

## Validation and deployment

TypeScript and ESLint passed. Vitest: **141 passed, 88 skipped, 0 failed; 25 suites passed, 3 skipped; 2.93 seconds**. Database-writing integration suites stayed disabled. Production Next.js 16.4 build passed. The read-only reproduction and concurrent synthetic service loads passed as described above.

Deploy the four changed runtime source files together after owner approval; include tests/script/report for review. No new variables, secrets, certificates, schema changes or database migrations are needed. Nothing was committed, pushed or deployed during this investigation.

After release, test an existing authenticated account's dashboard, refreshes and simultaneous tabs, then inspect sanitized P2028 diagnostics. A ten-second queue budget is bounded mitigation, not unlimited capacity: sustained load or slow queries can still exhaust it. Monitor dashboard latency, database CPU/pool utilization and the Vercel function region before considering pool increases or query tuning. Synthetic empty-actor probes do not benchmark large real ledgers, reproduce browser navigation, or establish that production is fixed before deployment.

## Authorized main-branch release

The owner subsequently authorized committing the reviewed fix and pushing to GitHub main to trigger the existing Vercel Git deployment. Release checks were repeated: TypeScript and ESLint passed, Vitest 141 passed / 88 skipped / 0 failed (25 suites passed, 3 skipped; 12.68 seconds), and production build passed. The ten release files passed a local check for existing environment credential values and full certificate contents. `.env.example` remains excluded from the release; `.env` and `certificates/prod-ca.crt` remain ignored. No migrations, record changes or production environment changes are part of this release. Git push and deployment success must be confirmed separately from local build success.

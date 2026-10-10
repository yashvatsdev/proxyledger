# Proxy Ledger performance audit

11 October 2026. Baseline source: commit `8a9c16eab81267f58946dc99f6c1491be17e5f7d`. Improvements are local and uncommitted. No production traffic benchmark was performed. Production records, schema, infrastructure and secrets were unchanged; nothing was pushed or deployed.

## Outcome

The strongest measured improvement is the dashboard ledger overview: a paired, alternating-order benchmark on the same rows and one-connection pool reduced P95 from **17.17 ms to 4.57 ms** (73%). Its observed Prisma SQL event count fell from **7 to 1**. The old overview performed five SELECT statements and two paginated read transactions; the new overview uses one statement and one PostgreSQL snapshot, returning only the four balance cards and five recent events needed by the dashboard.

Final warm dashboard HTTP completion P95 was **38.34 ms**, compared with **53.11 ms** before changes. These are local production-build measurements, not Vercel/Supabase production percentiles. The requested production P95 below 200 ms remains an objective to validate in an approved preview and production observation window. Fresh-process requests exceeded 200 ms locally; no universal latency guarantee is made.

## Safety and environment

- New disposable Docker PostgreSQL 16 database, loopback port 55449; never the application/Supabase database.
- Five existing migrations applied only to that empty disposable database. No migration or schema file changed.
- Synthetic UUID-scoped fixtures: 11 users, 10 accepted friendships, 300 confirmed favors, one subject, and an opaque test session. No real Google accounts or provider tokens were used in benchmarks.
- Next.js production build, Node 24.18.1, pool size one via process-local `VERCEL=1`.
- Sequential HTTP requests: concurrency one, 100 warm samples per route after five warm-ups. No high-concurrency production load test.
- Three independently restarted Node processes per route for process-cold observations. Database/OS caches remained warm; server readiness precedes request timing. These are not Vercel cold-start measurements.
- Fixtures are removed only by their generated IDs. Benchmark tools require explicit isolation, a loopback endpoint, and the existing test helper's rejection of application/migration targets and production mode. Host aliases/tunnels still require operator verification.
- Local environment metadata, without credentials: runtime shared transaction pooler 6543 and migration shared session endpoint 5432 encode `ap-south-1`. Production `bom1` and Mumbai alignment are owner-reported; this audit did not read/change Vercel project settings.

## Baseline and final measurements

All values below are milliseconds; entries are **P50 / P95 / P99** using nearest-rank percentiles. HTTP completion includes fetching the complete streamed response over loopback, not just its initial headers.

| Route | Baseline warm HTTP | Final warm HTTP |
| --- | --- | --- |
| `/` | 7.15 / 15.07 / 17.16 | 6.89 / 16.50 / 21.58 |
| `/dashboard` | 43.80 / 53.11 / 56.07 | 31.03 / 38.34 / 40.99 |
| `/dashboard/friends` | 28.13 / 34.41 / 36.19 | 28.92 / 37.91 / 52.38 |
| `/dashboard/balances` | 28.62 / 37.03 / 40.16 | 24.23 / 33.12 / 37.15 |
| `/dashboard/transactions` | 28.23 / 35.97 / 39.29 | 27.27 / 37.14 / 41.75 |
| `/api/auth/session` | 15.44 / 19.53 / 20.86 | 14.88 / 18.61 / 19.91 |

Some tails worsened between runs. The unchanged landing page, session endpoint, and intermediate measurements also varied, so these small changes are not reliable causal improvements. Friends and transactions completion latency is not claimed to improve. The paired SQL comparison gives stronger evidence than separate full-page runs; larger, interleaved preview samples are needed for production conclusions.

| Route | Baseline warm TTFB P95 | Final warm TTFB P95 |
| --- | --- | --- |
| `/` | 14.53 | 15.96 |
| `/dashboard` | 29.53 | 24.56 |
| `/dashboard/friends` | 29.98 | 27.38 |
| `/dashboard/balances` | 36.31 | 24.54 |
| `/dashboard/transactions` | 29.08 | 27.47 |
| `/api/auth/session` | 19.46 | 18.49 |

Next.js streaming means a fast TTFB can precede the completion of authenticated data loading. Do not substitute it for complete-request duration.

### Process-cold observations

Only three samples per route: empirical P95 and P99 both equal the maximum sample. They do not estimate a stable cold tail or include server startup before readiness.

| Route | Baseline cold P50 / P95 / P99 | Final cold P50 / P95 / P99 |
| --- | --- | --- |
| `/` | 274.57 / 347.50 / 347.50 | 271.03 / 290.05 / 290.05 |
| `/dashboard` | 597.30 / 597.75 / 597.75 | 547.38 / 548.73 / 548.73 |
| `/dashboard/friends` | 555.44 / 579.44 / 579.44 | 546.20 / 549.86 / 549.86 |
| `/dashboard/balances` | 566.32 / 616.47 / 616.47 | 540.32 / 555.34 / 555.34 |
| `/dashboard/transactions` | 554.01 / 559.99 / 559.99 | 543.98 / 614.62 / 614.62 |
| `/api/auth/session` | 423.58 / 425.59 / 425.59 | 457.75 / 460.94 / 460.94 |

### Paired SQL comparison

100 samples per implementation after ten warm-up pairs; alternating order, same fixture data, same Prisma client, pool maximum one. Accounting totals, sorted previews, and running ledger entries matched exactly.

| Implementation | P50 | P95 | P99 |
| --- | --- | --- | --- |
| Original ledger overview | 14.21 | 17.17 | 20.21 |
| Single-statement overview | 3.96 | 4.57 | 4.78 |

## Audit findings and decisions

| Area | Evidence | Decision |
| --- | --- | --- |
| Dashboard read amplification | Overview called totals, count/page balances, count/page history, then the page queried circle balances separately. | Consolidate preview reads and requested circle balances into one actor-scoped SQL statement. |
| Layout data overhead | Every protected route loaded counts and friendship profiles just for the unread badge. | Load only unread count; share it with the full circle summary through React request-scoped cache. |
| Repeated summary counts | Friendship and favor summaries each issued three independent status-count queries. A profiled dashboard had 18 driver query observations/request before consolidation. | Use one filtered aggregate per service. Final profile: 14 observations/request; friends 15 to 13. These counts exclude uninstrumented transaction control operations. |
| Repeated authentication | Layout/page/actions already call a React-cached session function. Final profile records one authentication span/dashboard request. | Preserve request-scoped deduplication and database session checks. Do not cache sessions across requests. |
| Sequential reads | Dashboard intentionally sequences groups to avoid P2028 on its one-connection pool. Other small Promise.all batches queue on the same pool. | Reduce statements rather than add parallel transactions or connections. Preserve dashboard sequencing. |
| Read transactions | Full ledger count/page APIs use RepeatableRead. Previews unnecessarily used these paginated APIs. | Remove only preview transactions. Preserve count/page snapshots and all mutation locks/isolation/retries. |
| Connection acquisition | Final instrumented per-acquisition P95: dashboard 2.06 ms, friends 6.86 ms locally. Prior two-second acquisition wait can still reproduce P2028. | Keep pool max one on Vercel, five locally, 10-second connection/acquisition bounds, and shared per-instance client. |
| Indexes | Existing actor/status indexes on favors, settlements, friendships, notification ownership, session tokens, and subject ownership. Small-fixture EXPLAIN timings are sub-millisecond to a few ms; no disk reads or spill were observed in overview plans. | No speculative index migration. Large/selective data and production plans needed before proposing sort/text indexes. |
| N+1 | Ledger aggregates all actor relationships in SQL. Prisma's relation projections issue a fixed number of batched relation queries on bounded lists, rather than one query per row. | Retain required bounded DTO projections; note the remaining relation-query round trips. |
| RSC/navigation | Periodic visible-tab/focus refresh runs every 30 seconds; mutations refresh after revalidation. Link navigation and loading/error boundaries already exist. | Preserve correctness and navigation behavior. No cross-user or stale-ledger cache introduced. |
| Rendering | Landing is statically prerendered; private dashboard and login routes are dynamic. | Keep authenticated routes dynamic. No private Full Route Cache or persistent page cache. |
| JavaScript | Initial HTML references about 263–267 KiB gzip of dashboard JS and 267 KiB landing JS. This includes framework and existing animation/dialog UI, not just authored code. | No frontend redesign or unmeasured lazy-loading change. Browser CPU/LCP and dialog bundle isolation remain follow-up measurements. |
| Cold starts | Fresh-process authenticated requests took roughly 0.4–0.6 seconds locally. | Document initialization floor; do not promise 200 ms for cold requests or change hosting resources. |
| External calls | Google calls are in OAuth, not ordinary session/ledger reads. Avatars load in the browser. Font assets are produced at build time. | No provider/session caches or OAuth changes. Real OAuth/network timing requires approved preview testing. |

### Query-plan evidence

Five original overview SELECT plans on the same analyzed local fixture executed in **0.771, 0.776, 0.781, 0.435, and 0.995 ms**, with planning times **1.974, 0.426, 0.582, 0.165, and 0.635 ms**. Each read only shared buffers; no disk reads. Repeated planning, adapter round trips, snapshots, and repeated aggregation cost more than any single scan.

The final single-statement plan executed in **2.662 ms**, with **3.568 ms** planning in that capture. Its window computes running history over the actor's events and then limits returned rows. In-memory sorts and CTE scans are expected for this small fixture; they are not evidence that every production table lacks an index. Production cardinality, long-history memory behavior, search selectivity, and deep OFFSET pagination remain unmeasured.

## Safe timing instrumentation

Opt in with **`PERFORMANCE_TIMING=1`** in a local shell or an approved preview environment. Default is off. This audit did not modify environment files or production variables. Enable briefly and review logging volume before any approved production observation window.

Events contain only `event`, a closed `phase` label, numeric `durationMs`, `outcome`, and optionally a closed route category. They never serialize request URLs, query strings, dynamic IDs, bodies, cookies, authorization headers, SQL, query parameters, errors, credentials, provider tokens, or ledger contents.

- **request:** Node HTTP receive-to-response-finish via diagnostics channels, including streaming and rendering. Registered once per process through `instrumentation.ts`.
- **authentication:** cached session lookup or Auth.js handler duration; those spans are inclusive of database work.
- **connection-acquisition:** actual pg pool checkout duration, including waiting/new-connection handshake when applicable. Both callback and promise forms are preserved.
- **database-query:** adapter I/O/SQL/network/mapping duration minus observed pool acquisition for that operation. It is not PostgreSQL CPU time; EXPLAIN provides separate server execution evidence.
- **transaction-start:** acquisition and adapter transaction setup, inclusive of work within that span. Existing execution/isolation/commit/rollback behavior is preserved.
- **business-logic:** inclusive ledger overview service duration.
- **dashboard-data:** dashboard Server Component data preparation through creation of its React element, including authentication and reads. It does not claim to measure subsequent React serialization by itself.

No reliable standalone React SSR CPU measurement was added. Complete Node request timing covers rendering; separating it from overlapping layout/page work requires a proper trace provider. Native HTTP channels were verified locally; Vercel's runtime integration may not expose the same channels. Verify event availability in preview and use platform request-duration metrics when native channels are unavailable.

### Final profiled warm server results

Separate opt-in run, 100 samples/route. Instrumentation has overhead, so these numbers are not substituted into the timing-disabled before/after table.

| Route | Node request P50 / P95 / P99 |
| --- | --- |
| `/` | 1.68 / 2.44 / 2.91 |
| `/dashboard` | 24.93 / 36.75 / 55.77 |
| `/dashboard/friends` | 23.49 / 32.16 / 35.57 |
| `/dashboard/balances` | 17.30 / 30.28 / 37.11 |
| `/dashboard/transactions` | 17.12 / 23.44 / 38.45 |
| `/api/auth/session` | 4.21 / 5.14 / 6.76 |

Dashboard authentication P95 **6.96 ms**; inclusive ledger business operation **7.63 ms**; data preparation **30.55 ms**. Individual driver query P95 **4.40 ms**, acquisition P95 **2.06 ms**. These are per-phase/per-operation distributions with overlap, not additive percentile components.

## Validation

- TypeScript: passed after final changes.
- ESLint: passed with no reported warnings/errors.
- Prisma schema validation: passed; schema unchanged.
- Full isolated Vitest run: **236 passed, 0 failed; 30 suites passed**, including **88 PostgreSQL integration tests**. Default suites remain usable without database writes.
- Final default run: **148 passed, 88 database tests skipped, 0 failed**; database tests were run separately against the isolated target above.
- Production build: passed; landing static, authenticated routes dynamic.
- Overview SQL parity: totals, ordering, DTOs, circle balances, empty/outsider results and safe-integer bounds tested.
- Existing accounting/authorization suites: cross-subject balances, excluded states, forged/unauthorized confirmations, duplicate submissions, over-settlement protection, concurrent confirmations, and immutable history passed.
- Timing regressions: disabled-by-default behavior, safe error categorization, query/ID redaction, and actual complete Node HTTP response timing passed.
- Local read-only contention reproduction: 2,000 ms wait reproduced P2028 in 2,012 ms; retained 10,000 ms policy passed in 2,610 ms with two concurrent synthetic dashboard service loads. No writes in that probe.
- Two-account local UI check: passed invitation/search/acceptance, offline recovery, subject creation, favor confirmation (+1/−1), settlement confirmation (0/0), preserved history/notifications, read acknowledgment, and both secure sign-outs with protected redirects.
- Responsive/browser check: **64 layouts passed, 64 accessibility checks with zero automated violations, zero browser runtime errors**. The favor form and keyboard/modal checks also passed. Test sessions exercise real Auth.js/database behavior but do not contact Google.
- Cleanup verified **zero users, favors, settlements and sessions** remaining in the disposable database before removing the test environment.

## Files and reproducibility

Runtime changes: `lib/ledger-service.ts`, `lib/ledger-data.ts`, `lib/circle-data.ts`, `lib/friends-service.ts`, `lib/favors-service.ts`, `lib/auth-session.ts`, `lib/db.ts`, dashboard layout/page, Auth.js route, and new timing/adapter modules plus `instrumentation.ts`.

Regression tests update dashboard/ledger assertions and replace the obsolete preview-transaction scheduling test with single-statement coverage. New summary/timing tests cover the consolidated behavior. The bounded pool and transaction acquisition policy in `lib/database-pool-config.ts` is unchanged.

Operator tools:

```text
node --conditions=react-server --import tsx scripts/benchmark-performance.ts local
node --conditions=react-server --import tsx scripts/compare-ledger-performance.ts
```

Set `PERF_DATABASE_URL` privately to a disposable loopback database and `PERF_DATABASE_ISOLATED=1`. Existing migrations must already be applied. The HTTP tool uses port 3119, expects a current production build, starts/stops only its own child servers, and uses synthetic database sessions. Run it with timing disabled for comparisons; run separately with `PERFORMANCE_TIMING=1` for phase diagnostics.

The comparison tool requires `.phase7-artifacts/ledger-before.ts`: export `lib/ledger-service.ts` from baseline commit `8a9c16e` and change its local `./` import paths to `../lib/`. Do not point baseline evaluation at production. It analyzes only its disposable fixture tables, alternates old/new calls, and asserts result parity.

Sanitized detailed JSON results remain in ignored `.phase7-artifacts/`: `performance-baseline.json`, `performance-optimized.json`, `performance-profiled.json`, `performance-final.json`, `performance-final-profiled.json`, and `performance-paired.json`. This report preserves the reviewable measurements without committing local artifacts.

The pre-existing `.env.example` edit and `debug.log` remain unrelated and untouched.

## Recommended deployment plan and remaining limits

1. Review the local patch and approve a separate preview deployment. No schema migration, pool increase, region change, database setting change, paid resource, or secret rotation is required.
2. Keep timing off initially. In an approved preview, optionally enable `PERFORMANCE_TIMING=1` briefly; verify safe events and runtime request-duration coverage. Remove/disable it after collecting sufficient samples.
3. Use an isolated preview database and two consenting test accounts. Verify real Google OAuth, HTTPS, refresh/logout, notifications, favor confirmation, settlement concurrency, and user isolation. Local fixture login is not proof of Google token exchange.
4. Collect at least several hundred representative warm observations, separate cold requests, include RSC navigation/refresh requests, and measure the actual Mumbai shared-pooler round trip. Do not load-test production or create benchmark ledger records there.
5. If plans on realistically large isolated histories show sort/scan bottlenecks, propose specific reviewed indexes and explain their write/locking/storage costs before any production migration.
6. Approve release only after preview latency and P2028/error-rate checks. Roll back the application commit if acquisition failures, authorization failures, or accounting mismatches appear; no database rollback is needed for this patch.

Production traffic distribution, shared-pooler queueing, TLS/network handshake cost, platform cold starts, realistic history sizes, mobile CPU, and actual Google OAuth timing were not measured here. Region proximity helps but does not establish a production P95 below 200 ms. No production performance claim or deployment approval is implied by these local results.

References consulted: [Supabase connection modes and transaction-pooler limitations](https://supabase.com/docs/guides/database/connecting-to-postgres), [Node HTTP diagnostics channels](https://nodejs.org/api/diagnostics_channel.html). Installed Prisma 7 adapter declarations and local runtime tests were used to verify the adapter methods; no pooler/session-state feature was introduced.

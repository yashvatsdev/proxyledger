# Phase 7A: Security audit and local hardening

Completed 10 October 2026. Safe local implementation and verification are complete. This is not deployment approval or a claim that the deployed environment has been security-certified. Phase 7B has not started.

## Scope and findings

Read Phase 5 and Phase 6 reports before editing. Reviewed all application pages, the Auth.js API route, exported Server Actions, database services, schema/migrations, client rendering, account UI, tooling, environment examples and existing regressions. An independent baseline reviewer and an independent database/control reviewer found no substantiated cross-user access, forged-consent, injection, token-disclosure or ledger-concurrency vulnerability. Source inspection cannot prove that a deployment has the intended TLS, proxy configuration or database grants.

| Observation | Severity / evidence | Result |
| --- | --- | --- |
| Dependency registry advisories | Initial audit: 72 advisory entries: 2 critical, 30 high, 33 moderate, 7 low. These are registry classifications, not 72 remotely exploitable application defects. | Compatible direct updates and targeted transitive overrides reduce the final audit to 2 high advisory entries; details below. |
| Database tests used the normal runtime connection | Operational safety gap; opted-in tests have UUID-scoped cleanup, but originally used `DATABASE_URL`. No remote attacker path established. | Tests now require explicit, separate `TEST_DATABASE_URL` and `TEST_DATABASE_ISOLATED=1`, reject production mode and matching runtime/migration targets, and never fall back to application credentials. |
| Rate-window creation used the application clock while expiration used PostgreSQL | Informational reliability hardening; no requester-controlled clock-skew exploit established. | Both insertion and renewal use PostgreSQL time. Atomic upsert and existing thresholds remain unchanged. |
| Browser headers absent | Defense-in-depth gap; no XSS or clickjacking exploit claimed. | Global anti-framing, MIME, referrer, document-base/object restrictions, permissions and production HSTS headers added. |
| Server modules lacked compile-time client-import rejection | Defense-in-depth gap; no existing credential-bearing client import found. | `server-only` markers added to auth, database, services and server data helpers; Next.js rejects accidental client imports. |
| README claimed all tests avoided a live database and described state/PKCE generically | Documentation inaccuracies. | Corrected dedicated integration-test instructions and Google OIDC/PKCE description. |

## Authentication and authorization review

`auth.ts` retains Google as the only provider, PrismaAdapter and database sessions: 30-day maximum age, daily expiry refresh interval. Auth.js looks up opaque sessions on requests, rejects missing/revoked sessions and deletes expired sessions. On HTTPS, session cookies are HttpOnly, Secure and SameSite=Lax. Session output is explicitly allowlisted to expiry and own user ID/name/email/image; provider/session tokens never reach browser storage. Logs use fixed sanitized messages. Default unsafe email-based account linking remains disabled.

Google uses OIDC and PKCE; state is additionally enabled by Auth.js for a redirect proxy. HTTP auth mutations use Auth.js double-submit CSRF validation. Server Action helpers rely on Next.js Origin/Host checks, independently of the auth HTTP CSRF token. No broadened Server Action `allowedOrigins` configuration was introduced. Logout deletes the session, clears its cookie and redirects home. Login has a fixed dashboard destination; callbacks reject external origins, embedded credentials and authentication loops.

Every protected page and independently callable business action obtains the actor from `requireUser()`. Layout protection is supplementary. Zod inputs strip forged actor/creator/requester/debtor/creditor/state/timestamp fields. Settings displays the verified own Google profile; no account-edit action exists.

| Resource / operation | Enforced boundary |
| --- | --- |
| Friend invitations, acceptance, rejection, cancellation and removal | Canonical participant pair; recipient accepts/rejects, requester cancels, either accepted participant removes. Blocked relationships excluded from discovery. |
| Friend discovery / contact details | Bounded Google-account name-prefix or exact-email search intentionally returns public ID/name/image; contact email is available only through accepted connections. |
| Subjects | Lists, choices and creation scoped to owner. A subject label on a shared favor is intentionally visible to its participants. |
| Favors | Only accepted friends may create; subject must belong to submitter. Detail/history requires participation. Only the non-submitting participant confirms/rejects; submitter cancels pending records. |
| Balances / ledger | SQL scopes events and accepted connections to the actor before joining profiles. Unrelated private histories remain inaccessible. Former participants retain their own shared history. |
| Settlements | Participant-only reads; requester cancels, recipient confirms/rejects. Current debt is reread after the pair lock, with conditional pending updates. |
| Notifications | Reads scoped by `userId`; mark-read requires both notification ID and owner. |
| Workspace search | Composes participant/owner-scoped services, limits result previews and applies a shared per-user search limit. |

No unsafe raw SQL or HTML execution sink was found. Prisma queries and tagged SQL bind values, search metacharacters are escaped, and notes/names render as React text. Input length/date/amount/direction limits, bounded pages (maximum 1,000 for history and 5 for discovery) and small result pages are retained. Unexpected database errors produce fixed feedback.

## Preserved accounting and database controls

Accounting source and migrations were not changed. One confirmed favor contributes exactly one unit: performer is creditor, recipient is debtor. Positive means the friend owes the viewer; negative means the viewer owes the friend. Balances span every subject. Pending/rejected/canceled/reversed favors and nonconfirmed settlements contribute zero.

Pair advisory locks, fresh ReadCommitted balance checks, terminal-state/content immutability, conditional pending updates, actor-scoped unique submission keys and database triggers continue to enforce consent, retry deduplication and concurrency. Concurrent settlement confirmations cannot reduce debt beyond the available amount. Existing tests include competing two-unit requests against three units, exact-fit simultaneous reductions, direct database-update guards and racing favor/settlement confirmations.

Existing migrations enable RLS on all ten source tables and revoke `anon`/`authenticated` access. The ledger view is `security_invoker`, and relevant ledger functions use invoker authority with PUBLIC execution revoked. A disposable PostgreSQL 16 instance verified all ten table RLS flags and denied SELECT to both roles for all ten tables and the ledger view. This verifies the migration behavior locally, not the deployed Supabase grants. A privileged application/database operator can still delete records directly; no application history-deletion action is exposed.

Rate limits remain PostgreSQL-backed and atomic across instances, with the existing scopes and thresholds. No paid service or in-memory limiter was introduced. Scope keys are based on verified actor identity. New concurrency and clock-skew tests validate shared enforcement and expiry. Auth endpoints and ordinary authenticated page reads do not have an application-level anonymous/IP limiter; deployment-level abuse protection, connection capacity and load testing remain operator work. Expired buckets need eventual maintenance; no live maintenance job was added.

## Local changes

- `next.config.mjs`: six global security headers. The CSP restricts framing, base URLs and objects; it is deliberately not a full script-source policy and does not claim to prevent every XSS. Fonts, inline framework scripts, GSAP/Motion and analytics keep working. HSTS is emitted by production builds; no subdomain/preload policy is imposed.
- `auth.ts`, `lib/auth-session.ts`, `lib/db.ts`, five service modules, `lib/rate-limit.ts`, `lib/ledger-lock.ts`, and the three cached data helpers: compile-time server-only markers. Runtime window guard remains.
- `lib/rate-limit.ts`: database-clock expiry calculation; accounting and limit values unchanged.
- `tests/helpers/test-database.ts`: separate test client and safe target validation. Distinct host aliases can still reach the same database; explicit isolation is an operator responsibility. No connection values appear in guard errors.
- Three PostgreSQL suites: use the separate test client; ledger suite adds concurrent limiter and clock-skew checks. `tests/auth-handlers.test.ts` adds forged-CSRF and forged-session-identity regressions.
- `tests/test-database.test.ts`, `tests/security-headers.test.ts`: target-safety and response-policy regressions. Vitest aliases the server-only marker to a test-only shim; production uses the real Next.js marker.
- `scripts/smoke-security.mjs`: repeatable anonymous, read-only production route/header checks.
- `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`: PostCSS 8.5.29, Vitest 4.1.11, shadcn 4.21.4, pinned server-only 0.0.1 and targeted patched transitive resolutions. shadcn is now a development dependency. Prisma 7.10.0, Next.js 16.4.0, React 19 and Auth.js beta.32 remain.
- `prisma.config.ts`: seed invocation supplies the `react-server` condition needed by server-only imports. Seed was not run.
- `.env.example`, `README.md`, this report: safe test configuration and audit documentation. Existing `.env`, credentials, `.gitignore`, schema and migration files were not edited.

The working tree also retains the earlier, separately requested hero-only CTA fix in `app/page.tsx` and scoped hero CSS. Phase 7A adds no UI redesign or animation change.

## Exact verification results

| Check | Final result |
| --- | --- |
| `pnpm.cmd typecheck` | PASS, exit 0. |
| `pnpm.cmd lint` | PASS, exit 0, no warnings/errors. |
| `pnpm.cmd db:validate` | PASS, exit 0; Prisma schema valid. |
| `pnpm.cmd db:generate` | PASS; Prisma Client 7.10.0 generated. |
| `pnpm.cmd test --no-file-parallelism --testTimeout=15000 --hookTimeout=20000` with all three DB flags and isolated test target | PASS: **209/209 tests, 23/23 suites, no skips; 13.00 seconds**, Vitest 4.1.11. |
| PostgreSQL subset | **88 passed**: 17 friends, 27 favors, 44 ledger/search/rate-limit. |
| Non-database subset | **121 passed**; all prior authorization/input/idempotency/concurrency regressions retained. |
| `pnpm.cmd build` | PASS, exit 0; compilation and build TypeScript pass. Public landing static, auth/dashboard/login routes dynamic. |
| `node scripts/smoke-security.mjs` against local production port 3107 | PASS: 15 routes, 12 protected anonymous redirects, six headers on every checked response, null/no-store anonymous session. Dummy OAuth settings and disposable DB only. |
| `pnpm.cmd audit` | Exit 1: **2 high advisories**, zero critical/moderate/low. Initial total 72 reduced by 70. |
| `pnpm.cmd audit --prod` | Exit 1: **1 high advisory**, deepmerge-ts via Prisma's tooling dependency graph. |
| Local database cleanup / protection | Test users, favors and settlements all zero after fixture cleanup; ten source tables RLS-enabled; both Data API roles denied SELECT on all ten tables and ledger view. |
| `git diff --check` | PASS; only normal Windows LF/CRLF notices. |

Tests used a newly created localhost-only Docker container, `proxy-ledger-phase7a-test`, at `127.0.0.1:55437`. Only the five existing migrations were applied there. No Supabase connection, production migration, production fixture write, reset, seed, historical-record deletion, deployment or Git push occurred. The temporary production smoke server was stopped, and the disposable container and its volume were removed after verification.

An earlier default run passed 119 tests with 88 database tests skipped, before the two auth regressions were added. An overlapping dependency install/client-generation attempt failed with EEXIST before migrations; sequential regeneration repaired the generated files and final typecheck/build passed. Expected rejected CSRF tests emit only the fixed sanitized auth failure message. Registry timeouts delayed installs but the final lockfile installation and build succeeded.

## Remaining dependency risks

1. **deepmerge-ts 7.1.5**, [GHSA-ggr8-5vv4-36mx](https://github.com/advisories/GHSA-ggr8-5vv4-36mx): registry severity high, recursive object-graph merge can exhaust the stack. It comes through Prisma's configuration tooling, including paths the production audit counts through the optional Prisma peer graph. No browser-controlled recursive object is passed to this merge by the inspected application. Patched release requires major version 8; an unsupported major override inside Prisma was not imposed. Track a compatible upstream Prisma fix or validate a dedicated tooling upgrade. This remains an audit failure, not an assertion of a remotely exploitable ledger endpoint.
2. **braces 3.0.3**, [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm): registry severity high, deeply nested glob patterns can exhaust the stack. Paths are ESLint/shadcn tooling, not application request processing. The advisory lists 3.0.4, but the registry rejected that version as unpublished and reported latest 3.0.3 during installation. No pretend patch or audit suppression was added. Avoid running developer tools over untrusted project/glob configurations; update when a compatible fix becomes available.

ESLint 9.39.2 also emits an upstream unsupported-version notice during install. No ESLint major migration was performed. Auth.js v5 remains beta. Maintain upstream monitoring and re-audit before launch. The transitive overrides include brace-expansion 4 to 5 and esbuild 0.27 to 0.28; final lint, tests, generation and production build validate current project usage, but shadcn's external registry/MCP workflows were not exercised.

## Remaining production checks

- Confirm canonical HTTPS origin, exact Google callback, trusted proxy host/forwarded-header enforcement, HTTPS Secure cookies, session refresh/revocation and new-account OAuth onboarding in the designated deployment. No live Google flows were repeated for this phase.
- Verify actual Supabase RLS/grants/functions/view and runtime role on the deployed database, pooled/direct endpoints, TLS certificate verification, aggregate connection limits, backups and controlled migrations. No live-service changes were made.
- Store production secrets in the deployment secret store; do not add NEXT_PUBLIC secrets. `.env` and local baseline/artifact files remain ignored. Coordinate Auth.js secret rotations.
- Evaluate nonce/hash-based full CSP separately with framework/analytics/animation behavior, plus deployment abuse protection and resource limits. Do not assume the scoped document-policy CSP is comprehensive XSS protection.
- Resolve the two upstream advisories and tooling support status, or document an explicit launch risk decision. Local passing checks are not a clean dependency audit.

Phase 7A is ready for review and controlled staging/live testing after the remaining setup/risk decisions. Production readiness is conditional; no deployment authorization is inferred.

The Codex Security scan completed with zero substantiated application findings and partial coverage because dependency/deployment follow-up remains. Its canonical scan is tied to the original source snapshot; the workbench explicitly notes that local hardening changed the working tree during review. Final changes were verified by the checks above. Scan ID: `292f053d-ea59-4b05-84b2-f1077363fcac`. Tool-reported conversation usage: 11,138,295 total tokens; 11,093,763 input tokens, including 10,688,256 cached input tokens. These are workbench rollout measurements, not an incremental billing estimate for Phase 7A.

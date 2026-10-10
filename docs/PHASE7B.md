# Phase 7B — production infrastructure preparation

Prepared 10 October 2026. Safe local implementation is complete; **no live infrastructure was changed**. See [DEPLOYMENT.md](DEPLOYMENT.md) for the exact settings, approval scope, migration procedure, OAuth setup, recovery and cost proposal.

## Completed checklist

- [x] Read README, Phase 5/6/7A, schema, lockfile and installed auth/database/build configuration.
- [x] Pin Node 24 and reconcile declared pnpm with the successfully tested 11.18.0 runtime.
- [x] Add local Vercel framework/install/build configuration with frozen lockfile and explicit package-manager version.
- [x] Confirm install/build generate Prisma without database migration, seed or reset.
- [x] Review Node serverless compatibility, pooling, transaction locks and connection/transaction timeouts.
- [x] Fix remote runtime TLS and add unsafe-option regressions; use one connection per Vercel instance.
- [x] Add fixed server-only operational failure events and PostgreSQL adapter error hooks.
- [x] Preserve Phase 7A headers, scoped CSP, CSRF/origin checks, safe redirects, server-only boundaries and distributed atomic rate limits.
- [x] Document isolated preview secrets/database and canonical production Google settings.
- [x] Document backup/export/restore/migration failure and deployment rollback procedures.
- [x] Identify public privacy, support, retention and account-deletion decisions without inventing policy or deleting data.
- [x] Prepare included/free monitoring and service/cost choices; purchase nothing.

## Verified issue and minimal fix

The configured runtime pooler URL had no TLS option and the installed `pg` driver defaults to SSL off; `PGSSLMODE` was also unset. This is a transport-security production risk, not evidence of a past compromise. `databasePoolConfig` now normalizes remote runtime connections to certificate-verified TLS and rejects explicit insecure options. Loopback PostgreSQL remains usable locally. Existing credential values were not edited or printed. Migration tooling does not use this runtime helper: operators must supply verified-TLS migration URLs explicitly before any approved job.

The global Prisma client remains shared; Vercel instances default to one connection (local five), with existing 10-second connection and 30-second idle timeouts. This follows current provider guidance and avoids multiplying five connections across unbounded serverless instances. The final local production-mode UI run uses the Vercel pool size. Installed PrismaPg sends unnamed queries unless a statement-name generator is explicitly configured; this project does not configure one. PostgreSQL transaction-scoped ledger locks and constraints are retained.

Runtime pool/connection error hooks and unexpected server-action errors emit a closed event vocabulary with no error payload, URL, input, user ID or email. Expected validation/authorization errors retain existing sanitized user feedback. Logging does not alter accounting, authorization or mutation behavior.

Phase 7C also corrects two low-contrast landing labels using the existing secondary-text token and gives the existing named avatar an explicit image role. Neither changes layout or animations.

## Dependency review

The final full audit still exits 1: **2 high, 0 critical, 0 moderate, 0 low**. Production audit exits 1: **1 high**. Adding pinned browser/axe development tooling introduced no additional advisories.

| Dependency | Installed / fix | Usage and reachability | Decision |
| --- | --- | --- | --- |
| deepmerge-ts | 7.1.5 / >=8.0.0 | Prisma configuration tooling; production audit includes Prisma through an optional peer path. No application request controls recursive config objects; ordinary JSON cannot represent the required cycle. | No forced major override or Prisma 8 prerelease upgrade. Maintain risk decision/upstream monitoring; no demonstrated remote app exploit. |
| braces | 3.0.3 / advisory says >=3.0.4 | ESLint/shadcn glob tooling in dev dependencies; app actions never pass user patterns to braces. | Registry still reports latest 3.0.3. No unavailable override, audit suppression or claim of a clean audit. Avoid processing untrusted tool/registry patterns. |

Sources: [deepmerge advisory](https://github.com/advisories/GHSA-ggr8-5vv4-36mx), [braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm). Package severity remains high even where current application reachability is limited. Re-audit the exact release lockfile and obtain an owner risk decision before public launch. Auth.js v5 remains beta; ESLint 9 is reported unsupported upstream; neither was replaced with an untested major migration.

## Known live configuration gates

Connection metadata indicates shared pooler 6543 runtime / 5432 session migration endpoints in `ap-south-1`. Proposed Vercel function region is `bom1`, subject to actual project-region confirmation. Supabase plan/backup entitlement and role statement/lock timeouts are unverified. No Supabase query, migration or live setting was applied. No general read-query cancellation policy was invented; verify and approve server-side bounded query settings in staging.

Owner inputs still needed: canonical domain/release commit, actual plan/region, support/legal identity, privacy/terms/deletion/retention policy, backup recovery objectives, monitoring ownership and advisory risk decision. Public release is gated on these plus real staging OAuth/HTTPS/pooler/recovery checks. Local implementation is not proof of production operations.

## Files

Created `vercel.json`, `lib/database-pool-config.ts`, `lib/operational-log.ts`, two regression suites, this report and deployment runbook. Modified `package.json`, lockfile, `.env.example`, `.gitignore`, ESLint ignore list, `lib/db.ts` and four existing action modules. Browser tooling/script and final QA documents are tracked in Phase 7C. No schema/migration or ledger utility changes; no `.env` edits, credentials, live service changes, deployment, paid resources or Git push.

## Verification

TypeScript, zero-warning ESLint, Prisma validation/generation, production build and all 217 tests pass; exact final verification and browser results are in [PHASE7C.md](PHASE7C.md). All five migrations were applied only to a fresh disposable local PostgreSQL 16 database. Anonymous production-mode smoke: 15 routes, 12 protected redirects, all six headers, anonymous no-store session. Remote certificate/pooler behavior and Google consent/callbacks remain staging/live checks after explicit approval.

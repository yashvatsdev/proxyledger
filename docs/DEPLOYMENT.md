# Proxy Ledger deployment proposal

Prepared 10 October 2026. **No deployment or live configuration change is authorized yet.** This runbook is the reviewable proposal requested for Phase 7B/7C. The owner must approve the specific settings and changes below before execution.

Latest owner scope: controlled preview **preparation**, not public production launch; explicit approval is required before live infrastructure changes. Follow [PREVIEW_DEPLOYMENT_PLAN.md](PREVIEW_DEPLOYMENT_PLAN.md) for the complete live-action inventory and staged approval gates. Vercel's documented first-deployment Production behavior must be resolved before uploading this app to a new project; omitting `--prod` is insufficient.

## Proposed Vercel settings

| Setting | Proposed value |
| --- | --- |
| Repository | `yashvatsdev/proxyledge`; grant Vercel access to this repository only |
| Root directory | Repository root (`.`) |
| Framework | Next.js |
| Node | `24.x`, pinned by package engines |
| Package manager | `pnpm@11.18.0`, the locally verified version |
| Install | `npx --yes pnpm@11.18.0 install --frozen-lockfile` |
| Build | `npx --yes pnpm@11.18.0 build` |
| Output | Next.js default; no custom output directory |
| Runtime | Node.js; Prisma/pg require Node, not Edge |
| Function region | Proposed `bom1` (Mumbai), matching the inspected connection endpoint's `ap-south-1`; confirm actual Supabase project region before setting |
| Production branch | Owner must identify the intended release branch/commit; do not infer it |
| Production origin | `https://<OWNER_APPROVED_DOMAIN>`; pending owner choice |
| Preview | Protected; separate non-production database, secret and OAuth client; stable preview hostname for OAuth |

`vercel.json` pins framework/install/build locally. Region is deliberately left for the reviewed project setting because endpoint metadata alone does not prove the database's current placement. The declared pnpm version previously differed from the actual tested version; it now matches. Installation and build generate Prisma only. Neither executes migrations, seeds, resets or `db push`. Current Vercel docs list default pnpm versions through 10, so explicit version invocation avoids relying on detection. Validate the first staging build's actual Node/pnpm versions before promotion. See [Vercel package managers](https://vercel.com/docs/package-managers) and [Node versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions).

Importing the repository triggers a deployment: **do not import until approval**. After approval, grant repository access, configure settings/secrets, use a controlled staging deployment, run smoke checks, then promote the reviewed release. Configure the approved domain/DNS and verify Vercel HTTPS issuance and HTTP-to-HTTPS redirect before public traffic. Inspect preview protection and canonical-domain redirects; don't send production secrets to fork previews. Do not redirect OAuth callback POSTs across unrelated hosts.

## Environment separation

| Name | Production | Preview/development |
| --- | --- | --- |
| `DATABASE_URL` | Supabase transaction pooler, typically port 6543, verified TLS | Separate non-production database; local PostgreSQL allowed |
| `DIRECT_DATABASE_URL` | Direct endpoint or session pooler for a controlled migration job | Own non-production target |
| `AUTH_SECRET` | Random secret at least 32 characters, stored as sensitive | Independent secret |
| `AUTH_GOOGLE_ID` | Production web OAuth client | Separate dev/preview client |
| `AUTH_GOOGLE_SECRET` | Production client secret, sensitive | Independent client secret |
| `AUTH_URL` | Optional v5; proposed canonical HTTPS origin when routing requires it | Stable preview origin; localhost origin |

Vercel infers trusted hosting; do not set `AUTH_TRUST_HOST` unless using a separately reviewed trusted proxy. No `NEXT_PUBLIC` secret variables are needed. No test flags/fixture URLs belong on Vercel. `DIRECT_DATABASE_URL` is needed in the migration job, not browser code; it may be omitted from the runtime deployment when generation uses the runtime datasource. Keep migration credentials scoped to approved operators/jobs. `.env` credentials were not changed. Redeploy after approved environment changes; secrets are not updated in already-built deployments automatically.

## Actual database implementation and proposed live checks

Prisma 7.10 uses the existing generated client and `@prisma/adapter-pg`; Auth.js shares this client. Runtime singleton pool: one connection per Vercel instance, five locally; 10-second connection/acquisition timeout, 30-second idle timeout. Count **all instances and applications** against Supabase capacity. No named prepared statements are configured in the installed adapter; its `statementNameGenerator` is unset. Do not assume legacy Prisma engine URL options govern this JavaScript adapter. Transaction-scoped advisory locks survive transaction pooling; application code does not rely on session-level locks.

The inspected local environment points to a transaction-pooler runtime endpoint (6543) and session-pooler migration endpoint (5432), both with `ap-south-1` endpoint metadata. It did not specify TLS or `PGSSLMODE`. Runtime now enforces certificate-verified TLS for remote connections without changing credential values; explicit insecure options fail safely. For migration tooling, separately configure approved connection URLs with `sslmode=verify-full` and the provider CA where needed. Verify the actual certificate chain in staging; do not weaken certificate checking to resolve errors. This task did not connect to or change Supabase.

Existing interactive transactions are bounded to 10 seconds for friends/favors and 15 seconds for settlements, with bounded conflict retries. General read queries have no application statement timeout. **Before live launch**, inspect actual `SHOW statement_timeout`, `SHOW lock_timeout`, database/role limits, pooler capacity and TLS status with read-only queries under the approved runtime role. Propose a bounded server-side statement timeout (for example 30 seconds) after staging measurements and explicit approval; do not apply role changes in this task. Client-side query timeout alone would not prove server cancellation. Validate failure/recovery and load under the actual pooler; local response measurements are not a serverless load test.

Verify RLS/revoked Data API grants on every private table, security-invoker ledger view/functions, runtime table-owner/BYPASSRLS capability and guarded mutation constraints. Auth.js users are not Supabase Auth identities. Do not grant browser roles private table access. See [Supabase connections/TLS/poolers](https://supabase.com/docs/guides/database/connecting-to-postgres).

## Controlled migration plan

No new schema or migration is introduced in 7B/7C. Five existing migrations are in source. The live migration state is **not verified** by this task. After approval, take/verify a backup, read `prisma migrate status` using the direct/session endpoint, and compare `_prisma_migrations` with the release. If all five are applied, no migration is required. If pending, review their SQL and approve that exact pending set before `pnpm db:deploy`. Never run `migrate dev`, reset, seed or `db push` on production. The migration job is separate from every Vercel build/preview.

Check record counts/checksums on original ledger columns before/after; verify constraints, triggers, view, grants and RLS. Coordinate downtime if needed. On failure stop promotion, inspect migration state and whether SQL partially committed. Do not blindly replay or mark migrations resolved. Prepare a reviewed corrective migration; only mark a migration applied/rolled back when the actual database state proves it. Prefer forward repair; code rollback does not reverse schema/data.

## Google production configuration

Create/use an approved **Web application** OAuth client, preferably separate from development. Approved origin: `https://<OWNER_APPROVED_DOMAIN>`. Exact callback: `https://<OWNER_APPROVED_DOMAIN>/api/auth/callback/google`. Register the origin in authorized JavaScript origins where applicable, and the exact callback in authorized redirect URIs. Development remains `http://localhost:3000/api/auth/callback/google`; other ports require their own registration. Google does not accept wildcard callback URLs: use a stable protected preview hostname/client or leave OAuth disabled on ephemeral previews. No redirect-proxy feature is implemented.

Set consent branding, owner-approved support/developer contacts, audience, verified authorized domain and published privacy/terms links. Testing mode requires authorized test users; decide/publication and any required verification before public onboarding. Use only `openid email profile`. Auth.js uses database sessions (30-day expiry/daily refresh), opaque HttpOnly/Lax cookies with Secure on HTTPS, same-origin redirects and CSRF-protected mutations. After staging, check new Google account creation, returning login, refresh, expiry/revocation, secure cookies, logout/session deletion and protected-route denial. Automated local session fixtures do **not** establish real Google/HTTPS correctness. See [Google OAuth](https://developers.google.com/identity/protocols/oauth2/web-server) and [Auth.js deployment](https://authjs.dev/getting-started/deployment).

## Backup and recovery

Current Supabase plan, available backups, RPO/RTO, owner and retention are **unconfirmed**. Do not assume PITR. Current [Supabase backup guidance](https://supabase.com/docs/guides/platform/backups) documents daily backups for Pro/Team/Enterprise and recommends off-site exports for Free. PITR is a separately priced option. Verify actual dashboard entitlements and latest recoverable timestamp before launch. Database backups exclude Storage objects and custom role passwords; this app currently uses external Google image URLs rather than Supabase object storage.

After approval, export through the direct/session endpoint using compatible PostgreSQL tools, with credentials supplied through a secret store/temporary protected pgpass file rather than command-line URLs. Example procedure: `pg_dump --format=custom --no-owner --file=<encrypted-backup-location>/ledger.dump` with PGHOST/PGPORT/PGDATABASE/PGUSER/PGSSLMODE and protected password configuration. Include application schema/data, migration history, constraints/functions/views and separately document grants/roles. Encrypt exports, restrict access and keep them outside Git; OAuth Account tokens and session tokens are sensitive backup content. Record checksum/time/server version and test `pg_restore --list`.

Restore **first to a new isolated target**. Inspect extensions/roles, restore with reviewed ownership/grant mappings, migrate only when compatible, verify history counts/checksums and ledger opposites/settlement safety. Exercise two-account tests with isolated fixtures. Establish measured restore time and accepted recovery point. Never overwrite live history as a rehearsal. For real recovery, freeze writes, preserve a forensic/current snapshot, obtain approval for target/cutover/data-loss window, restore/verify, revoke restored active sessions as appropriate, then switch connection secrets deliberately and redeploy. A restore can lose post-backup activity; application rollback cannot recover it.

## Monitoring, security and cost proposal

Use existing Vercel build/runtime logs and deployment status; fixed Auth.js failure messages plus new fixed operational events for database/friend/favor/settlement/search/notification failures contain no input, IDs, email, URLs or raw errors. Domain rejections are returned safely without noisy incident logs. Production page exceptions use Next.js error boundaries/digests; inspect restricted runtime logs and avoid sharing raw framework diagnostics. No external telemetry collector was added. Existing Vercel Analytics remains; disclose its use in privacy material. Watch deploy failures, 5xx, connection/pool timeouts and settlement/action failure frequency. Nominate an incident owner, alert threshold and review cadence before launch. Configure free/included platform alerts and an owner-run availability probe (`scripts/smoke-security.mjs`) only after approval; no paid monitor or scheduler was created.

Preserve the six security headers, scoped CSP, server-only imports, framework Origin/Host action checks, Auth.js CSRF, safe redirect allowlist and PostgreSQL-backed distributed rate limits. CSP is not a full script-source policy. No broad CORS override is needed for same-origin app actions. Provider/platform abuse limits for anonymous traffic remain an operational launch decision.

Confirm alert entitlement before enabling anything: advanced Vercel Observability/error alerts and extended log retention may require a paid plan/add-on. Do not assume Hobby includes them. Use available build/deployment notifications, restricted log review and the owner-run read-only availability probe as the initial no-purchase baseline; choose an included/free alert mechanism only after verifying the owner's actual plan and requirements.

Service requirements: Vercel Node hosting, existing Supabase Postgres, Google web OAuth client, optionally a domain. No new paid service is necessary for local preparation. Vercel Hobby is restricted to personal non-commercial use; commercial SaaS requires an eligible plan. Current published Pro starting prices are Vercel $20/month plus usage and Supabase $25/month plus usage; confirm checkout, seats/compute, quotas and commercial eligibility rather than treating these as a quote. PITR/domain/extra usage can cost more. No upgrades purchased. See [Vercel plans](https://vercel.com/docs/plans/hobby), [Vercel pricing](https://vercel.com/pricing), [Supabase pricing](https://supabase.com/pricing).

Rollback: keep prior reviewed immutable deployment ID and compatible schema snapshot; use Vercel Instant Rollback to a known-good deployment after approval. Confirm availability/plan behavior, domain routing and environment snapshot. Rollback does not revert database mutations/migrations; incompatible schema requires forward repair or separately approved recovery. See [Vercel rollback](https://vercel.com/docs/instant-rollback).

## Owner decisions before public launch

Supply the domain, intended release commit, actual region/plan, support identity/contact, approved privacy/terms text, deletion and retention policies, backup RPO/RTO/restore evidence, monitoring owner, and a decision on documented dependency advisories. No destructive account deletion is implemented: confirmed shared ledger history affects both participants, so deletion/anonymization requires an approved policy. Inventory Google name/email/avatar/OAuth Account tokens, private subjects, friendship/ledger/notification records, session cookies and analytics. Decide collection purpose, sharing, processor locations, retention, rights/support and future Google Play account-deletion requirements without inventing legal facts. Public policy/contact URLs remain pending; this is a public-launch gate.

Only the explicitly approved changes may be executed: Vercel project/Git integration/settings/domain/secrets, corresponding Google callback/consent settings, and the separately reviewed pending migration set (if any). Approval of documentation alone is not blanket authorization for paid upgrades, resets, deletion, credential rotation or Git push.

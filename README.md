# Proxy Ledger

Next.js frontend with PostgreSQL/Prisma, Google authentication, friendships, attendance favors, global balances and two-party settlements. Auth.js uses database-backed sessions. Dashboard statistics and ledger history use real database records. The landing page remains public.

## Local setup

Use Node.js 24 and the pnpm version declared in `package.json`. On Windows, use `pnpm.cmd` if PowerShell blocks the `pnpm.ps1` shim.

1. Run `pnpm install --frozen-lockfile`.
2. Copy `.env.example` to `.env` and configure your PostgreSQL credentials. Never commit `.env`.
3. Start a PostgreSQL database and create an empty database named `proxy_ledger` (or use your own name in the URL).
4. Run `pnpm db:validate`, then `pnpm db:generate`.
5. Run `pnpm db:deploy` to apply the initial migration. For later local schema changes, use `pnpm db:migrate --name descriptive_name` and review the generated SQL.
6. Run `pnpm db:seed` explicitly to add repeatable demo data. Seed IDs/emails are reserved for demo use. The script inserts missing demo records and preserves existing records; run it only on a development database.
7. Run `pnpm dev`.

Configure the authentication variables and Google OAuth client below before trying a real sign-in. The login page remains available before credentials are configured and displays safe setup feedback.

Prisma generation is also part of installation and build. CLI commands validate the database environment but generation/validation do not connect to PostgreSQL. Without a local `.env`, use non-secret placeholder PostgreSQL URLs in your shell for those commands. Typecheck requires a generated client. A frontend production build supplies a non-secret placeholder URL only during client generation when no URL is configured; it does not open a database connection or bake runtime credentials into the frontend.

## Environment and production

- `DATABASE_URL`: runtime PostgreSQL URL. Use your provider's pooled endpoint in serverless deployments, with TLS enabled. The Prisma PostgreSQL adapter uses a bounded pool of five connections per process and connection/idle timeouts. Account for the total number of application instances when sizing connections.
- `DIRECT_DATABASE_URL`: optional direct endpoint used by Prisma migrations; falls back to `DATABASE_URL`. Supply it when the runtime URL goes through a transaction pooler.

Keep remote TLS certificate verification enabled. Put production secrets in your deployment's secret store. Generate the client during the build and run `pnpm db:deploy` once in a controlled deployment job with the direct connection. Do not run development migrations or demo seeds in production. Review SQL and take backups before applying migrations.

## Domain rules

- One confirmed favor adds +1 to the provider's balance against its beneficiary and -1 to the beneficiary's balance against its provider.
- Balances are bilateral and global across subjects. Subjects are metadata. Totals are calculated, never stored.
- Only `CONFIRMED` favors and settlements contribute. Pending, rejected, and reversed records contribute zero.
- `Settlement.signedAmount` is the signed adjustment to the **requester's** balance against the recipient. The recipient receives its inverse. For example, when Alex is owed two favors by Rahul, an Alex-requested settlement of `-2` clears that balance. If Rahul requests the same settlement, its amount is `+2`.
- IDs must identify distinct existing users. Foreign keys enforce existence, SQL checks reject self-relations, and a creator must be one of the favor participants.
- Friendship requester/recipient preserve request direction; a SQL expression index on `LEAST/GREATEST` enforces one canonical unordered pair across all statuses. Reuse the existing friendship row for future state changes.
- Confirmed records require a confirmation timestamp. Reversed favors retain their original confirmation timestamp for history.
- Phase 2 services must authorize the acting user, verify allowed status transitions and subject access, require the other participant's confirmation, and validate settlement consent/amount against the agreed balance within a transaction. Zod validates input shape; it cannot authorize users or prove database existence.

The initial migration includes custom checks and an expression index that Prisma cannot fully represent in its schema. Preserve these SQL constraints in future migrations; avoid `db push` as a substitute for reviewed migrations.

## Quality commands

```text
pnpm db:validate
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

The default test run exercises balances, settlement direction, excluded statuses, cross-subject repayments, and input/environment validation without database writes. Opt-in PostgreSQL suites require a separate disposable database: set `TEST_DATABASE_URL` and `TEST_DATABASE_ISOLATED=1`, apply the existing migrations to that test target, and enable `RUN_FRIENDS_DB_TESTS=1`, `RUN_FAVORS_DB_TESTS=1`, and `RUN_LEDGER_DB_TESTS=1`. They never fall back to the application connection and reject the application/migration database even with different credentials or ports. Distinct host aliases can still reach the same database; operators must verify that the test target is genuinely isolated. Never point it at production. Run `pnpm test --no-file-parallelism --testTimeout=15000 --hookTimeout=20000` for the complete regression run.

## Phase 2 authentication

The pinned `next-auth@5.0.0-beta.32` declares Next.js 16 and React 19 compatibility. `@auth/prisma-adapter@2.11.3` uses the existing generated Prisma 7 client with `PrismaPg`; there is no second user store or Supabase Auth integration. Auth.js v5 is still a beta release; review upstream changes before upgrading.

`auth.ts` configures Google OAuth and explicitly selects database sessions. First sign-in creates the existing `User` and `Account` records and a `Session`. Subsequent requests look up the opaque session cookie in PostgreSQL. Sessions last 30 days and their database expiry can be refreshed daily. Auth.js manages HttpOnly, SameSite=Lax cookies and Secure cookies on HTTPS, Google OIDC with PKCE (state additionally applies when using a redirect proxy), and CSRF checks on HTTP auth mutations. The sign-in/sign-out UI uses Next.js server actions with framework origin protection. Provider tokens stay in server-side Account records; the session callback returns only expiry and a user profile/ID allowlist. No tokens are stored in browser localStorage or sessionStorage.

The `/dashboard` layout guards the subtree, and its page authorizes separately before passing name, email and image to the client UI. `/login` redirects verified users to `/dashboard`; `/` stays public. `requireUser()` in `lib/auth-session.ts` is the authorization entry point for future protected pages, actions and data services. Each authenticated action must call it and derive the actor ID from the returned user. Layout protection alone must never authorize an API handler or server action. The request-scoped React cache does not persist sessions between requests.

Google login always returns to `/dashboard`; sign-out deletes the database session, clears its cookie and redirects to `/`. Redirect callbacks allow same-origin destinations only and reject auth endpoint/login loops. OAuth errors use fixed, friendly messages; authentication logs omit raw errors and sensitive payloads. Default automatic linking of accounts by matching email remains disabled.

Migration `20261010000000_auth_tables_server_only` enables RLS on the four auth tables and revokes Supabase `anon`/`authenticated` access. No browser policies are created. The Prisma runtime role must be the table owner or have BYPASSRLS; Auth.js identities are not Supabase Auth identities, so do not add `auth.uid()` policies for these tables. The migration does not change existing rows or database credentials. Deploy it with `pnpm db:deploy` on every other environment. Verify using `node scripts/check-auth-db.mjs` (Supabase database required).

### Authentication environment

Add to your existing `.env` without replacing its database settings:

```dotenv
AUTH_SECRET=<cryptographically-random-secret-at-least-32-characters>
AUTH_GOOGLE_ID=<google-web-client-id>
AUTH_GOOGLE_SECRET=<google-web-client-secret>
```

Generate a secret locally with `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"` and paste it into `AUTH_SECRET`. Use your deployment secret store in production. Never prefix these variables with `NEXT_PUBLIC_`, commit them, or share them in logs. Changing `AUTH_SECRET` can invalidate authentication-related cookies; coordinate rotations.

`AUTH_URL` is generally unnecessary with v5 because it infers the origin. The example leaves it commented out. Set it to your canonical app URL if deployment routing needs an explicit origin, such as `https://ledger.example.com`. Vercel infers trusted-host handling. For a self-hosted trusted reverse proxy, set `AUTH_TRUST_HOST=true` only when the proxy validates the public host and overwrites forwarded headers; enforce HTTPS in production. See [Auth.js deployment guidance](https://authjs.dev/getting-started/deployment).

### Google Cloud Console setup

1. Select or create a Google Cloud project, then open Google Auth Platform.
2. Configure Branding (app name, support email, developer contact) and Audience. Choose the appropriate Internal/External audience; while External is in Testing, add the Google accounts you will use as test users. Configure the basic OpenID, email and profile scopes; no ledger-related Google API scopes are required.
3. Under Clients, create an OAuth client of type **Web application**.
4. Add authorized JavaScript origins `http://localhost:3000` and your production HTTPS origin.
5. Register these exact **Authorized redirect URIs**:
   - Local: `http://localhost:3000/api/auth/callback/google`
   - Production: `https://YOUR_DOMAIN/api/auth/callback/google`
   - For any different development port, register that exact origin/port callback too.
6. Copy the client ID and client secret into `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`, then restart Next.js. Use separate OAuth clients for development and production where practical.
7. Before public launch, configure production domains/privacy links and publish the consent application; complete Google verification if Google requires it for your configuration.

The redirect URI must match exactly, including scheme, hostname, port and path. See [Auth.js Google provider](https://authjs.dev/getting-started/providers/google) and [Google web-server OAuth setup](https://developers.google.com/identity/protocols/oauth2/web-server).

### Authentication verification and live checklist

Phase 2 created `auth.ts`, `types/next-auth.d.ts`, `lib/auth-session.ts`, `lib/auth-utils.ts`, `app/api/auth/[...nextauth]/route.ts`, the three `app/login` files, `app/dashboard/layout.tsx`, `app/dashboard/dashboard-client.tsx`, `components/user-avatar.tsx`, `components/sign-out-button.tsx`, the auth-table security migration, `scripts/check-auth-db.mjs`, `scripts/smoke-auth.mjs`, and five `tests/auth-*.test.ts` files. It modified `app/dashboard/page.tsx`, appended authentication/profile styles to `app/globals.css`, and updated `.env.example`, `package.json`, `pnpm-lock.yaml`, `eslint.config.mjs`, `vitest.config.ts`, and this README. Existing Phase 1 working-tree changes were preserved; `.env` and its database credentials were not edited.

Completed checks: TypeScript, ESLint (zero errors; one existing unused `AnimatedCard` import warning on the landing page), 45 tests across seven suites, and the production build. Database migration deployment and a read-only runtime/RLS/role-permissions check succeeded against the existing Supabase database. Anonymous HTTP smoke tests returned 200 for `/` and `/login` and 307 to `/login` for `/dashboard`. Browser verification confirmed the login UI and missing-credentials feedback.

Automated tests exercise route guards, authenticated-login redirects, fixed action destinations, safe errors, callback redirect restrictions, initials, and real Auth.js HTTP handlers with the real Prisma Adapter backed by mocked Prisma delegates. Handler tests cover database reads across requests, expired/revoked sessions, CSRF rejection, database deletion and secure cookie clearing. Existing ledger and environment tests remain included. They do not contact Google or insert live accounts.

For an anonymous production smoke test in PowerShell, set `$env:AUTH_URL='http://localhost:3100'` before `pnpm start --port 3100` in one terminal and run `node scripts/smoke-auth.mjs` in another. It checks the anonymous session endpoint, public landing/login responses and server-side redirects for protected routes. Set `SMOKE_ORIGIN` if using another origin. The temporary AUTH_URL configures the trusted local production host without editing `.env`; keep the existing auth secret/provider environment configured. Live Google login requires the callback for whichever port you use to be registered.

After OAuth setup, manually verify:

- First login creates one User/Google Account and a database Session, and redirects to the dashboard.
- Returning login uses the same account; refresh preserves the session and profile.
- Visiting `/login` while authenticated redirects to `/dashboard`.
- Display name, email, photo and image-failure initials render correctly on desktop/mobile.
- Sign-out redirects home, removes the session, and subsequent navigation/refresh to `/dashboard` redirects to `/login`.
- Cancelled or failed OAuth shows safe feedback; a tampered external callback cannot redirect off-site.

The Phase 2 implementation run did not verify real Google flows because credentials were unavailable then. Google login has since been confirmed by the project owner. Phase 3 friends and invitations are implemented; see [the Phase 3 report](docs/PHASE3.md) for architecture, files, migration, tests and the two-account walkthrough.

## Phase 4

Favor recording, participant confirmation/rejection, cancellation, private subjects and transaction history are implemented. See [docs/PHASE4.md](docs/PHASE4.md) for migration, security, verification and two-account testing instructions. Phase 5 extends these records with global balances and settlements.

## Phase 5

Global balances, audited settlement requests and complete shared ledger history are implemented. See [docs/PHASE5.md](docs/PHASE5.md) for accounting semantics, pair-level concurrency, safe migration, tests and the two-account walkthrough. Balances include confirmed favors across every subject and confirmed settlement adjustments. Positive means the other person owes you; negative means you owe them. Pending/rejected/canceled requests change no balances.


## Phase 6

Dashboard integration, private workspace search, supported Google account settings, responsive navigation, dialog/focus improvements and loading/error feedback are implemented. See [docs/PHASE6.md](docs/PHASE6.md) for the audit, 200-test regression results, actual responsive browser checks and remaining Phase 7 tasks. No deployment or schema migration was introduced.

# Google OAuth failure investigation

10 October 2026. Target reported by owner: `https://proxyledger.vercel.app`, Vercel team `techtroop`. Local implementation and read-only investigation only; no deployment, settings change, migration, reset, data mutation or Git push.

## Findings and certainty

1. **Confirmed observability defect:** `auth.ts` previously discarded the error passed to `logger.error` and emitted only `[auth] Authentication request failed`. Auth.js wraps database failures as `AdapterError`, carrying the underlying error under `cause.err`. The logger lost the error type, underlying Prisma/driver classification and failed operation. Auth.js can redirect failures with HTTP 302 and conceal server errors behind `error=Configuration`; a 302 does not establish successful token exchange or login. See [Auth.js errors](https://authjs.dev/reference/core/errors).
2. **Confirmed remote-connection failure from this workstation's existing environment:** the read-only Prisma probe failed with **P1011**. The native PostgreSQL probe failed with **SELF_SIGNED_CERT_IN_CHAIN**. Certificate trust fails before account/session queries can run. No certificate verification was disabled and no data was changed. This establishes an untrusted chain, not which certificate/issuer is responsible or whether a local network intermediary is involved.
3. **Production root cause remains unconfirmed:** the connected CLI account can access only its personal team, not `techtroop`; both deployment inspection and the requested team lookup failed. Production variable values, deployed source revision, runtime logs, actual database host/trust store and migration state could not be inspected. The observed local TLS failure is a strong candidate **if production uses the same runtime connection and trust configuration**. Do not treat it as proof of Vercel's exact failing stage.

## Code and environment review

- Installed NextAuth 5.0.0-beta.32 / Auth core 0.41.3, Prisma adapter 2.11.3, Prisma/client/pg adapter 7.10.0. Google is supplied as `[Google]`; the installed provider environment inference reads `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`. It also reads `AUTH_SECRET` and `AUTH_URL`; there is no required `NEXT_PUBLIC` credential.
- `AUTH_URL` should be the canonical origin `https://proxyledger.vercel.app`, without an OAuth callback appended. Vercel hosting is automatically trusted by this installed Auth.js version; no blanket trust change is proposed.
- Runtime PostgreSQL uses `DATABASE_URL`. `DIRECT_DATABASE_URL` is the optional tooling/migration connection; the environment validator also checks its syntax when present. Presence of both does not prove runtime connectivity. Neither existing value was printed or changed.
- Google callback processing exchanges the code and validates the provider response/claims before adapter account lookup and onboarding/session creation. Wrong client secret, denied/expired code, PKCE/state cookies, provider/network failure, account linking, missing tables/columns, permissions, uniqueness, capacity and TLS can all fail after Google authorization returns. No provider credentials were used for a manual token exchange or callback replay.
- The existing User/Account/Session/VerificationToken fields and account composite unique key match the installed Google/database-session adapter methods. No demonstrated schema/client incompatibility was found by static review. Remote read/write permissions and deployed migration state remain unverified because the connection failed before table probes. WebAuthn-only adapter methods are not used by the Google-only configuration.
- Existing database sessions, maxAge/updateAge, session response allowlist and same-origin redirect handling are preserved. No account-linking relaxation, auth backdoor, Supabase Auth adoption or JWT-session substitution.

## Local changes

| File | Change |
| --- | --- |
| `lib/auth-diagnostics.ts` | Server-only structured logger; finite allowlists for Auth.js types, Prisma/Postgres/TLS/OAuth codes and driver categories; bounded/cycle-safe cause traversal; adapter operation recorded through a WeakMap without retaining inputs |
| `auth.ts` | Connect safe logger and adapter wrapper; diagnose initialization errors outside Auth.js's handler wrapper |
| `lib/database-pool-config.ts` | Optional `DATABASE_SSL_CA` PEM support, validated CA certificates and bounded length; maintain full verification; reject malformed/conflicting settings |
| `.env.example` | Document optional provider CA, never credentials |
| `scripts/check-auth-database.ts` | Operator-only read-only native/Prisma connectivity and empty-result auth-table checks; outputs only allowlisted diagnostics |
| `tests/auth-diagnostics.test.ts` | Five tests for wrapping, redaction, OAuth/TLS classification, adapter contracts, cycles/getters and logging |
| `tests/auth-handlers.test.ts` | Real Auth.js handler regression for sanitized adapter-session failure |
| `tests/database-pool-config.test.ts` | Two regressions verifying CA preservation through the actual pg parser, escaped PEM and rejected invalid/conflicting CA configuration |

No raw messages, stacks, SQL, URLs, request headers/cookies, authorization codes, response bodies, provider tokens, user names/emails/IDs or adapter arguments are logged. Debug remains a no-op. Unknown fields/strings are omitted or classified `Unknown`; they are never copied into JSON. The operation wrapper rethrows the original error and preserves successful return values. Auth.js may log the adapter and enclosing session/callback error; both are sanitized.

Example safe failure:

```json
{"event":"authentication-failed","authType":"AdapterError","stage":"adapter","operation":"getUserByAccount","causes":[{"category":"AdapterError"},{"category":"PrismaClientKnownRequestError","code":"P1011"},{"category":"DriverAdapterError"},{"category":"TlsConnectionError"}]}
```

This is an illustrative shape, **not a captured production log**. The native read-only probe actually returned `SELF_SIGNED_CERT_IN_CHAIN`; the Prisma probe returned `P1011`.

## Required owner configuration / verification

1. From the authenticated intended Supabase project's Database settings → SSL configuration, download its server root CA. Verify the certificate belongs to the approved provider/project rather than trusting a certificate captured from the failed connection. Supabase documents explicit CA configuration for full server verification: [connection/TLS guidance](https://supabase.com/docs/guides/database/connecting-to-postgres#ssl).
2. After review, supply that PEM as server-only `DATABASE_SSL_CA` to the intended environment. Multiline PEM or literal escaped `\n` is supported. Do not use `NEXT_PUBLIC`, `rejectUnauthorized: false`, `sslmode=no-verify` or `NODE_TLS_REJECT_UNAUTHORIZED=0`. With explicit CA, the code removes URL `sslmode` and supplies `ssl: { rejectUnauthorized: true, ca }`: pg otherwise replaces object SSL options when parsing URL SSL options. Conflicting URL certificate paths are rejected deliberately.
3. For a local read-only check, provide the CA securely in the process environment and run `node --conditions=react-server --import tsx scripts/check-auth-database.ts`. It uses a native `SELECT 1`, then a Prisma read-only transaction with `LIMIT 0` probes of auth tables. It retrieves no user/session/token rows and does not test write permissions. The existing local probe is still failing until a verified CA/trust configuration is supplied; no corrected remote connection is claimed.
4. Separately obtain approval to release this patch and set any production variable. This task does neither. A Vercel variable change needs a new deployment to take effect; existing deployments retain their configuration snapshot.
5. Confirm production `AUTH_URL=https://proxyledger.vercel.app`; Google Web client exact redirect URI `https://proxyledger.vercel.app/api/auth/callback/google`, origin `https://proxyledger.vercel.app`, and matching ID/secret from that same client. Do not rotate/change working Google configuration merely because callback status is 302. If safe logs show `invalid_client`, investigate ID/secret matching; `InvalidCheck` points to state/PKCE/cookie/origin; P1011/TLS categories point to DB transport; P2021/P2022 to deployed schema; 28P01/P1000 to DB credentials; 42501/P1010 to permissions; P2002 to uniqueness/account state. Review exact causes before any migration or account mutation.
6. Retry real Google new/returning sign-in after an explicitly approved release. Verify User/Account and database session creation, refresh persistence, protected routes, expiry/logout and session deletion. Do not expose diagnostic payloads to the browser. No production OAuth exchange or authenticated write flow was exercised during this task.

## Connect the correct Vercel account

Use the owner account with access to `techtroop`, or ask its owner to provide authorized access. In the CLI, `vercel logout` then `vercel login` signs into the correct account; this was **not executed** here. Confirm `vercel whoami` and `vercel teams ls`, then inspect with `vercel inspect https://proxyledger.vercel.app --scope <actual-team-slug>`. Use the slug returned by the team list rather than assuming a display name is the slug. The desktop browser session and CLI login are separate. Never paste a Vercel token or password into chat. See [Vercel login](https://vercel.com/docs/cli/login).

After access is corrected, read-only inspection can verify production variable **names/scope**, deployed source and sanitized logs without changing settings. Do not pull production secrets into tracked files or dump raw logs containing callback query strings. No CLI login/team switch was performed automatically.

## Verification results

- TypeScript passed.
- ESLint passed, zero warnings/errors.
- Production Next.js 16.4 build passed.
- Vitest: **137 passed, 88 skipped, 0 failed; 23 suites passed / 3 skipped; 10.09 seconds**. Eight new regressions are included. The 88 opt-in PostgreSQL mutation tests were intentionally disabled; no test writes against Supabase.
- `git diff --check` passed, ordinary Windows line-ending notices only.
- Read-only connection probes: **failed**, Prisma P1011 / native SELF_SIGNED_CERT_IN_CHAIN. Auth-table probes and write permissions were not reached; provider CA remediation is configuration-dependent and still needs verification.
- Production logs/environment inspection: unavailable due to connected-account/team access.

No production login-success claim, data change or deployment is implied by passing local tests/build.

## Follow-up: provider certificate verified (10 October 2026)

The requested `certificates/prod-ca.crt` was initially absent. The downloaded `C:/Users/yashv/Downloads/prod-ca-2021.crt` was found and inspected, then copied to the requested project path. Subject/issuer: Supabase Root 2021 CA (Supabase Inc); CA flag true; validity 28 April 2021 through 26 April 2031. SHA-256 fingerprint: `80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA`.

`DATABASE_SSL_CA` accepts **PEM contents, not a file path**. Its PEM was added to the ignored local `.env`, using quoted escaped newlines that dotenv decodes. Existing database and Auth.js credential values were programmatically checked unchanged. `certificates/` is now ignored; both `.env` and `certificates/prod-ca.crt` pass `git check-ignore`. No certificate was staged or committed.

The native TLS peer was explicitly checked against the configured runtime hostname **aws-0-ap-south-1.pooler.supabase.com**, port 6543. Node's TLS authorization and `checkServerIdentity` both passed. The read-only native SELECT and Prisma read-only auth-table LIMIT 0 probes then passed. Output: connectivity passed, TLS chain and hostname verified true, auth table reads passed, writes not tested. This resolves the previously observed local trust failure; production Google login remains untested. Restart any already-running local Next.js server to load the updated environment.

### Exact Vercel configuration, to be performed by the owner after review

1. Sign into the Vercel account with access to **techtroop**, open project **proxyledger**, then Settings → Environment Variables.
2. Add or update the project-level key **DATABASE_SSL_CA**; select **Production** only for this production certificate configuration. Do not prefix it with NEXT_PUBLIC.
3. Open the local `certificates/prod-ca.crt` in a text editor. Copy its entire PEM block, from `-----BEGIN CERTIFICATE-----` through `-----END CERTIFICATE-----`, and paste it into Vercel's Value field with real line breaks. Do not paste the path, surrounding quotes, `DATABASE_SSL_CA=`, or the rest of `.env`. The CA certificate is public trust material; Config type is sufficient, and Secret type is also supported.
4. Save the variable. Do not upload/commit the certificate file to supply it at runtime; the code consumes the environment value directly. No existing credential needs to change for this CA configuration.
5. After separate deployment approval, release the reviewed source including DATABASE_SSL_CA support and create a new deployment. Existing deployments do not acquire changed variables automatically. See [Vercel environment variables](https://vercel.com/docs/environment-variables).
6. Verify real Google login and inspect the sanitized diagnostic logs. Successful local TLS/table reads do not verify production permissions, OAuth exchange or account/session writes. Preview deployments must retain their separately approved database/environment configuration.

These are instructions only. No Vercel configuration, deployment, database record or Google Cloud setting was changed during this follow-up.

## Approved Git release preparation (10 October 2026)

The owner reported `DATABASE_SSL_CA` already configured for Vercel Production and explicitly authorized a reviewed commit and normal push to `origin/main`, triggering the existing Git deployment for `techtroop` / `proxyledger`. No environment or database settings are changed by this release. `.env.example` remains unstaged, along with all ignored environment files and the certificate, in accordance with the request to exclude environment files.

During release verification the read-only probe intermittently returned Prisma `P2028` at transaction acquisition, before its callback ran. The operator probe now uses a bounded 15-second `maxWait`, matching its transaction timeout; application transaction settings are unchanged. `P2028` is included in the diagnostic allowlist and its redaction regression. The complete native TLS/hostname and Prisma read-only schema probe subsequently passed. Production Google login still requires a real login after deployment; this release does not claim a successful production OAuth exchange.

Final release checks: TypeScript and ESLint passed; Vitest 137 passed, 88 skipped, 0 failed (23 suites passed, 3 skipped; 2.54 seconds); production build passed. PostgreSQL mutation suites remained disabled. The nine release files passed a local check for existing environment credential values and full certificate contents; `.env` and the certificate remain ignored. `git diff --check` passed. No migrations, database writes, or production configuration changes were run.

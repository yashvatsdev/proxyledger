# Performance Preview verification

Release scope: `perf/latency-optimization` only. Do not merge, promote, push `main`, run migrations, or change production environment variables. The local audit and measurements are in [PERFORMANCE_AUDIT.md](PERFORMANCE_AUDIT.md).

## Preserved production rollback point

At release preparation, `https://proxyledger.vercel.app` serves deployment `dpl_E3ExCFPVXng5pnbFLNwgjkKFYnuS`, commit `9f93c2b38cf7faf9bfb151881c54d00613e1b1ff`. Git `main` is `8a9c16eab81267f58946dc99f6c1491be17e5f7d`; its later README-only deployment is BLOCKED by Vercel team configuration. Preserve the currently serving deployment. No rollback command is needed for a Preview-only push.

## Preview environment prerequisites

Before authenticating, an owner must verify the Preview database is isolated from production and already has the current schema. This release does not create a database or apply migrations. Signing in writes users, accounts and sessions; favor/settlement workflow tests also write records. Do not run these flows against production, or under a read-only testing authorization.

Set these variables for **Preview**, preferably scoped to this branch, after owner approval:

| Variable | Requirement |
| --- | --- |
| `DATABASE_URL` | Isolated runtime database transaction-pooler connection; never the production database for write tests. |
| `DIRECT_DATABASE_URL` | Isolated database migration/configuration endpoint. This release does not run migrations. |
| `DATABASE_SSL_CA` | PEM certificate contents, not a filename, when the remote database needs the custom CA. Preserve certificate hostname verification. |
| `AUTH_SECRET` | Separate cryptographically random secret, at least 32 characters. |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | Dedicated Preview Google OAuth web client. |
| `AUTH_URL` | If explicitly set, the exact stable Preview HTTPS origin; never copy the production origin. Auth.js can otherwise infer the Vercel host. |
| `PERFORMANCE_TIMING` | Optional `1` for a brief approved Preview diagnostic window; default off. |

No `NEXT_PUBLIC` secrets, test database variables, benchmark fixtures or local certificates belong in the deployment. Use Vercel's normal Preview protection. Do not disable protection, OAuth state/PKCE checks, CSRF protection, or TLS verification. Existing serverless pool maximum one and transaction acquisition wait 10,000 ms are unchanged.

## Google OAuth testing

1. In Google Cloud Console, create/use a separate Web application client for Preview. Add the two consenting QA accounts as OAuth consent-screen test users when the app is in Testing status.
2. Obtain the actual stable branch Preview alias from Vercel. Register its exact callback: `https://<verified-preview-host>/api/auth/callback/google`. Add the matching HTTPS origin if needed. Google callbacks must match exactly; no wildcard callback is supported.
3. Set that client's credentials only in the branch's Preview environment. Rebuild the Preview after configuration changes. Do not reuse the production callback as a workaround or add arbitrary redirect origins.
4. Open the same registered Preview hostname throughout the flow while signed into an authorized Vercel account. Verify login, dashboard redirect, reload/session persistence, logout and protected-route redirects.
5. With permission to write only isolated fixtures, test invitations, confirmed favor +1/-1, global cross-subject balances, confirmed settlement reduction, notifications, history, unauthorized access and duplicate confirmations. Local synthetic sessions do not prove real Google OAuth works.

## Read-only smoke checks and performance comparison

Confirm deployment commit and Preview target, successful build, HTTPS, public landing/login, anonymous protected-route redirects, and anonymous `/api/auth/session`. Do not send mutation requests or establish Google sessions during read-only verification. Use authenticated Vercel access for protected deployments; a protection login response is not an application failure.

For comparable authenticated timing, obtain approval for isolated QA sessions first. Collect sequential requests, separate warm/cold observations, and measure complete streamed response completion. Local dashboard P50/P95/P99 was 31.03/38.34/40.99 ms, compared with baseline 43.80/53.11/56.07 ms. Local paired ledger P95 improved 17.17 to 4.57 ms. Internet HTTP samples include network/protection overhead and cannot establish server P95 below 200 ms. Do not load-test production.

Native HTTP timing channels may differ on Vercel; verify event availability and use platform request duration when unavailable. Continue monitoring acquisition failures/P2028 before any production release proposal.

## Deployment blockers

If Vercel blocks the Git deployment for team configuration, the owner must confirm the commit author's GitHub account is connected to the owning Vercel Hobby team. Do not change commit identity to impersonate another account, disable deployment security, or deploy to a different project as a workaround. Resolve the owner's account linkage and retry the same Preview commit after approval.

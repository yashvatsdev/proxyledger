# Phase 3: Friends and invitations

## Delivered behavior

Authenticated users can search registered Google users by a case-insensitive display-name prefix or exact email, send invitations, accept/decline incoming requests, cancel sent requests, and remove accepted friends with confirmation. Each user pair always uses the original canonical Friendship record. Cancel, decline and removal use REJECTED; BLOCKED records cannot be reactivated through these actions. Reconnecting after a closed request has a 24-hour cooldown, then reuses the same row and can reverse request direction. Acceptance records a fresh connectedAt timestamp. The original createdAt and all ledger rows remain intact.

The shared dashboard shell retains the existing design and navigation animations. `/dashboard/friends` has live summary counts, paginated tabs, animated cards, empty states, and an accessible native dialog for debounced discovery. Native dialogs provide focus containment, Escape dismissal and focus restoration. Added animations respect reduced motion. `/dashboard/friends/[id]` is restricted to accepted friends and shows only public profile/contact details and up to ten actual confirmed shared favors. Email is available only for accepted friends, never in discovery or pending lists. No fake balance or shared history is displayed.

`/dashboard/notifications` lists the signed-in user's notifications with mark-as-read and relevant navigation. The sidebar/bell unread count is real. Sending and accepting/rejecting invitations creates linked database notifications within the same transaction; resolving/cancelling a request marks its original invitation notification read. Own mutations refresh the route through server-action cache invalidation. Other-account changes refresh on focus or at most every 30 seconds while the tab is visible and no dialog is open. This is polling, not push delivery.

The overview circle, friends count and incoming invitation strip now use PostgreSQL records. Unrelated ledger totals/activity remain the existing mock preview and are explicitly labeled demo. Favor recording and settlement workflows are not implemented.

## Architecture and protection

- Every page and every exported action calls `requireUser()` before reading or writing data. Requester/actor IDs come exclusively from the database-backed Auth.js session. Client IDs identify only a target or a connection/notification, and service authorization verifies ownership.
- Server Actions are the sole discovery/mutation interface; no duplicate REST endpoints were added. Zod validates IDs, operations, query length and search pages. Action errors omit raw database details.
- Serializable Prisma transactions atomically change invitations and notifications, retry serialization conflicts up to twice, and handle uniqueness conflicts with safe feedback. Conditional transitions reject repeated/stale/unauthorized operations.
- Existing unordered-pair uniqueness and self-friendship checks remain. Removing a friend updates status without deleting rows or cascading into ledger history.
- A database trigger requires and locks an accepted friendship before any future favor insertion or participant reassignment. `assertConnected()` is also available for the future server-side favor service. No favor-recording API/UI was added.
- RLS plus revoked anon/authenticated grants keep Friendship, Notification and RateLimitBucket server-only. The runtime Prisma role must own these tables or have BYPASSRLS, consistent with Phase 2. These are Auth.js users, not Supabase Auth identities.
- PostgreSQL-backed atomic rate-limit buckets work across app instances: discovery 30/minute, invitation attempts 10/hour, other mutations 30/10 minutes per signed-in actor. Closed requests have a 24-hour reconnect cooldown.
- Search requires 3–80 characters, returns ten results per page, and caps each query at five pages. Exact email matching and prefix name matching limit broad enumeration. Partial emails and SQL wildcard name searches are rejected. Current users, unregistered demo users and blocked connections are excluded. Discovery output is an explicit name/image/id allowlist plus relationship status.
- Lists/notifications are paginated in groups of 20. Profile history is restricted to the participant pair and confirmed favors only. Global balances/outstanding-balance counts are explicitly deferred.

## Database migration

Prisma generated `prisma/migrations/20261010010000_friends_notifications/migration.sql` from the pre-change schema. Reviewed additions:

- Nullable Friendship.connectedAt, backfilled from updatedAt for existing accepted connections.
- FRIEND_REQUEST_RECEIVED, FRIEND_REQUEST_ACCEPTED and FRIEND_REQUEST_REJECTED enum values. The existing FRIENDSHIP_REQUEST value remains for compatibility.
- Optional Notification.friendshipId with index and SET NULL relation.
- RateLimitBucket table for atomic shared abuse limits.
- Circle-table RLS/grant restrictions and the future-favor connection trigger.

The migration was applied successfully to the connected database using `pnpm db:deploy`. No database reset, table recreation, db push, user deletion, or existing ledger deletion was performed. Apply `pnpm db:deploy` in each other environment before deploying this code. No new credentials or external service configuration is required; the existing `.env` was not edited. Rate-limit rows are reused per actor/scope; operators can remove long-expired buckets as routine maintenance if inactive-account volume grows.

## Files

Created:

- `lib/friend-types.ts`, `lib/friends-service.ts`, `lib/circle-data.ts`.
- `components/dashboard-shell.tsx`, `components/circle-dialog.tsx`, `components/add-friend.tsx`, `components/circle-refresh.tsx`.
- `app/dashboard/friends/actions.ts`, `app/dashboard/friends/page.tsx`, `app/dashboard/friends/friends-view.tsx`, `app/dashboard/friends/[id]/page.tsx`.
- `app/dashboard/notifications/page.tsx`, `app/dashboard/notifications/notifications-view.tsx`.
- `app/dashboard/loading.tsx`, `app/dashboard/error.tsx`, `app/error.tsx`.
- The Phase 3 migration, `scripts/check-friends-db.mjs`, `tests/friends-actions.test.ts`, `tests/friends-db.test.ts`, and this report.

Modified:

- `app/dashboard/layout.tsx`, `app/dashboard/page.tsx`, `app/dashboard/dashboard-client.tsx`: shared shell, real circle data and demo ledger labels.
- `app/globals.css`: additional token-based circle styles; existing landing styles unchanged.
- `prisma/schema.prisma`, `scripts/smoke-auth.mjs`, `tests/auth-routes.test.ts`, `README.md`.

The Prisma client was regenerated. Existing uncommitted Phase 1/2 changes were preserved. No new packages were installed.

## Verification

Run the normal commands:

```text
pnpm db:validate
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Database tests require explicit opt-in. PowerShell:

```powershell
$env:RUN_FRIENDS_DB_TESTS='1'
pnpm test
Remove-Item Env:RUN_FRIENDS_DB_TESTS
```

The integration suite creates isolated generated test IDs, synthetic Google Account rows (not real OAuth credentials), and fixture-only confirmed history. It removes only those generated fixtures afterward. It does not reuse or modify real users. Without opt-in, the database suite is intentionally skipped. Use a development database for routine integration testing.

Read-only database verification: `node scripts/check-friends-db.mjs`. It checks RLS/API grants, the canonical unique index, the self-friendship constraint, the future-favor guard and leftover test users without logging profiles or credentials.

Anonymous production smoke testing: for a local production process, set `$env:AUTH_URL='http://localhost:3100'` before `pnpm start --port 3100`, then run `node scripts/smoke-auth.mjs` in another terminal. The temporary canonical URL ensures Auth.js trusts the local production host; `.env` does not need to be edited. It checks the anonymous session endpoint, public landing/login and redirects for overview, friends, profiles and notifications. Real deployments should use their canonical HTTPS origin or the trusted-proxy setup documented in the README. For live Google testing, use `pnpm dev` on the already registered port 3000, or register an additional matching OAuth callback first.

Completed: Prisma validation, TypeScript, ESLint (zero errors; the existing landing AnimatedCard unused-import warning remains), production build, and all 73 tests across nine suites, including 17 PostgreSQL integration tests. No tests failed in the final run. Database-backed tests cover send/accept/reject/cancel/remove, self/duplicate/reverse requests, concurrent opposite requests, concurrent accept/reject, ownership, canonical reconnection, history preservation, future-favor blocking, notification ownership, discovery privacy/pagination and shared rate limits/expiry. Read-only database verification and anonymous HTTP route smoke testing passed. A browser navigation to Friends redirected to login as expected; authenticated Friends UI and two real Google-account browser flows have not been verified in this session.

## Manual test with two Google accounts

1. Run `pnpm dev`. Use two separate browser profiles/private sessions and sign in with Google accounts A and B. Ensure both accounts are registered; add them to Google's test audience if the OAuth consent app is still in Testing.
2. In A, visit Friends → Add Friend. Search B's full email and name prefix. Verify A is excluded and neither provider tokens nor email addresses appear in name search results.
3. Invite B. A should see a Sent Request and an outgoing discovery indicator. Duplicate/reverse invitations should be rejected.
4. In B, focus/refresh the app or wait up to 30 seconds. Verify Incoming Requests and the unread bell count. Open Notifications, mark an item read, and verify only B's count changes.
5. Accept as B. Both accounts should show one accepted connection. A receives an acceptance notification; B's incoming count clears. Open View Profile and verify the real profile/connection date and appropriate shared-activity empty state.
6. Attempt replay/unauthorized actions through a stale tab or a third account if available. No state change should be permitted.
7. Remove the friend from either account. Confirm the dialog explains preservation/cooldown. Both circles should update; existing confirmed history remains in the database and new favor inserts are rejected until acceptance after reconnection.
8. After the 24-hour cooldown, reconnect and separately exercise decline and cancellation in fresh invitation cycles. Decline must be recipient-only; cancel must be requester-only. Both actions clear pending counts and preserve the canonical row. Each closed cycle starts a new cooldown.
9. Repeat UI checks at phone/tablet widths: navigation, tabs, modal search, keyboard focus/Escape, reduced-motion preference, notification reading and sign-out. Confirm no page-level horizontal overflow.

Remaining limits: outstanding-balance/global-balance integration and favor/settlement recording are deferred; discovery is deliberately bounded; other-account updates use polling; reconnect cooldown applies to cancelled, declined and removed connections. Automated database actors are synthetic and do not replace the final live Google-account walkthrough. Phase 4 has not started.

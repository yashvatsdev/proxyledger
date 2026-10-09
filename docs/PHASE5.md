# Phase 5: Global balances, settlements and ledger history

## Delivered functionality

`/dashboard/balances` shows actual per-person global balances, totals owed in each direction, relationship counts, zero-balance relationships, name search, four balance filters and four sorting modes. Results are paginated in groups of twenty. Accepted friends with no events are included with a real zero balance. Former connections with ledger history remain included; unrelated profiles are excluded.

`/dashboard/balances/[friendId]` shows the current signed balance, confirmed-favor count, pending settlement requests and a complete paginated activity timeline. Timeline entries show event type, subject when applicable, status, attendance date, event timestamp, signed accounting change and the resulting balance with that same person. Confirmed events change the balance; pending/rejected/canceled events show zero accounting change. Each event links to its original detail page.

`/dashboard/settlements` is a paginated inbox with incoming, outgoing, confirmed and rejected/canceled tabs, plus optional participant filtering. `/dashboard/settlements/[id]` shows explicit debtor, creditor, submitter, reviewer, positive proxy amount, note, status and timestamps. Only participants can inspect the request.

Settle buttons open a native dialog with avatar/name, authoritative current balance, who owes whom, maximum amount, positive integer input, optional note, and a clearly conditional after-confirmation preview. Pending requests do not optimistically change any authoritative balance. Successful creation shows feedback and refreshes data. Confirmation requires a separate explicit dialog with the exact debt direction and amount.

The overview now shows real owed/owing totals, outstanding/settled relationship counts, circle balance indicators, a balance preview, recent favor/settlement activity and pending settlement counts. Existing favor counts, recent confirmed favors, invitations and friend data remain. Friend lists show actual balance explanations; profiles show global balance, exchanged-favor count, recent ledger activity and full-ledger/settlement actions. Removed friends retain a public profile/history view; their email is not exposed through former-connection profiles.

The existing design tokens, fonts, layout patterns, native dialogs and Motion library are reused. Number changes fade directly to the authoritative value rather than interpolating through fictional balances. Cards, filters and timelines have lightweight entrances. Existing reduced-motion configuration and skeletons apply. Added layouts handle mobile/tablet widths. The landing page, Google OAuth and existing GSAP animations were not changed. No dependencies were added.

## Accounting and inherited settlement semantics

Balances are per user pair, across every subject. For viewer U and other participant F:

```text
Balance(U,F) = confirmed favors U performed for F
             - confirmed favors F performed for U
             + confirmed signed adjustments where U is requester
             - confirmed signed adjustments where U is recipient
```

Positive means F owes U; negative means U owes F; zero means even. Each confirmed attendance favor is exactly one proxy. PENDING, REJECTED, CANCELED and legacy REVERSED favors contribute zero. Only CONFIRMED settlements contribute their adjustment. Two opposite favors under different subjects net to zero globally. Balances for distinct people never offset each other in owed/owing dashboard totals.

The existing `Settlement.requesterId`, `recipientId`, `signedAmount` and `reason` columns retain their meanings. No direction column was renamed or guessed:

| Persisted field | Exact meaning |
| --- | --- |
| requesterId | Participant who submitted the request |
| recipientId | Other participant; the only person allowed to confirm/reject |
| signedAmount | Signed balance delta for requester; recipient receives its inverse |
| signedAmount > 0 | Requester is debtor; recipient is creditor |
| signedAmount < 0 | Recipient is debtor; requester is creditor |
| abs(signedAmount) | Positive number of proxies proposed for reduction |
| reason | Optional plain-text note, at most 2,000 characters |

Debtor, creditor and positive amount are explicitly derived and returned by the server DTO from this immutable encoding. This avoids storing duplicate direction fields that could disagree. New requests accept only a positive integer amount (1–2,147,483,647); clients never choose the persisted signed adjustment. For a requester balance B, delta is `-amount` when B is positive and `+amount` when B is negative. The server verifies the submitted direction still matches B and that amount does not exceed abs(B). Negative signedAmount remains legitimate internal storage; a negative proposed amount is rejected.

`settlementDelta`, `settlementParties`, the existing validation and `calculateBilateralBalance` utilities are reused. The database event view defines the same event deltas; each bounded timeline result is checked against the existing TypeScript utility to detect projection drift. PostgreSQL sums/counts use integer/bigint arithmetic. Values are checked against JavaScript's safe integer range before display; excessive ranges fail instead of rounding silently.

## Settlement lifecycle and authorization

| Operation | Authorized user | Required state | Result |
| --- | --- | --- | --- |
| Propose | Either participant of an existing nonzero shared debt | New request | PENDING |
| Confirm | recipientId, the non-submitter | PENDING and valid current debt | CONFIRMED |
| Reject | recipientId | PENDING | REJECTED |
| Cancel | requesterId | PENDING | CANCELED |

Both parties must acknowledge a reduction: submission supplies the first acknowledgement and explicit review supplies the second. confirmedAt and resolvedAt are recorded on confirmation; resolvedAt records rejection/cancellation. The original creation timestamp and request contents remain. Terminal states are immutable and cannot be replayed or reopened.

An accepted friendship is not required to resolve historical debt. Either participant can propose a reduction of their existing nonzero debt after removal; the other can confirm/reject, and the submitter can cancel pending requests. New attendance favors still require accepted friendship. Removing a connection never deletes balances, favors or settlements. A stale pending request remains visible and can be rejected/canceled even if the debt reaches zero or reverses; it cannot be confirmed in that condition.

Every page and Server Action calls `requireUser()` before data access. Actor IDs derive only from the Auth.js database-backed session. Validation strips forged requester, recipient, debtor/creditor, signed adjustment, state and timestamp fields. All service reads use participant scope and safe id/name/image selections. Unrelated detail URLs return not found; unrelated mutations fail safely. User-facing action failures do not disclose backend error details, credentials or account tokens. No sensitive browser storage or new logging is introduced.

## Pair-level concurrency and idempotency

`proxy_lock_pair(a,b)` acquires a PostgreSQL transaction-scoped advisory lock on a 64-bit hash of a JSON-encoded, sorted user pair. Reversing viewer direction produces the same key. JSON encoding avoids separator ambiguity; a hash collision can only serialize unrelated pairs, not weaken protection. Locks are released by commit/rollback. See [PostgreSQL advisory locking](https://www.postgresql.org/docs/current/explicit-locking.html#ADVISORY-LOCKS).

Settlement creation and resolution acquire this lock before reading the current balance or changing ledger state. Resolution identifies immutable participant IDs first, obtains the lock, then rereads status and authoritative balance inside a ReadCommitted transaction. Each post-lock statement sees fresh committed data. Conditional PENDING updates enforce one terminal transition. Notifications and read-state changes commit atomically with it.

Favor resolution uses the same pair lock before conditional mutation. New pending favors use the existing accepted-friendship lock/trigger and request-key uniqueness. Favor transactions use ReadCommitted for these explicit locks; subject creation retains Serializable isolation for case-insensitive duplicate prevention. This avoids broad serializable predicate conflicts between unrelated ledger pairs under concurrent workload. Serialization/deadlock and relevant uniqueness failures retry up to three times through the existing Prisma 7 adapter error normalization. Settlement timestamps and favor resolution timestamps come from the database clock after locking, avoiding differences between application-host clocks.

Database triggers also acquire the same pair lock for balance-changing favor inserts/updates/deletes and settlement operations. The settlement guard recomputes debt from the common ledger view before allowing confirmation, prohibits wrong-direction or excessive reductions, and rejects changes to immutable content or terminal states. The existing favor-history guard remains. Direct concurrent database-update coverage verifies the over-settlement guard independently of service checks. Privileged fixture cleanup is possible; there is no application history-deletion action.

Every proposed settlement has a UUID submissionKey unique within requesterId. Identical sequential/concurrent retries return the same record, including after it has resolved. Reusing the key with another participant, amount, direction or note fails. A confirmed settlement is applied once through the status transition. Pending requests do not reserve debt: multiple proposals may coexist, but each confirmation validates the then-current amount. If three units are owed and two requests each propose two units, only one can confirm. Two two-unit requests may both confirm against four units.

Database-backed rate limits are shared across instances: settlement proposals 20/hour and settlement resolution 60/10 minutes per actor. Existing friend/favor limits retain their prior scopes and values through the extracted `consumeRateLimit` helper. Operators may prune long-expired buckets as routine maintenance.

## Notifications and refresh

- Proposal sends SETTLEMENT_REQUEST_RECEIVED to the reviewer.
- Confirmation sends SETTLEMENT_CONFIRMED to the submitter.
- Rejection sends SETTLEMENT_REJECTED to the submitter.
- Cancellation sends SETTLEMENT_CANCELED to the reviewer.

Each notification links through settlementId to the detail page. Resolving a request marks its original request notification read. Request creation and transition notifications are transactional, with no duplicate application/notification under replay or racing actions. Existing owner-only notification reads, mark-as-read, unread counts and friend/favor notification links are preserved. Opening or reading a notification never confirms a settlement.

Actions invalidate the dashboard layout and refresh the caller's route. Other visible accounts refresh on focus or through the existing 30-second polling, paused while dialogs are open. This is not push delivery.

## Database migration and preservation

`20261010030000_global_ledger_settlements` was generated using Prisma schema diff and reviewed before application. It safely adds:

- SettlementStatus.CANCELED and settlement request/rejection/cancellation notification enums; existing enum values remain.
- Nullable Settlement.resolvedAt/submissionKey and creator-scoped request-key uniqueness.
- Nullable Notification.settlementId, index and SET NULL relation.
- Confirmation-time participant indexes on Favor/Settlement and canonical-pair/effective-time expression indexes for timeline queries.
- Settlement RLS/server-only grants, the security-invoker `ProxyLedgerEvents` view, pair lock/balance functions and ledger guards.
- A cancellation-aware timestamp check using text comparisons, which is safe when adding enum values in the same migration transaction.

The view is non-materialized and derived entirely from Favor/Settlement rows. It contains unconfirmed activity with zero deltas as well as confirmed immutable accounting events. It uses `security_invoker=true`, so underlying table protection is respected; the view and helper functions also revoke public access. See [PostgreSQL security-invoker views](https://www.postgresql.org/docs/current/sql-createview.html). Prisma uses the existing privileged backend role, never browser Supabase Auth identity or credentials.

The migration applied successfully to the configured development database. Before/after original-column counts and checksums confirmed existing records were preserved. At migration time those included two users, one friendship, five subjects, two favors and six notifications; no existing settlements needed direction migration. The existing signed model's meaning is explicit, and no historical directions or values were rewritten. No database reset, db push, user/friend/favor deletion or credential change was used.

For each other environment run `pnpm db:deploy` before deploying the code. Runtime Prisma must retain table-owner/BYPASSRLS permissions and execute access to the helper functions, consistent with the previous phases. No environment variables, OAuth callback changes or additional services are required.

## Services, files and performance

Created:

- `lib/ledger-service.ts`, `lib/ledger-data.ts`, `lib/ledger-lock.ts`, `lib/settlements-service.ts`, `lib/settlement-types.ts`, `lib/rate-limit.ts`.
- `app/dashboard/balances/page.tsx`, `balances-view.tsx`, `[friendId]/page.tsx`.
- `app/dashboard/settlements/actions.ts`, `page.tsx`, `[id]/page.tsx`.
- `components/settlement-dialog.tsx`, `settlement-actions.tsx`, `settlement-list.tsx`, `ledger-timeline.tsx`, `balance-number.tsx`.
- The Phase 5 migration, `scripts/check-ledger-db.mjs`, `tests/ledger-db.test.ts`, `tests/settlement-actions.test.ts`, `tests/settlement-input.test.ts`, this report and its browser screenshot.

Modified:

- `prisma/schema.prisma` and regenerated ignored client; `lib/ledger.ts`, `lib/favors-service.ts`, `lib/friends-service.ts`.
- `components/dashboard-shell.tsx`, `app/dashboard/page.tsx`, `dashboard-client.tsx`.
- `app/dashboard/friends/page.tsx`, `friends-view.tsx`, `[id]/page.tsx`.
- `app/globals.css`, `scripts/smoke-auth.mjs`, `tests/auth-routes.test.ts`, `.gitignore`, `README.md`.

Ledger service methods include per-person balances, bounded multi-profile lookups, filtered/paginated lists, totals, paginated history and dashboard overview. PostgreSQL aggregates all relevant events without loading full histories into application memory. Only twenty list/timeline rows are returned per page. Timeline running balances use a database window sum per counterpart, ordered by effective timestamp plus a deterministic `kind:id` event key; equal timestamps have stable ordering. Pagination is applied after the window calculation, so earlier-page balances are not incorrectly reset to zero. Counts and each paginated result share a RepeatableRead snapshot.

Batch profile-balance queries avoid one query per friend. Request-scoped React caches reuse overview/totals without caching another user's data. Filters/search/sorts are validated, and search LIKE metacharacters are escaped. The view, aggregate definitions and pair-balance function share one event-delta definition. The frontend formats server results; it does not compute authoritative balances. The settlement dialog's possible after-confirmation amount is explicitly a conditional preview only.

## Validation

Run:

```text
pnpm db:validate
pnpm db:generate
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

For actual PostgreSQL integration coverage in PowerShell:

```powershell
$env:RUN_FRIENDS_DB_TESTS='1'
$env:RUN_FAVORS_DB_TESTS='1'
$env:RUN_LEDGER_DB_TESTS='1'
pnpm.cmd test
```

The flags opt into isolated UUID/example.invalid fixtures on the configured development database. Cleanup is limited to fixture-owned rows. Without the flags, DB suites are skipped; that is not evidence of PostgreSQL concurrency coverage.

Final full test run: **174 tests passed across 16 suites**, including **82 actual PostgreSQL integration tests** (17 friendships, 27 favors, 38 ledger/settlement). Coverage includes empty/multiple/opposite/cross-subject balances, ignored states, participant symmetry, dashboard totals, partial/full settlements, forged inputs, invalid amounts, idempotency, status permissions, direct and service-level simultaneous confirmations, stale amounts/directions, favor-settlement races, pair-lock blocking, immutable history, removed connections, notification ownership, rate limits, filters and pagination/running balances.

An initial stress run exposed unnecessary serializable conflicts in pending-favor creation and a signed-zero test assertion. Favor transactions were narrowed to their explicit locks, the assertion was corrected, and the complete final suite passed. No failing tests remain. Prisma validation/generation, TypeScript, lint and the production build passed. ESLint retains only the existing unused AnimatedCard import warning on the unchanged landing page.

`scripts/check-ledger-db.mjs --snapshot` writes temporary original-record counts/checksums, without private record contents. Run the script without that flag after migration/tests to verify preservation and ledger access/trigger protection. The temporary baseline is ignored and removed after verification. Snapshot must be taken before the change being verified.

Production HTTP smoke checks passed: anonymous sessions receive 307 redirects to `/login` on all existing and new protected routes, while `/`, `/login` and the anonymous session endpoint remain accessible.

Authenticated browser verification was performed with the existing Motabhai and Yash Google accounts. OAuth account selection used the already registered `localhost:3000` origin; mutations used a freshly built production server on `localhost:3100`, with a process-only AUTH_URL override. Credentials, registered callbacks and `.env` were unchanged. The already-running development server retained its pre-generation Prisma singleton and failed on a settlement mutation; the fresh production process succeeded. **Restart `pnpm dev` after regenerating Prisma** before using the development server's mutation routes.

The actual browser walkthrough verified:

- Existing +1/-1 participant views, a rejected favor's zero delta, and an excessive settlement amount disabling submission.
- A marked settlement proposal leaving the balance unchanged; the other Google account rejected it, preserving debt and history.
- An opposite-direction favor under a different subject bringing the balance to zero, followed by four same-direction favor confirmations reaching +4/-4. Pending favors contributed zero.
- Cancellation preserving the four-unit debt and its audit entry.
- A two-unit pending proposal keeping +4/-4; opening its notification reduced the unread count without confirming it. Explicit confirmation produced +2/-2 and the correctly signed settlement event in both ledgers.
- A final two-unit request submitted by the creditor and confirmed by the debtor, reaching zero with original favors and both confirmed settlements retained. Settled ledgers have no Settle action.
- Secure sign-out and real Google account switching. Desktop ledger/balance layouts were inspected with screenshots and no horizontal page overflow.

These authorized browser tests added **one verification subject, five marked favors and four marked settlements** (two confirmed, one rejected, one canceled), plus their notifications. They intentionally remain in audit history; the relationship now has a zero balance. A separate post-browser check excluded only these identified new rows and confirmed that every original User, Friendship, Subject, Favor, Settlement and Notification row still matches its pre-migration checksum. Both final database balances are zero. No existing history was deleted or rewritten.

Browser evidence: [completed settlement, debtor zero](phase5-settled-ledger.jpg). The browser's viewport override did not change its actual viewport, so mobile/tablet visual checks are **not claimed**. Exhaustive keyboard/reduced-motion checks, unrelated-account browser checks, removed-friend browser flows and simultaneous browser confirmations remain manual; authorization, removed-friend behavior and actual PostgreSQL concurrency are covered by the automated integration tests.

## Two-account verification

Use two Google accounts in separate browser profiles, with an accepted friendship. Start `pnpm dev` on the existing registered OAuth origin. Keep tabs visible or refocus/refresh to observe the other account's changes. Note starting balances; use an even relationship for the exact numerical examples, rather than deleting existing history.

1. As A record an attendance favor for B; B confirms. A sees +1 and B sees -1 from an even starting balance. Record/confirm B helping A under a different subject. Both should return to zero. Check the original details and the per-event running balances in both ledgers.
2. Create/confirm four A-to-B favors. A sees +4 and B sees -4. From either account propose a reduction of two units with a note. Pending status, inbox/bell count and a linked notification appear; balances stay +4/-4.
3. The non-submitter opens the notification. Merely opening/reading it must leave the request pending. Choose Confirm, review debtor/creditor/amount in the dialog and explicitly approve. Verify +2/-2, one settlement event in each ledger, confirmation timestamps, one response notification and unchanged original favors.
4. Propose the remaining two units and confirm from the other account. Both balances become zero; Settle is no longer available. The ledger retains every favor and settlement.
5. Create fresh pending reductions against a nonzero debt. Reject one from the reviewer and cancel another from the submitter. Closed rows remain visible, timestamps/notifications are correct, and balances do not change. Stale/repeated terminal actions must fail.
6. Against three units, propose two separate two-unit requests. Attempt their confirmations concurrently from the appropriate participants. Only one may confirm; one unit remains, and the other request remains pending with safe feedback. The automated DB tests exercise this with actual parallel operations.
7. Before confirming a pending request, confirm enough opposite favors to reduce or reverse the debt. Settlement confirmation must fail; the reviewer can reject and the submitter can cancel. A new proposal uses the new direction/maximum.
8. Remove the friendship after activity exists. Balance/profile/ledger history and settlement resolution remain accessible to the participants. New favors must fail until reconnection is accepted. An unrelated account must not access either participant's ledger or settlement details.
9. Check all balance filters/sorts, pagination, settlement inbox tabs and history filters. Compare both users' signs and aggregate totals across multiple people. Marking notifications read changes unread counts only.
10. At mobile/tablet/desktop widths, check card/timeline overflow, native dialog scrolling, keyboard focus containment/restoration, Escape handling, disabled/loading controls, avatar fallback and reduced motion. Sign out and directly visit balances, a friend ledger, settlements and a settlement detail; each should redirect to login.

## Known limits and next work

There is no application edit/reversal/delete action for confirmed events, cash/payment processing, per-subject balance, browser-stored balance or push notification service. Legacy signed settlements remain honored under their original semantics. Zero-balance relationship counts include accepted connections with no confirmed exchanges and historical participants whose confirmed balance is zero. Pending activity is separately disclosed and does not reserve or alter debt.

Offset pagination is bounded to twenty rows per page and at most 1,000 pages; concurrent activity can move entries between page loads, while each individual page/count is snapshot-consistent. Very large histories still require database aggregation/window scans. Future approved work can profile query plans, introduce cursor pagination or rebuildable projections as needed, add authenticated browser end-to-end tests, and improve production observability/notification delivery. Phase 6/7 have not been started.

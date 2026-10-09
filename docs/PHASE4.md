# Phase 4: Favor recording, confirmation and history

## Delivered behavior

The dashboard's Record a favor button opens an accessible native dialog with accepted-friend search, profile avatars, explicit performer/receiver direction, searchable private subjects, inline subject creation, an attendance date and a plain-text note (2,000 characters). Choices are paginated in groups of twenty. The form defaults to today's college calendar date in Asia/Kolkata. Dates are canonical YYYY-MM-DD strings, validated on the server and stored at UTC midnight; displaying them in UTC prevents date shifts. Real creation/update/confirmation timestamps are shown in India time. Invalid/future dates and missing/unavailable subjects or friends are rejected.

Submission creates one PENDING Favor and one linked notification atomically. A per-submit UUID, scoped to the authenticated creator, makes retries and simultaneous submissions idempotent. Reusing a key with different content is rejected. The dialog keeps its key on failed network retries; closing and starting a new record generates a new key. Successful submission closes the dialog, shows feedback and refreshes dashboard data.

`/dashboard/transactions` provides real server-side search, status tabs, friend/subject selection from the current user's history, inclusive attendance-date ranges, counts and twenty-row pagination. Filter searches are also paginated and expose only participants or subjects already referenced in the user's history. Removed friends remain usable as historical filters. Search text is limited to eighty characters and SQL LIKE metacharacters are escaped. `/dashboard/transactions/[id]` shows performer, receiver, submitter, confirmation participant, subject, dates, note and status. Unrelated users receive a not-found response.

`/dashboard/subjects` creates and paginates the signed-in user's subjects. Names are trimmed, limited to 100 characters and checked case-insensitively for duplicates inside serializable transactions. Subjects belong to their creator. Selecting another user's subject for a new favor is forbidden. A participant can see the name attached to a shared favor, but cannot browse the other participant's private subject collection. Names are intentionally fixed after creation; editing and deletion are not exposed, preserving history. The favor-to-subject foreign key now restricts deletion.

The overview has actual recent activity, recent confirmed favors, pending and awaiting-confirmation counts, and confirmed-favor totals. Fabricated balances have been replaced with explicit Phase 5 placeholders. Existing live friendship counts, invitation UI, profile menus and authentication are preserved. Full balance and settlement UI remains deferred. The landing page, fonts and existing GSAP animations were not changed. New component CSS uses existing design tokens; Motion interactions respect the dashboard's reduced-motion configuration.

## Lifecycle and authorization

| Action | Authorized actor | Starting state | Result |
| --- | --- | --- | --- |
| Record | Signed-in participant with an accepted friendship and an owned subject | New record | PENDING |
| Confirm | The participant who did not submit | PENDING | CONFIRMED, confirmedAt and resolvedAt set |
| Reject | The participant who did not submit | PENDING | REJECTED, resolvedAt set |
| Cancel | Original submitter | PENDING | CANCELED, resolvedAt set |

The submitter may be the performer or the receiver. Their submission acknowledges the claim; the other participant's explicit confirmation supplies the second acknowledgement. The UI always shows who performed and received the favor before final confirmation. Opening a notification or marking it read never confirms a favor. Confirmed and other terminal records cannot be canceled, edited, reconfirmed or rejected through these actions. Legacy REVERSED rows remain readable and do not count toward balances.

Existing pending claims remain inspectable and resolvable by their original participants after friendship removal. The reviewer can confirm/reject and the submitter can cancel; no new claims are accepted until a friendship is accepted again. Confirmed history remains available in Transactions after removal. This policy preserves a claim created while the friendship was accepted without allowing new claims against a removed friend.

Each CONFIRMED favor contributes exactly one global unit in the existing `calculateBilateralBalance` utility. Subject identity never partitions balances. PENDING, REJECTED, CANCELED and REVERSED rows contribute zero. Two opposite confirmed favors under different subjects yield a global net of zero.

## Server architecture and security

- Initial pages use Server Components and call `requireUser()` before data access. All exported Server Actions authenticate before parsing or opening the database. Actors, ownership and initial status are derived on the server; client-supplied actor, performer, state and timestamp fields are stripped.
- `createFavorsService` contains schema validation, explicit safe DTO selections, participant-scoped reads and lifecycle writes. It reuses the existing favor validation and ledger utility. No REST API or parallel user system was introduced.
- Favor creation and resolution run in serializable Prisma transactions, with conditional PENDING updates and atomic notification changes. Conflicts are retried up to three times. `dbErrorCode` recognizes Prisma P2034 and Prisma 7 pg-adapter commit-time serialization/deadlock conflicts; existing friendship retries also use it. Uniqueness races on request keys are retried and resolve to the existing immutable record.
- The existing database accepted-friendship trigger locks the connection during insert, preventing friendship-removal races. A new trigger forbids changing favor participants/content and forbids terminal-state updates. Application checks enforce the authenticated actor; database triggers do not infer Auth.js identity.
- PostgreSQL-backed limits work across instances: favor creation 20/hour; subject creation 20/hour; favor resolution 60/10 minutes; choice searches 60/minute per actor. A retry can consume an attempt but cannot create another favor. Rate-limit buckets remain reusable and can be pruned by operators after expiration.
- Favor/Subject RLS and revoked anon/authenticated grants keep data accessible through the trusted Prisma backend only. Existing Auth.js and Phase 3 table protections remain. Runtime Prisma requires the existing table-owner/BYPASSRLS role, never a browser Supabase key. There are no Supabase Auth policies or new secrets.
- Notes render as React text; no HTML evaluation, sensitive browser storage, token output or raw database error logging is introduced. Error messages omit connection details and private data.
- Mutations revalidate the dashboard layout. Existing focus/visibility and 30-second visible-tab polling refreshes the other account; updates are not push delivery and polling pauses while a native dialog is open.

## Notifications

Creation sends FAVOR_REQUEST_RECEIVED to the non-submitting participant. Confirmation sends FAVOR_CONFIRMED to the submitter; rejection sends FAVOR_REJECTED to the submitter; cancellation sends FAVOR_CANCELED to the other participant. All are linked by favorId to the detail page. Resolution marks the original request notification read in the same transaction. Conditional transitions and request-key uniqueness prevent duplicate notifications. Existing owner-only notification reads, mark-as-read and unread counts handle both friendship and favor notifications.

## Database migration

Prisma generated `20261010020000_favors_confirmation` from the previous schema. It adds CANCELED and the new notification enums, nullable Favor.resolvedAt/submissionKey, creator-scoped submission-key uniqueness, nullable Notification.favorId and its index/relation, a restrictive subject relation, server-only table protections and a favor-history trigger. Original enum values and nullable legacy subjects remain compatible; original data columns are not rewritten. Legacy resolvedAt/submissionKey values remain null.

The development database migration was applied successfully. The first application was rolled back completely by PostgreSQL because a new enum literal was used in the same transaction; metadata confirmed no partial columns or enum additions. The failed attempt was marked rolled back with Prisma, the timestamp check changed to text comparisons, and the corrected migration applied normally. PostgreSQL documents the enum transaction restriction in [ALTER TYPE](https://www.postgresql.org/docs/current/sql-altertype.html); recovery follows [Prisma's failed-migration workflow](https://www.prisma.io/docs/orm/v7/prisma-migrate/workflows/patching-and-hotfixing).

Before/after original-column counts and checksums confirmed preservation of the two existing users, one friendship, two notifications and all existing subjects/favors/settlements. No reset, db push, table recreation or existing-row deletion was used. Temporary integration fixtures are isolated and cleaned up separately.

For other environments run `pnpm db:deploy` before deploying this code. No environment-variable or OAuth configuration changes are required; `.env` was not edited.

## Files

Created:

- `lib/favor-types.ts`, `lib/favors-service.ts`, `lib/favor-data.ts`, `lib/db-errors.ts`.
- `components/record-favor.tsx`, `components/favor-actions.tsx`, `components/favor-filter-picker.tsx`.
- `app/dashboard/transactions/actions.ts`, `page.tsx`, `transactions-view.tsx`, `[id]/page.tsx`.
- `app/dashboard/subjects/page.tsx`, `subject-form.tsx`.
- The Phase 4 migration, `scripts/check-favors-db.mjs`, `scripts/inspect-phase4-migration.mjs`.
- `tests/favors-db.test.ts`, `tests/favor-actions.test.ts`, `tests/favor-input.test.ts`, `tests/db-errors.test.ts`, this document.

Modified:

- `prisma/schema.prisma` and regenerated ignored Prisma client.
- `lib/ledger.ts`, `lib/friends-service.ts`.
- `components/dashboard-shell.tsx`, `app/dashboard/page.tsx`, `dashboard-client.tsx`, `app/dashboard/friends/[id]/page.tsx`.
- `app/globals.css`, `scripts/smoke-auth.mjs`, `tests/auth-routes.test.ts`, `README.md`.

No packages were added. Existing uncommitted Phase 1–3 files were preserved.

## Verification

Commands:

```text
pnpm db:validate
pnpm db:generate
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

For actual PostgreSQL integration tests, set both `RUN_FRIENDS_DB_TESTS=1` and `RUN_FAVORS_DB_TESTS=1` before `pnpm test`. Without these flags, database suites are skipped. Fixtures use new UUIDs and example.invalid addresses; these are service-level integration tests, not real Google browser sessions. Cleanup removes only fixture-owned rows.

Final validation: 122 tests passed across 13 suites, including 27 favor and 17 friendship tests against the actual PostgreSQL database. TypeScript passed. ESLint passed with zero errors and the pre-existing unused AnimatedCard import warning on the unchanged landing page. Prisma schema validation and client generation passed. The production build passed with all new routes rendered dynamically. An initial run exposed an adapter commit-time conflict in an existing friendship test; the shared retry fix has a focused regression test and the complete rerun passed. Post-test original-record checksums matched the baseline, proving fixture cleanup and preservation of existing records; friendship RLS/index/constraint/connection-trigger checks also passed.

Production HTTP smoke checks passed: anonymous `/api/auth/session` returns 200/null; `/` and `/login` return 200; dashboard, friends, friend profile, notifications, transactions, transaction detail and subjects all return 307 to `/login`. The temporary production server used a process-only AUTH_URL on port 3100; `.env` remained unchanged, and the temporary server was stopped after verification.

`scripts/check-favors-db.mjs --snapshot` writes only counts/checksums to a local temporary baseline. Running the script without that flag compares original records and checks table protections. Run snapshot only before the change you intend to verify. Temporary baselines are not committed. `scripts/inspect-phase4-migration.mjs` prints non-sensitive migration/schema metadata only.

No connected browser session was available for an authenticated two-account walkthrough. Responsive behavior, native-dialog keyboard containment/focus restoration and real Google actions need the live browser checks below; no browser success is claimed.

## Manual two-account walkthrough

1. Start `pnpm dev` on the registered localhost OAuth origin. Sign into Account A and Account B in separate browser profiles. Ensure their friendship is accepted. Keep tabs visible or refocus/refresh to receive cross-account updates.
2. As A open Record a favor. Create Mathematics if absent, select B, choose **I marked their attendance**, select today/past date, add a note and submit. Verify Pending, the success feedback and unchanged confirmed count. A must have only Cancel available for that pending record.
3. As B check the unread notification and open its transaction. Verify the exact performer/receiver/submitter, subject/date/note and that opening/marking read leaves it pending. Choose Confirm, inspect the confirmation dialog and explicitly confirm. Verify Confirmed and timestamps in both accounts; there is one confirmed-favor unit.
4. As A create Physics, choose B and **They marked my attendance**, then submit. As B confirm. Both rows should preserve opposite directions under different subjects. The automated database/ledger test verifies these directions net globally to zero; full balance display belongs to Phase 5.
5. Create separate pending records. As B reject one; as A cancel another. Verify both remain in history, notifications point to their details, pending counts decrease and confirmed totals stay unchanged. Repeat/stale actions must fail safely.
6. Exercise all status tabs, search friend/subject names, date ranges and name-based friend/subject filters. Check pagination and empty states. Create private subjects on B; A must not see them in the recording subject picker. A can see a subject attached to an existing shared claim.
7. Test removal using disposable pending claims: history stays readable, the original reviewer can still resolve them and new recording is blocked. Confirmed claims remain read-only. Reconnect through the existing invitation policy when desired.
8. Sign out and directly request Transactions, a known detail URL and Subjects. All must redirect to login. Sign in as an unrelated test account and a detail URL must show not found.
9. At phone/tablet/desktop widths, check filters/cards without horizontal overflow, the mobile-menu Record a favor button, tab navigation, avatar fallback, modal scrolling, focus trapping/restoration, Escape handling, loading/disabled controls and reduced-motion settings.

## Remaining scope

Subject renaming/deletion, favor editing/reversal UI, rejection reasons, real-time push updates, export, full global balances and settlements are intentionally outside this phase. Existing REVERSED records are view-only. Phase 5 should use the existing global ledger calculation over all confirmed favors and confirmed settlements, preserve these authorization boundaries and add balance/settlement UI only with separate approval.

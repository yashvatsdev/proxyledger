# Proxy Ledger launch checklist

10 October 2026. **Public production launch: BLOCKED pending configuration and owner decisions.** Local preparation is complete; approval does not make unchecked items pass. Latest authorization is controlled preview preparation only. Follow the [preview action inventory and approval gates](PREVIEW_DEPLOYMENT_PLAN.md) before live changes; the [production deployment proposal](DEPLOYMENT.md) remains a later approval scope.

## Local release evidence

- [x] Phase 7A security controls retained; accounting/schema/history unchanged.
- [x] Production Node/pnpm and nondestructive frozen-lockfile build configured.
- [x] Remote runtime verified TLS, bounded serverless pool, sanitized failure events.
- [x] TypeScript, lint, Prisma validation/generation and production build.
- [x] Full isolated unit/PostgreSQL regression suite; see exact counts in [PHASE7C.md](PHASE7C.md).
- [x] Two-account local UI workflow using provisioned database sessions; real Google login is separate below.
- [x] Eight surfaces at eight widths checked for overflow; automated axe checks and local screenshots.
- [x] Mobile favor form, over-debt rejection, modal Escape/focus checks.
- [x] Anonymous route/header/session smoke test.
- [x] Dependency advisories documented without suppression or unsafe major overrides.
- [x] No production database writes, migration, deployment, paid resource creation or Git push.

## Owner approval inputs and staging gates

- [ ] Select release commit/branch, Vercel account/eligible plan and approved production domain.
- [ ] Confirm actual Supabase project region/plan, pooler limits and permitted runtime role.
- [ ] Approve `bom1` if actual database region is Mumbai; otherwise choose the matching region.
- [ ] Supply production and isolated preview secrets in deployment secret stores, never in Git/chat.
- [ ] Review the two remaining high dependency advisories and record a launch risk decision; re-audit release lockfile.
- [ ] Approve support/contact and legal identity; publish privacy/terms with actual processors/data uses.
- [ ] Approve retention and deletion/anonymization process that preserves other participants' shared ledger rights/history; destructive deletion remains unimplemented.
- [ ] Verify backup entitlement, choose RPO/RTO/owner/retention, take an encrypted backup and rehearse restore to an isolated database.
- [ ] Confirm migration status; separately approve exact pending SQL if any. No migrations run automatically during deployment.
- [ ] Verify remote TLS/certificate chain, Data API grants/RLS/view/function protections, role statement/lock timeouts and connection capacity.
- [ ] Review/approve any database timeout changes after staging measurements; validate cancellation and recovery.
- [ ] Register exact Google production and stable preview callbacks; configure consent domain/contact/privacy/audience/basic scopes.
- [ ] Use two approved staging Google accounts to verify actual OAuth onboarding, returning login and session refresh/revocation.
- [ ] Confirm Secure/HttpOnly/Lax cookies on HTTPS, CSRF rejection, safe redirects and logout session deletion.
- [ ] Establish included/free platform alerts, availability checks, incident contact and backup monitoring; approve costs separately if required.
- [ ] Verify actual Vercel Node/pnpm build/runtime versions, previews' isolated database and deployment protection.
- [ ] Exercise actual pooled database under representative traffic; local tests are not serverless load evidence.

## Manual accessibility/device checks

- [ ] NVDA/VoiceOver: headings/landmarks, Google button, real account avatar names, active navigation, labels, errors/live regions and ledger sign explanations.
- [ ] Keyboard-only: Tab/Shift+Tab through all navigation/forms; Enter/Space actions; dialogs trap focus and Escape/close restore the trigger; search arrows/Enter/Escape and account disclosure.
- [ ] 200–400% zoom and OS high contrast: readable labels, visible focus, no clipped controls or unscrollable dialogs.
- [ ] Real iOS Safari and Android Chrome at small widths: virtual keyboard/date input, dialog inner scrolling, touch targets, rotations and long text/email.
- [ ] Normal and reduced-motion preferences: no essential content hidden after entrances; focus changes/feedback remain perceivable; review decorative motion.
- [ ] Manually inspect axe incomplete contrast results on transparent/animated/gradient landing backgrounds; zero automated violations is not WCAG certification.
- [ ] Throttled mobile network/CPU: loading states, slow Google images/fonts, layout shifts, hydration and error recovery. Confirm core web vitals from actual traffic before making numerical claims.

## After approved deployment — all currently pending

- [ ] HTTPS/domain redirect and landing/CTA/How It Works rendering.
- [ ] Read-only `SMOKE_ORIGIN=https://<APPROVED_DOMAIN> node scripts/smoke-security.mjs`: 12 anonymous protected-route redirects, security headers and anonymous no-store session. Run only against the intended approved hostname.
- [ ] Real Google new/returning login returns to dashboard and survives refresh.
- [ ] Two approved isolated QA accounts: invitation → accept → private subject/favor → other participant confirm → +1/-1 → settlement request → other confirm → 0/0.
- [ ] Verify pending/rejected/canceled items do not alter balances; global cross-subject signs and history remain correct.
- [ ] Validate duplicate requests and concurrent confirmations in isolated staging, never destructive stress against live records.
- [ ] Notifications appear, unread counts/read acknowledgment/deep links work; no unrelated user data exposed.
- [ ] Friends, transactions, subjects, balances, settings and mobile navigation work; no fake unsupported settings/subject editing implied.
- [ ] Both sign-outs delete sessions; subsequent protected access is rejected.
- [ ] Inspect restricted runtime logs for sanitized auth/database/action/deployment failures; verify no token/credential leakage.
- [ ] Confirm included availability/backup alerts and operator ownership.
- [ ] Record deployment ID, commit, region, tested time and failures; promotion only after gates pass.

## Rollback and recovery

Keep the last compatible deployment ID and immutable release evidence. For a bad application release, obtain rollback approval and use the documented Vercel rollback route, then repeat HTTPS/auth/protected/ledger smoke tests. Code rollback does not undo ledger writes or migrations. For database damage, freeze writes, preserve the current state, restore to a new isolated target and verify counts/checksums/ledger invariants before a separately approved cutover. Never restore over historical records as a rehearsal. Record recovery-point data loss and reconcile subsequent activity with users under the approved policy.

## Approval gate

The proposal includes local fixes/security/advisory/test evidence, limitations, exact Vercel settings, database migration/backup/rollback plan, Google settings, environment names, monitoring, costs and blockers. These are defined in the three Phase 7 documents; unknown owner values remain pending.

“Proxy Ledger has completed Phase 7B and 7C preparation. Do you approve the proposed production deployment and the specifically listed live configuration changes?”

Stop until explicit approval. This gate is required by the user's combined Phase 7B/7C request. Any paid upgrade, deletion, reset, credential rotation, production migration set or Git push outside the specific approval needs separate authorization.

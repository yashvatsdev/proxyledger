# Pre-deployment UI/UX polish

10 October 2026. Local frontend polish only. No deployment, live-service change, Git push, production migration, credential edit or original database-record change.

## Landing entrance and motion

The CTA row previously animated only `y`, with delayed immediate rendering; its opacity stayed visible throughout the badge/heading/description entrances. Both existing buttons now share a 500ms opacity/18px transform entrance in the same scoped GSAP timeline, following the description. Their existing dashboard/get-started and smooth How It Works navigation are preserved. No duplicated buttons or additional animation library.

A finite CSS entrance keeps the row hidden before hydration and reveals it after 1.8 seconds if JavaScript does not load. GSAP disables that fallback once it owns the hydrated timeline. A four-second watchdog clears hidden intro styles if animation frames stall. Completion, persisted `pageshow`, preference changes and unmount cleanup restore visibility/clean up listeners and timeline styles. Keyboard focus reveals the CTA row immediately rather than leaving focused controls invisible. Reduced motion skips the GSAP entrance and CSS fallback; landing Motion components now inherit `MotionConfig reducedMotion="user"`.

The primary button's additional GSAP magnetic pointer hook was removed because it competed with Motion on the same transform. Motion hover/tap feedback remains on the buttons; GSAP animates their parent row. Navigation/button CSS transitions now name their color properties instead of implicitly transitioning every property. Scroll/particle/dashboard/modal animation identity remains. Mobile nav backdrop blur drops from 18px to 8px and decorative glow blur from 80px to 40px, with its width bounded to the container. No FPS, battery or Core Web Vitals improvement is claimed without measurement.

## Dashboard typography

Geist fits the existing compact productivity interface and supports a single variable family across regular body text, medium navigation and semibold headings/numbers. It is configured with `next/font/google`, Latin subset and swap display, scoped through a CSS variable on the dashboard layout. Landing and login retain their original Arial/Helvetica stack. Next.js self-hosts the generated font assets; browsers do not contact Google Fonts for the dashboard font. See [Next.js font optimization](https://nextjs.org/docs/app/getting-started/fonts).

Dashboard headings use weight 600 with a restrained 27–36px page-heading range and 1.18 line height. Navigation uses 500. Native form elements inherit the workspace font. Balances, counts, timestamps and pagination use tabular numerals. Mobile fields are 16px to avoid the usual small-text focus zoom on iOS; physical iOS verification remains outstanding.

## Clutter and responsiveness

- Removed the static decorative overview “Live circle · Live favors” badge, which was not a connection-health indicator. Refresh logic remains untouched.
- Removed the repeated “Your live connections” subtitle and “Live circle data” captions on three friend summary cards. Retained the important outstanding-history explanation and every count, tab and action.
- Removed the duplicate “View all balances” link below recent activity; the adjacent balance panel and navigation keep the same destination readily available.
- Retained favor/settlement statuses, confirmations, request review links, notification badges/read actions, errors, subject immutability information and settings instructions after auditing their purpose. No supported functionality was removed.
- Reduced summary-card minimum height (128px desktop, 118px mobile) and empty-state padding without hiding content. Section headings wrap with a defined gap while their action links resist shrinking.
- Activity titles now wrap rather than truncate to one line; supporting metadata can wrap long text. Mobile form typography is readable. Existing adaptive grids, bounded dialogs, scrolling tabs/forms, sidebar breakpoint and native modal focus handling remain in place.

Browser-measured CTA spacing is **28px at 320/375/390/430**, **32px at 768/1024/1280/1440**. Every requested width has centered CTA geometry and zero document horizontal overflow. CTA layout top/height remain constant throughout the entrance; only opacity and transform change. This is reserved-layout evidence, not a whole-site CLS score.

## Changed files for this request

| File | Purpose |
| --- | --- |
| `app/page.tsx` | Coordinated CTA fade, recovery/cleanup, reduced-motion configuration and removal of competing magnetic transform |
| `app/dashboard/layout.tsx` | Dashboard-only Geist configuration; authentication/data calls preserved |
| `app/dashboard/dashboard-client.tsx` | Simplify repeated overview captions/badge/link |
| `app/dashboard/friends/friends-view.tsx` | Remove redundant summary captions; all friend actions retained |
| `app/globals.css` | Font scope/hierarchy/numerals, wrapping/density, finite CTA fallback, focused/reduced-motion visibility and mobile blur/form adjustments |
| `tests/auth-routes.test.ts` | Mock Next's build-time font loader so existing server authorization assertions still run under Vitest |
| `scripts/verify-ui-polish.mjs` | Loopback-only real-browser animation/fallback/navigation/geometry/accessibility checks |
| `docs/PRE_DEPLOY_UI_POLISH.md` | This report |

Prior Phase 7 and preview-plan working changes were preserved. No service, accounting, authentication implementation, notification logic, schema, migration, deployment configuration, package dependency or secret changed in this task. Existing migrations were applied only to a new disposable loopback PostgreSQL 16 test container, as part of local verification.

## Verification

| Check | Result |
| --- | --- |
| `pnpm typecheck` | Passed |
| `pnpm lint` | Passed, zero warnings/errors |
| `pnpm build` | Final Next.js 16.4 production build passed; Geist fetched/generated successfully |
| Full existing tests with isolated PostgreSQL flags | **217 passed, 0 failed, 25 suites, 13.82 seconds**; includes 88 PostgreSQL tests |
| `node scripts/verify-ui-polish.mjs` against final local production build | Passed all six animation/navigation scenarios and eight landing geometry/axe checks |
| Existing `pnpm test:browser` against final build | Passed two-account flow, mobile dialog/navigation/focus and **64/64** layout/axe checks at the eight requested widths; **zero violations and browser errors** |
| `git diff --check` | Passed; ordinary Windows line-ending notices |

The first full unit run exposed Vitest's missing Next font loader (`Geist is not a function`); adding a font-only mock restored all seven authorization tests without weakening their assertions. The first hero check needed corrected detection of the browser's serialized animation shorthand; final checks observe real computed opacity/transform, not source strings.

Hero scenarios verified in Chromium: description entering while CTA opacity stays zero; intermediate fade/movement frames; reserved layout; exactly two CTA links; smooth section navigation; real back navigation; persisted-page restoration event; changing to reduced motion; JavaScript disabled; and a requestAnimationFrame scheduler that never invokes callbacks, followed by watchdog recovery. No browser/hydration exception occurred in the hero checks.

Browser reports/screenshots are local ignored artifacts under `.phase7-artifacts/`, including `ui-polish/results.json`, frame samples and eight landing screenshots. The existing two-account harness provisions synthetic local Google Account/Session fixtures, exercises actual UI/actions and removes only those isolated fixture records. It does not perform real Google OAuth. Local authenticated workflow still checks invitation/acceptance, subject/favor confirmation (+1/-1), settlement confirmation (0/0), notifications and both real UI sign-outs.

## Remaining checks and review gate

Automated axe checks report no violations in the final 64-page matrix, mobile favor dialog and eight additional landing checks. Landing `color-contrast` incomplete results on animated/transparent/gradient elements still require manual inspection; they are not counted as passed rules. Real touch devices/virtual keyboards, NVDA/VoiceOver, high contrast, zoom, throttled performance and comprehensive normal-motion interaction across every dashboard state remain manual checks. The two previously documented high dependency advisories and preview/live OAuth/infrastructure gates are unchanged by this UI task.

Local implementation stops for owner review. No deployment or production launch approval is inferred from these UI results.

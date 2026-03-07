# Production Review And Test Plan

## Scope

This sweep focused on executable and operational surfaces in the repository:

- Source pages and scripts: `index.html`, `index-script.js`, `memorization.html`, `memorization.js`, `duas/duas.html`, `script.js`, `services/`, `state/`, `ui/`, `AyahControl/`
- Automation and delivery: `.github/workflows/`, `.github/e2e/`, `firebase.json`, `cloudbuild.reel.yaml`
- Generated/content-heavy folders such as `ayahs/`, `verbs_tables/`, `generated/`, and `build/` were treated as data artifacts unless directly referenced by runtime code.

## Findings

### High

1. The browser smoke suite was not runnable as committed.
   - The Playwright config and tests imported `@playwright/test`, but the repository only carried `playwright` in `artifacts/pw`, so `npx playwright test` failed before executing any checks.
   - Fix applied: the repo now has a root `package.json` / `package-lock.json`, and the Playwright files use `playwright/test` so the suite can run from the repository root.

2. The existing dua smoke test asserted the wrong behavior.
   - `duas/duas.html` intentionally redirects top-level visits to `/?tab=duas`, where the actual UI renders inside `iframe[name="duasFrame"]`.
   - Fix applied: the smoke coverage now tests both the redirect and the embedded iframe experience.

### Medium

3. Firestore service logic was duplicated in two places.
   - `services/firestoreService.js` had diverged from `services/_private/firestoreService.js`, including stale logic and mojibake text.
   - Fix applied: `services/firestoreService.js` now re-exports the maintained private implementation, removing the drift.

4. `memorization.html` and `memorization.js` had drift between standalone controls and optional host-shell selectors.
   - The standalone page was missing concrete elements used by the script, including the recitation settings trigger, live status region, last-ayah metadata, and the Surah list quick action.
   - Fix applied: the missing standalone controls were restored, dead welcome selectors were removed, and static validation now treats host-shell-only ids as optional instead of reporting false positives.

### Low

5. The repository had no deterministic root automation entrypoint.
   - CI depended on transient installs and ad hoc package placement under `artifacts/pw`.
   - Fix applied: root scripts now own static validation and browser smoke execution.

6. `styles.css` referenced a missing mobile quiz background asset.
   - `/assets/bg_quiz.jpg` did not exist, which meant the verb-game mobile background could silently fall back to nothing.
   - Fix applied: the missing image reference was replaced with a local gradient fallback.

## Changes Implemented

- Added root Node automation metadata: `package.json`, `package-lock.json`
- Added deterministic static validation: `scripts/repo_static_checks.js`
- Added a lightweight local web server for Playwright and CI: `scripts/static-server.js`
- Updated Playwright config and smoke coverage under `.github/e2e/` and anchored the local web server to the repo root
- Updated `.github/workflows/web-ci.yml` to run root validation plus browser smoke and upload artifacts
- Replaced the stale public Firestore service copy with a single re-export
- Cleaned the memorization DOM contract by restoring missing standalone controls, removing dead selectors, and filtering optional host-shell ids in static validation
- Replaced the missing mobile quiz background image reference with a gradient fallback in `styles.css`

## Automated Coverage Now In Place

| ID | Area | Type | Expected success outcome | Failure outcome |
| --- | --- | --- | --- | --- |
| CI-01 | Source syntax and local references | Static | JS parses, local imports resolve, HTML/CSS assets exist | CI fails with the missing file or syntax location |
| CI-02 | Python helper scripts | Static | Python files compile with `py_compile` | CI fails on the offending Python file |
| UI-01 | Home page shell | Browser smoke | `#mainNavbar` renders, page title is correct, no first-party client errors | Test fails and attaches a screenshot / trace |
| UI-02 | Memorization shell transition | Browser smoke | Welcome view opens the recitation shell and renders ayah words | Test fails and attaches a screenshot / trace |
| UI-03 | Standalone dua route | Browser smoke | `/duas/duas.html` redirects to `/?tab=duas` | Test fails if redirect breaks or route no longer matches |
| UI-04 | Embedded duas screen | Browser smoke | `duasFrame` renders the header and at least one dua card | Test fails if iframe content breaks or frame wiring regresses |

## Manual Test Matrix

| ID | Scenario | Steps | Expected outcome | Possible failure indicators |
| --- | --- | --- | --- | --- |
| M-01 | Guest opens home | Load `index.html` in a fresh browser session | Main nav is visible and no blocking error appears | Blank shell, console errors, missing nav |
| M-02 | Guest opens memorization | Load `memorization.html` and press `Resume` | Welcome screen hides and recitation shell becomes visible | Button does nothing, shell remains hidden, missing ayah words |
| M-03 | Memorization replay controls | On `memorization.html`, use play / mic / peek controls | Controls respond without breaking layout | Disabled controls unexpectedly, page errors, overlay stuck |
| M-04 | Dua shell navigation | Open `/?tab=duas` | Dua iframe loads and shows cards | Empty iframe, no dua cards, repeated request failures |
| M-05 | Standalone dua deep-link | Open `/duas/duas.html` directly | App redirects to `/?tab=duas` | No redirect, loop, or partial dua page left on screen |
| M-06 | Authenticated sync | Sign in and resume memorization | Profile state and memorization data rehydrate without console errors | Missing profile data, silent logout, Firestore request failures |
| M-07 | Notification registration | Trigger notification enrollment from an authenticated session | Token is registered once and rate-limit handling is graceful | Repeated prompts, 429 loops, service-worker registration failure |
| M-08 | Mobile layout sanity | Run the smoke suite in mobile mode or open on a narrow viewport | Main controls remain reachable and readable | Clipped buttons, hidden action bar, overlapping cards |

## MCP Screen Evaluation Note

- Figma MCP was checked during this review.
- Authenticated account: `i.will.learn.quran.786@gmail.com`
- Seat: `View` on `Learn Quran's team`
- Result: automated file-based Figma capture is constrained in this environment because capture requires an interactive output choice and a writable destination. For unattended verification, Playwright screenshots were used instead. If an interactive clipboard or Figma-file capture is wanted later, the local server is now ready for that flow.

## Residual Risks

1. Mobile runs can emit a Google-hosted iframe error from `apis.google.com` (`u[v] is not a function`). The stack points to the third-party Google API script rather than repository code, so the smoke suite ignores that specific noise and continues to fail only on first-party issues.
2. Authenticated and notification flows are still only manually covered because the repo does not yet include a safe automated Firebase test fixture.

## Recommended Next Cleanup Pass

1. Decide whether optional host-shell ids should stay in `memorization.js` or move behind a clearer shell adapter layer.
2. Decide whether archival files such as `index-scripe-swipe-working-prperly-just shaky.js` should remain tracked or move to a dedicated `archive/` folder.
3. Add authenticated Playwright coverage once a safe test account or mocked Firebase layer is available.


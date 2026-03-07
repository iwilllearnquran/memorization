# Web vs Android Parity QA Checklist

Use this checklist before each Android release so behavior matches the web app as closely as possible.

## Run Info

| Field | Value |
| --- | --- |
| Release/Build | |
| APK/AAB Version | |
| Tester | |
| Date | |
| Android Device/OS | |
| Web Browser/Version | |
| Environment (Prod/Staging) | |

## Scope

Primary parity areas in this checklist:

- Dua card sharing (image vs text-only behavior)
- WebView bridge events (`NATIVE_TAB_SWITCH`, `SYSTEM_BAR_COLOR`, `SAVE_PROGRESS`)
- Auth flow behavior in Android native Google sign-in
- External URL handling from inside app
- Progress/storage behavior consistency
- Stability and regression checks around these flows

## Preconditions

1. Latest web code deployed (or known staging URL).
2. Latest Android build installed from same code baseline.
3. Test with both:
   - Guest (logged out)
   - Logged-in user
4. Start from a clean app state at least once:
   - Clear Android app storage.
   - Clear browser site data for web run.

## Test Data

| Label | Value |
| --- | --- |
| Test account A | |
| Test account B (optional) | |
| Sample dua reference | `2:201` |
| Sample learn ayah | `1:1` then any later ayah |

## Execution Order

1. P0 Smoke (S-series)
2. Share parity (SH-series)
3. Navigation/system bars (NB-series)
4. Storage/progress sync (ST-series)
5. Auth native Google sign-in (AU-series)
6. External links (EX-series)
7. Regression/stability (RG-series)

## P0 Smoke

| ID | Priority | Platform | Test Case | Steps | Expected Result | Pass | Fail | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| S1 | P0 | Android | App loads home | Open app fresh | Home loads without blank screen/crash | [ ] | [ ] | |
| S2 | P0 | Android | Learn tab works | Open Learn tab and load an ayah | Ayah content renders and audio controls appear | [ ] | [ ] | |
| S3 | P0 | Android | Duas tab works | Open Duas tab and scroll list | Dua cards render and actions are usable | [ ] | [ ] | |
| S4 | P0 | Android | Memo tab works | Open Memorization tab | Memorization UI loads correctly | [ ] | [ ] | |
| S5 | P0 | Web + Android | Basic parity sanity | Open same feature on web and app | No major missing UI/flow in Android | [ ] | [ ] | |

## Share Parity (Dua Card)

| ID | Priority | Platform | Test Case | Steps | Expected Result | Pass | Fail | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| SH1 | P0 | Web | Web dua share baseline | Share one dua card from web | Share sheet contains image card + text metadata | [ ] | [ ] | |
| SH2 | P0 | Android | Android dua share image attachment | Share same dua card in app | Shared payload includes image (not text-only) | [ ] | [ ] | |
| SH3 | P0 | Android | No text-only regression | Share to target app (e.g., WhatsApp/Telegram) | Image is visible in compose preview | [ ] | [ ] | |
| SH4 | P1 | Android | Share cancel handling | Open share sheet then cancel | No crash, app remains responsive | [ ] | [ ] | |
| SH5 | P1 | Android | Repeat share reliability | Share 3 different dua cards consecutively | All attempts succeed consistently | [ ] | [ ] | |
| SH6 | P1 | Android | Caption fallback behavior | Share when bridge text exists | Shared content includes expected caption/link text where supported | [ ] | [ ] | |
| SH7 | P2 | Android | Low-memory stability | Background app, return, share again | Share still works; no stale/blank image | [ ] | [ ] | |

## Navigation + System Bar Parity

| ID | Priority | Platform | Test Case | Steps | Expected Result | Pass | Fail | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| NB1 | P0 | Android | Tab switch from web bridge | Switch Learn -> Memo -> Duas via bottom nav | Native system/status bar color updates each tab | [ ] | [ ] | |
| NB2 | P1 | Android | Memo page color bridge | Enter Memorization flows that send `SYSTEM_BAR_COLOR` | System bar color changes to requested valid hex color | [ ] | [ ] | |
| NB3 | P1 | Android | Foreground restore | Put app background and resume on each tab | System bar color remains correct after resume | [ ] | [ ] | |
| NB4 | P2 | Android | Invalid color safety | Trigger/observe invalid color payload path | App ignores invalid colors without crash | [ ] | [ ] | |

## Storage + Progress Sync Parity

| ID | Priority | Platform | Test Case | Steps | Expected Result | Pass | Fail | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ST1 | P0 | Web | Save progress baseline | In web Learn flow, trigger Save Progress | Success toast/flow appears and progress persists | [ ] | [ ] | |
| ST2 | P0 | Android | Save progress flow works in app | In app Learn flow, trigger Save Progress | Same UX outcome as web (success, no errors) | [ ] | [ ] | |
| ST3 | P1 | Android | Native mirror receives save events | Trigger save in app, inspect native storage (debug tooling) | `lastReadAyah` and `completedSurahs_new` updated in AsyncStorage | [ ] | [ ] | |
| ST4 | P1 | Android | Guest progress persistence | Save as guest, restart app | Resume/progress remains consistent with last saved state | [ ] | [ ] | |
| ST5 | P1 | Android | Logged-in progress persistence | Save while logged in, restart app | Resume/progress and account data remain consistent | [ ] | [ ] | |
| ST6 | P2 | Web + Android | Cross-check logical behavior | Perform same sequence (save, navigate, resume) on both | Behavior parity (sequence outcome) is consistent | [ ] | [ ] | |

## Auth Native Google Sign-In (Android)

| ID | Priority | Platform | Test Case | Steps | Expected Result | Pass | Fail | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| AU1 | P0 | Android | No embedded Google auth page | Tap drawer login in app | App does not render Google `Error 403 disallowed_useragent` page in WebView | [ ] | [ ] | |
| AU2 | P0 | Android | Native account chooser opens | Tap drawer login in app | Native Google account chooser opens in-app flow | [ ] | [ ] | |
| AU3 | P0 | Android | Auth applied to app session | Select Google account and complete login | App shows logged-in user state and data sync uses DB user session | [ ] | [ ] | |
| AU4 | P1 | Android | Cancel handling | Cancel from account chooser | App remains stable; user stays guest | [ ] | [ ] | |

## External Link Handling

| ID | Priority | Platform | Test Case | Steps | Expected Result | Pass | Fail | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| EX1 | P0 | Android | HTTPS external link | Tap external HTTPS link from app content | Opens device browser, not blocked/silent fail | [ ] | [ ] | |
| EX2 | P1 | Android | Contact form link | Open known contact URL from app | Correct external page opens | [ ] | [ ] | |
| EX3 | P1 | Android | `mailto:` handling | Tap a mailto link (if available) | Mail app chooser opens correctly | [ ] | [ ] | |
| EX4 | P1 | Android | `tel:` handling | Tap a tel link (if available) | Dialer opens correctly | [ ] | [ ] | |
| EX5 | P2 | Android | Return path | After opening external browser, return to app | App remains stable at prior state | [ ] | [ ] | |

## Regression + Stability

| ID | Priority | Platform | Test Case | Steps | Expected Result | Pass | Fail | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| RG1 | P0 | Android | No WebView message parse crashes | Use app across tabs and features for 10 minutes | No crashes from bridge message handling | [ ] | [ ] | |
| RG2 | P1 | Android | No silent failures in core flows | Perform share + save + tab switches quickly | No stuck UI, no broken navigation | [ ] | [ ] | |
| RG3 | P1 | Android | App relaunch reliability | Force-close app, relaunch, repeat smoke | App reliably returns to usable state | [ ] | [ ] | |
| RG4 | P2 | Android | Long-session memory sanity | 20+ minute session across learn/memo/duas | No severe lag, black-screen, or repeated crashes | [ ] | [ ] | |

## Optional Debug Evidence

Capture these for failed cases:

1. Screenshot/screen recording
2. Exact timestamp
3. Device + OS version
4. Repro steps
5. If debug build: relevant console/logcat lines

## Release Gate

| Gate | Status |
| --- | --- |
| All P0 tests passed | [ ] |
| No text-only share regression in Android | [ ] |
| Save progress parity is verified | [ ] |
| No embedded Google 403 auth page in Android | [ ] |
| Native Google chooser login works end-to-end | [ ] |
| External links open correctly from app | [ ] |
| Ready for release | [ ] |

## Defect Log

| ID | Test Case | Severity | Observed Behavior | Expected Behavior | Owner | Status |
| --- | --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |  |

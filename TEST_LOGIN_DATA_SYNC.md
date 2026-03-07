# Login + Local-to-DB Sync QA Checklist

Use this checklist before each release to verify authentication, guest-to-user migration, and data consistency between local storage and Firestore.

## Run Info

| Field | Value |
| --- | --- |
| Release/Build | |
| Environment (Prod/Staging) | |
| Tester | |
| Date | |
| Browser/Device | |

## Test Accounts

| Label | Email | Notes |
| --- | --- | --- |
| User A | | Primary account |
| User B | | Secondary account for account-switch checks |

## Data to Observe

Note for Android app (`react-native-webview` wrapper):

- Google login must use native in-app Google account chooser.
- Embedded WebView Google page (`Error 403: disallowed_useragent`) is a fail.
- Successful native chooser login must create logged-in Firebase session in the app.

Local storage keys (primary):

- `guestPoints`
- `guestStreakHistory`
- `guestStreakFreezes`
- `completedSurahs_new`
- `lastReadAyah`
- `memo_progress_v1`
- `memo_listens_v1`
- `memo_last_progress_v1`
- `qq_namaz_goals_widget_v1`
- `guest_migration_done_v1:{uid}`

Firestore (`users/{uid}`) fields (primary):

- `points`
- `streakHistory`
- `streakFreezes`
- `completedSurahs`
- `lastRead`
- `progress`
- `listens`
- `lastMemorized`
- `namazGoals`
- `fcmToken` (if notification permission/token flow is enabled)

## Pre-Run Reset (for clean full-cycle run)

1. Sign out.
2. Clear site data/local storage.
3. In Firestore, clear test user docs or use fresh test accounts.
4. Hard refresh the app.

## Checklist

Mark exactly one of `Pass` or `Fail` for each row.

| ID | Area | Test Case | Steps | Expected Result | Pass | Fail | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A1 | Auth | Fresh guest session | Open app while signed out | App loads as guest, no auth errors | [ ] | [ ] | |
| A2 | Auth | Login success | Login with User A | User session starts, UI reflects logged-in user; on Android app, native Google account chooser flow is used (not embedded WebView Google page) | [ ] | [ ] | |
| A3 | Auth | Logout success | Logout from User A | App returns to guest state cleanly | [ ] | [ ] | |
| A4 | Auth | Re-login same user | Login User A after logout | User A data reloads correctly from DB | [ ] | [ ] | |
| A5 | Auth | Switch accounts | Login User A, logout, login User B | No leakage of User A data into User B | [ ] | [ ] | |
| A6 | Auth | Anonymous handling | Use app signed out and perform actions | Anonymous/guest behavior is consistent, no blocked flows | [ ] | [ ] | |
| G1 | Guest Local Data | Guest points accumulation | As guest, complete scoring actions | `guestPoints` increases locally | [ ] | [ ] | |
| G2 | Guest Local Data | Guest streak updates | As guest, trigger streak increment/freeze usage | `guestStreakHistory` and/or `guestStreakFreezes` update | [ ] | [ ] | |
| G3 | Guest Local Data | Guest progress writes | As guest, update memorization/listen progress | `memo_progress_v1`, `memo_listens_v1`, `memo_last_progress_v1` update | [ ] | [ ] | |
| G4 | Guest Local Data | Guest last-read/completed writes | As guest, mark ayah read and complete surah | `lastReadAyah` and `completedSurahs_new` update | [ ] | [ ] | |
| M1 | Migration | Guest -> User A initial migration | Create guest data, then login User A | Guest data appears in `users/{UserA}` correctly | [ ] | [ ] | |
| M2 | Migration | Migration marker creation | After M1, inspect local storage | `guest_migration_done_v1:{UserA uid}` exists | [ ] | [ ] | |
| M3 | Migration | Guest local cleanup post-migration | After M1, inspect guest keys | Migrated guest keys are cleared/reset as expected | [ ] | [ ] | |
| M4 | Migration | No duplicate migration on refresh | Stay logged in User A and refresh multiple times | No repeated point inflation or duplicate merges | [ ] | [ ] | |
| M5 | Migration | Logout resets per-user migration state | Logout User A, inspect marker | User A marker removed locally after logout | [ ] | [ ] | |
| M6 | Migration | Recreate guest data and migrate again | After logout, generate new guest data and login User A | Only new guest delta migrates once; totals are correct | [ ] | [ ] | |
| D1 | DB Sync | Logged-in point write | Logged in as User A, earn points | `users/{UserA}.points` increments correctly | [ ] | [ ] | |
| D2 | DB Sync | Logged-in streak write | Trigger streak update while logged in | `streakHistory`/`streakFreezes` persist correctly | [ ] | [ ] | |
| D3 | DB Sync | Logged-in progress write | Update memorization/listen progress while logged in | `progress`, `listens`, `lastMemorized` fields update | [ ] | [ ] | |
| D4 | DB Sync | Logged-in last-read merge logic | Write older lastRead then newer lastRead (and vice versa) | DB keeps the newest/most advanced last-read record | [ ] | [ ] | |
| D5 | DB Sync | Completed surah merge | Complete surahs across multiple sessions | `completedSurahs` remains deduplicated and complete | [ ] | [ ] | |
| D6 | DB Sync | Write without pre-existing doc | Use fresh User B and perform first write | User doc is created via merge writes; no update failures | [ ] | [ ] | |
| R1 | Regression | No double points in arrange game | Complete one arrange round logged in | Final points increase exactly once for that win | [ ] | [ ] | |
| R2 | Regression | No double points in verb game | Complete one verb match round logged in | Final points increase exactly once for that win | [ ] | [ ] | |
| R3 | Regression | Session consistency across auth changes | Start game, change auth state, continue | No crashes or mixed guest/user session writes | [ ] | [ ] | |
| R4 | Regression | PersistStats invalid payload safety | Trigger/inspect invalid or zero delta path | No bad writes; invalid deltas ignored safely | [ ] | [ ] | |
| N1 | Notifications | Token write guard | Register notifications while logged out and while logged in | Logged-out path does not write user token; logged-in path writes safely | [ ] | [ ] | |
| E1 | Error Handling | Offline then reconnect sync | Go offline during write, then reconnect | App recovers; data eventually consistent without duplication | [ ] | [ ] | |
| E2 | Error Handling | Multi-tab conflict | Open two tabs with same account and perform writes | No data corruption; last-write behavior is predictable | [ ] | [ ] | |
| E3 | Error Handling | Permission/rules denial visibility | Simulate denied write (rules/test env) | Error is surfaced/logged and app remains usable | [ ] | [ ] | |

## Release Gate

| Gate | Status |
| --- | --- |
| All A*, G*, M*, D*, R* tests passed | [ ] |
| No unexplained point/streak differences between local and DB | [ ] |
| No auth-switch leakage across users | [ ] |
| Ready for release | [ ] |

## Defect Log

| ID | Test Case | Severity | Observed Behavior | Expected Behavior | Owner | Status |
| --- | --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |  |

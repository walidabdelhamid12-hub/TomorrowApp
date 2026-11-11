# Task 5B — temporary Android persistence probe

Preparation only: native process-restart verification remains pending. No ADB was
available on PATH or at LOCALAPPDATA/Android/Sdk/platform-tools/adb.exe, and neither
ANDROID_HOME nor ANDROID_SDK_ROOT was configured in the preparation environment.

## Open on a USB-connected Android device

Use SDK-58-compatible Expo Go or the existing compatible Android development build.
Keep the same host app/client and project throughout; they have different storage
sandboxes. Do not uninstall, clear app data, or run a reset command.

With Android Platform Tools available and USB debugging authorized, run:

Terminal 1 (PowerShell):

    Set-Location 'D:\Mobile Apps\TomorrowApp'
    npx expo start --go --localhost

Terminal 2 (use the full path to adb.exe if it is not on PATH):

    adb devices
    adb reverse tcp:8081 tcp:8081
    adb shell am start -a android.intent.action.VIEW -d 'exp://127.0.0.1:8081/--/dev-installments-storage'

Use the actual Metro port if different. For multiple devices, add -s DEVICE_SERIAL
immediately after adb on each command. For LAN instead, start Metro without
--localhost and append /--/dev-installments-storage to its printed exp://host:port URL.
No project dependencies need installing.

For an existing custom Android development build, load this project using your
usual development-build workflow, then open the app's configured scheme:

    adb shell am start -a android.intent.action.VIEW -d 'tomorrowapp://dev-installments-storage'

The route has no normal navigation link. Its root Stack.Protected guard and route
component require __DEV__ and Android. The harness is lazy-loaded only inside
that development-only gate. Production and non-Android requests cannot run it.

## Force-stop and restart test

1. Open the route. No operation should have run; Create starts disabled.
2. Tap **Hydrate / verify ID (read only)**. Expect successful hydration and no
   writes. If data is malformed/unsupported, retain the error and stop. No reset
   or repair action is available here.
3. Tap **Create one test contract (writes)** once. Confirm result.ok is true.
   Record the full displayed contractId and returned record/timestamps outside
   the app (for example, a screenshot). The ID starts task5b_android_probe_.
   The standalone contract is OMR 1.235: down payment 0.001 due 2030-01-01 and
   regular installment 1.234 due 2030-02-01, with row IDs derived from the contract ID.
4. Open Android Settings > Apps > the same host application > **Force stop**.
   Stop Expo Go if using Expo Go, or the custom app if using a development build.
   Reload, Fast Refresh, backgrounding and dismissing from Recents are not this
   test. Keep Metro running and do not clear storage.
5. Relaunch the same host application/project and reopen the same deep link.
6. Enter the recorded ID in **Saved contract ID**. Tap **Hydrate / verify ID
   (read only)**. Do not tap Create again. Expect result.ok: true and **MATCH:
   same test contract and schedule**. Compare the returned full record/timestamps
   with your pre-stop capture. Confirm postingAllowed: false and readiness: blocked.
7. Record device model/Android version, host client/build, ID, before/after records,
   and actual force-stop/relaunch result. MATCH without force-stop is not proof
   of native process-restart persistence.

Create permits one attempt per screen mount and rejects rapid duplicate taps.
Remounting enables another explicit create after hydration, so the restart test
must use the read-only button. A failed/uncertain save is never called successful;
inspect the attempted ID with read-only hydration rather than creating again.
Existing records are preserved by the store API. The probe remains stored; this
harness provides no update/delete/reset. It adds no normal Save Contract action.

## Automated checks and limits

Node tests exercise real components and the Task 5A store with simulated native
primitives/AsyncStorage. A fresh-JS-store test is explicitly not a native restart
test. Task 5A source and tests are preserved byte-for-byte. No payment, posting,
linked-entity, balance or Net Worth changes are introduced.

References inspected: [SDK 58](https://docs.expo.dev/versions/v58.0.0/),
[route guards](https://docs.expo.dev/router/advanced/protected/), and
[deep links](https://docs.expo.dev/linking/into-your-app/).

## Remove after verification

Remove src/app/dev-installments-storage.tsx, its matching Stack.Protected block
and Platform import in src/app/_layout.tsx, the dev/InstallmentsStorageHarness.tsx
screen and tests/finance-installments-harness.test.cjs. No Task 5A change is needed.
This preparation task does not remove the harness or erase its saved probe.

## Task 5B result reported by tester (2026-11-07)

- Reported result: PASSED MATCH after reopening the Android application.
- Exact force-stop procedure, device/build details, contract ID, and before/after records are not independently documented in this report.
- Earlier pending text is retained as historical preparation instructions.
- Finance posting remains disabled (`postingAllowed=false`).
- No posting, replay, repair, or accounting integration authorized.
- Task 5C: temporary harness removed; isolated storage and tests retained.
- Verification: 143 tests passed, 0 failed.
- No commit or push authorized.
# SCRUM-530 / COS-389 — Relocate Apple Health connection to a deliberate profile control

## Why
Ken found that simply visiting **Personal Information** silently fired the iOS
HealthKit permission dialog. `app/(personal-info)/index.tsx` called
`initializeHealthKit()` from a `useEffect` on mount, so the prompt was triggered
by accident rather than by an explicit user action. This change removes that
accidental trigger and moves HealthKit connection to a deliberate, easy-to-find
opt-in control on the profile drawer.

## Files changed
- **`app/(personal-info)/index.tsx`** — removed the mount `useEffect` that
  called `initializeHealthKit()` (and the now-unused import). Left a comment so
  no one re-adds an auto-prompt. The rest of the screen is untouched.
- **`services/health.ts`** — exported `isHealthKitAvailable()` (was a private
  const) so the new screen can render a graceful "not available" state. No
  behavior change to the existing functions.
- **`services/apple-health-preference.ts`** *(new)* — pure AsyncStorage service
  (mirrors `services/calendar-preferences.ts`) storing a single boolean under
  `cos_apple_health_enabled_v1`. `getAppleHealthEnabled()` /
  `setAppleHealthEnabled()`.
- **`app/Home/apple-health.tsx`** *(new)* — the deliberate control. Follows the
  `app/Home/security-settings.tsx` pattern (`AppWrapper` + header + card +
  `Switch`). Shows title + explanation, an "Enable Apple Health" labeled toggle
  that calls `initializeHealthKit()` and reflects the granted result, status
  messaging, and a graceful "not available on this device" state when
  `!isHealthKitAvailable()`.
- **`app/Home/_layout.tsx`** — registered the `apple-health` screen
  (`href: null`, `headerShown: false`) like the other settings screens.
- **`components/profile-content.tsx`** — added an **Apple Health** `DrawerRow`
  (iOS only via `Platform.OS === 'ios'`) in the **My Health** section, routing
  to `/Home/apple-health`.

## How connection state is tracked
iOS does not reliably expose prior HealthKit *read*-permission status (Apple
hides read grants for privacy), so we persist a lightweight local hint of the
user's choice in AsyncStorage. The toggle hydrates from this flag on mount so it
reflects the user's decision on return. The flag is a UI hint only — it never
fabricates a connected state and is not a source of truth for data flow. When
the user turns it off we forget the local hint and point them to
Settings > Privacy & Security > Health to fully revoke (an app cannot revoke its
own HealthKit access).

## Data path unchanged
The daily health summary (`getTodayHealthMetrics`) and `useHealthKitTrends`
(→ `getAllHealthKitVitalTrends`) still request permission themselves and are
fully independent of the new flag. We only moved **where** the permission is
first requested. The summary already handles absent HealthKit data gracefully
(returns zeros / empty trends), so there is no crash when not connected.

## OTA-safety
TS/TSX only. No changes to `app.json`, `Info.plist`, `ios/`, `android/`,
plugins, `eas.json`, `package.json`, or any native config. The HealthKit
entitlement + usage strings already exist in the binary, so no new binary is
required — this ships safely as an OTA update.

## Verification
- `npx tsc --noEmit` — clean (exit 0).
- `npx eslint` on touched files — 0 errors (2 pre-existing warnings only, not
  introduced by this change).
- `npm test` — 89/89 pass.

## Build / OTA
No EAS build triggered and no OTA update published. The user controls when to
OTA.

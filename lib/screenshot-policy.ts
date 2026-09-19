/**
 * Screenshot / screen-recording policy (COS-401, SCRUM-537).
 *
 * RN-import-free so node:test can load it directly (mirrors lib/care-plan.ts).
 *
 * The app blocks screenshots app-wide via expo-screen-capture
 * (preventScreenCaptureAsync) because PHI is rendered on virtually every
 * authenticated screen — see app/_layout.tsx (SCRUM-368 / MOBILE-003).
 *
 * SCREENSHOTS_BLOCKED is the app-wide capture policy:
 *   - true   → capture protection ON.
 *   - false  → app calls allowScreenCaptureAsync(); anyone can screenshot.
 *
 * It is currently FALSE by product decision (COS-1034, below) so patients can
 * capture their own records. It was a temporary testing toggle until then.
 *
 * HIPAA / PHI SAFEGUARD WARNING:
 * Flipping this to `false` removes a PHI safeguard for EVERY user on that
 * build/OTA — not just the tester. It is OTA-controllable (pure JS, no native
 * rebuild) ONLY because the block is implemented through the expo-screen-capture
 * JS path. Flip to false → OTA → collect screenshots → flip back to true → OTA
 * BEFORE the build reaches real (PHI-bearing) users. Never ship a binary or a
 * lasting OTA with this set to false.
 */
/*
 * COS-1034 — SCREEN CAPTURE IS NOW ALLOWED, AS A DELIBERATE PRODUCT DECISION.
 *
 * Vishal, 2026-09-17, asked for screenshots enabled on production for every
 * user, and confirmed it after being shown the consequences below. This is a
 * POLICY CHANGE, not the "temporary toggle" this file used to describe, and
 * the distinction matters — the last time this constant was false it was an
 * accident that lasted ten weeks.
 *
 * WHAT THIS COSTS, recorded so the decision is legible later:
 *   - PHI renders on virtually every authenticated screen.
 *   - On iOS a screenshot lands in the photo library and syncs to iCloud
 *     Photos, which is NOT a BAA-covered service. The same is true of Google
 *     Photos on Android.
 *   - It applies to every user, not to testers.
 *   - Screenshots taken while this is false cannot be recalled by setting it
 *     back to true.
 *
 * WHAT IT IS FOR: patients being able to keep and share their own records —
 * which is a legitimate thing for a patient to want to do with their own data,
 * and is the reason this was asked for.
 *
 * FOR HISTORY: this was previously flipped to false on 2026-06-26 for a round
 * of screenshot testing and never flipped back. Ten weeks on main, through
 * every build and OTA, with capture protection off for every patient. The
 * 2026-08-21 audit flagged it at ~8 weeks and it was STILL false. COS-905
 * restored it and added the guards. Those guards worked exactly as designed:
 * they made this change something a person had to decide and sign, rather than
 * something that could drift. That is why they are being AMENDED here rather
 * than deleted.
 */
/**
 * COS-1057 — RETIRED AS A CONTROL. Read by nothing.
 *
 * Vishal, 2026-09-19: "this needs to be a feature that I can configure in the
 * plan, it should not be like this variable where we are mentioning that
 * screenshots blocked true or false."
 *
 * He is right, and the history above is the argument for it: this constant
 * spent ten weeks set wrong because changing it needed an OTA, applied to the
 * whole fleet at once, and left no record of who decided. COS-1038 added the
 * plan permission but kept this OR-ed on top as a fleet-wide override — which
 * meant there were still two places to look and one of them could silently
 * outrank the other.
 *
 * Now there is one: the plan. This export remains only so that anything still
 * importing it compiles, and it is deliberately `false` so that if some
 * forgotten caller does read it, it grants rather than blocks. Deleting it
 * outright is the follow-up once nothing references it.
 *
 * DO NOT re-introduce this into the decision. If capture must be stopped
 * everywhere at once, that is a plan change applied to every plan, or a
 * feature-flag kill switch — not a constant that needs a release.
 */
export const SCREENSHOTS_BLOCKED = false;

/**
 * COS-939 — a DEBUG-BUILD exception, which is strictly safer than the flag.
 *
 * Vishal, testing the Android build: "this app doesn't allow screenshots...
 * please disable this blockage so that I can share the screenshots of the UI."
 *
 * A real need — we have spent days on Android UI I could not see, because
 * FLAG_SECURE blocks `adb screencap` and `uiautomator` too.
 *
 * The sanctioned path was to flip SCREENSHOTS_BLOCKED to false, OTA, collect,
 * and flip back. That is EXACTLY the procedure that failed: COS-905 records
 * ten weeks on main with capture protection off for every patient, because the
 * flip back never came. The guard in prepare-build.sh now stops a PROD BUILD
 * shipping that way, but an OTA to production needs no such build.
 *
 * So the exception is `__DEV__` instead. It is compiled out of every release
 * bundle by Metro, which means:
 *
 *   - a debug build (expo run:android / run:ios) allows screenshots;
 *   - a release binary and EVERY OTA to one CANNOT, whatever anyone forgets;
 *   - there is nothing to flip back.
 *
 * SCREENSHOTS_BLOCKED stays, because it is still the only way to let a
 * TestFlight or internal-track tester screenshot a RELEASE build — Ken's case.
 * That path keeps its guard and its test.
 *
 * `isDevBuild` is a PARAMETER rather than a direct `__DEV__` read so this file
 * stays RN-import-free and node:test can load it (see the header). The caller
 * in app/_layout.tsx passes the real global.
 */
/**
 * Should capture be prevented for THIS patient?
 *
 * COS-1057 — `planBlocksCapture` is now the only input. It used to default to
 * SCREENSHOTS_BLOCKED, which meant the answer had two sources and a reader had
 * to know which won. There is no default any more: the caller must say what
 * the patient's plan decided, so "nobody set it" cannot quietly mean "blocked".
 *
 * The `__DEV__` exception (COS-939) stays. A debug build points at dev by
 * construction, so the PHI this protects is not present to leak, and Metro
 * compiles the branch out of every release bundle — a release binary and every
 * OTA to one ignore it regardless of what anyone forgets.
 */
export function shouldPreventScreenCapture(
  planBlocksCapture: boolean,
  isDevBuild = false,
): boolean {
  if (isDevBuild === true) return false;
  return planBlocksCapture === true;
}

/**
 * COS-1038 — the plan-level lever, which is what was actually asked for.
 *
 * Vishal, 2026-09-18: "I told you that if this has to be permission so
 * enabling and disabling the screenshots or screen share it must be a
 * permission so I can disable directly in the plan".
 *
 * He is right, and `SCREENSHOTS_BLOCKED` alone could never do it. A constant
 * is compiled into the JS bundle, so changing it needs an OTA or a new binary,
 * it applies to the whole fleet at once, and it leaves no record of who
 * decided. That combination is precisely how this file spent ten weeks set
 * wrong (see COS-905 above) — the flip back needed a deploy, so it never came.
 *
 * As a permission the same decision becomes data: set on a plan in the admin
 * dashboard, applied per patient, changed without shipping anything, and
 * carried in the entitlements audit trail like every other grant.
 *
 * DIRECTION, because it is the easy thing to get backwards. The key names the
 * RESTRICTION, not the ability:
 *
 *     key present on the plan  →  capture BLOCKED for that patient
 *     key absent               →  capture allowed
 *
 * Absence is permissive because that is the shipped decision this file already
 * records: capture is on for everyone (COS-1034), and the plan is how it gets
 * taken away from a cohort that should not have it. Naming the key the other
 * way round would mean every existing plan had to be edited before anyone
 * could screenshot anything, which inverts the default Vishal chose.
 *
 * The gate is read with `useHasNamedGrant` (hooks/use-entitlement.ts), NOT
 * `useCanRender` — a wildcard must never switch a restriction on. That hook's
 * header has the full reasoning.
 *
 * THE GLOBAL CONSTANT STILL WINS. `SCREENSHOTS_BLOCKED` is OR-ed with this, so
 * setting it true re-blocks the entire fleet regardless of any plan. It stays
 * as the emergency lever precisely because a per-plan control is the wrong
 * shape for "stop this everywhere, now".
 */
export const CAPTURE_BLOCK_ENTITLEMENT = 'privacy-controls.block-screen-capture';

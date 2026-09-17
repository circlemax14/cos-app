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
export function shouldPreventScreenCapture(
  blocked: boolean = SCREENSHOTS_BLOCKED,
  isDevBuild = false,
): boolean {
  // A debug build never carries real patient data — it points at dev by
  // construction (scripts/run-android.sh, prepare-build.sh) — so the PHI this
  // safeguard protects is not present to leak.
  if (isDevBuild === true) return false;
  return blocked === true;
}

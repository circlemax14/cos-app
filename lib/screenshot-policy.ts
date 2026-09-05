/**
 * Screenshot / screen-recording policy (COS-401, SCRUM-537).
 *
 * RN-import-free so node:test can load it directly (mirrors lib/care-plan.ts).
 *
 * The app blocks screenshots app-wide via expo-screen-capture
 * (preventScreenCaptureAsync) because PHI is rendered on virtually every
 * authenticated screen — see app/_layout.tsx (SCRUM-368 / MOBILE-003).
 *
 * SCREENSHOTS_BLOCKED is a deliberate, temporary testing toggle:
 *   - true  (DEFAULT, SECURE)  → capture protection ON — today's behavior.
 *   - false (UNSAFE)           → app calls allowScreenCaptureAsync() and stops
 *                                preventing capture, so testers (e.g. Ken) can
 *                                send screenshots.
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
 * COS-905 — restored to the secure default.
 *
 * This was flipped to false on 2026-06-26 for a round of screenshot testing
 * and never flipped back. Ten weeks, on main, through every build and OTA in
 * between — so every patient has had capture protection off while PHI renders
 * on virtually every authenticated screen, and on iOS a screenshot syncs to
 * iCloud Photos, which is not a BAA'd third party.
 *
 * The 2026-08-21 audit flagged it at ~8 weeks. It was still false today. That
 * is what a temporary toggle with no guard costs.
 *
 * If a tester needs screenshots again: flip it, OTA, collect, flip back, OTA —
 * and the test in tests/unit/screenshot-policy.test.ts must be edited in the
 * same commit, which is the point of it. It is not there to be annoying; it is
 * there so "temporary" leaves a trace someone has to answer for.
 */
export const SCREENSHOTS_BLOCKED = true;

/**
 * Pure decision helper: should the app actively prevent screen capture?
 * Extracted so the default-secure invariant is unit-testable without mounting
 * any React Native component.
 */
export function shouldPreventScreenCapture(
  blocked: boolean = SCREENSHOTS_BLOCKED,
): boolean {
  return blocked === true;
}

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

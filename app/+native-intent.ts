/**
 * COS-778 — deep links must not walk past the PIN lock.
 *
 * expo-router calls `redirectSystemPath` for every inbound URL: Universal
 * Links, custom-scheme links, and the link that launched a cold start. It is
 * the one place all of them converge, which is why the gate lives here rather
 * than in each screen.
 *
 * ─── WHAT IT IS DEFENDING ──────────────────────────────────────────────────
 *
 * The PIN "lock" is a `router.replace` onto the navigation stack, not a render
 * gate. So anything that changes the stack walks straight past it onto live
 * PHI. A deep link does exactly that: expo-router's linking handler consulted
 * no lock state at all, so `csh://…/biopsychosocial-plan` opened the plan on
 * top of the lock screen. That is bypass #3 of the four in SCRUM-721.
 *
 * ─── THE COLD-START CASE IS THE SUBTLE ONE ─────────────────────────────────
 *
 * `initial: true` means this URL launched the app, and at that moment the
 * in-memory lock flag is not yet authoritative — SecurityProvider resolves it
 * asynchronously in an effect. So the decision is made from STORAGE instead, by
 * awaiting isPinSetup(). `redirectSystemPath` may return a Promise, which is
 * what makes that possible.
 *
 *   PIN configured   → defer. security-store starts `isLocked` at TRUE
 *                      (stores/security-store.tsx:18) and app/index.tsx routes
 *                      to /(security)/lock-screen while it is, so the lock
 *                      screen WILL show and resumeAfterUnlock drains the queue.
 *   No PIN           → pass the link straight through. There is no lock to
 *                      bypass, and deferring would STRAND the link: nothing
 *                      would drain the queue (refreshSecurityState sets
 *                      isLocked=false, so no lock screen ever mounts) and it
 *                      would silently expire. Deep links would appear broken on
 *                      every cold start.
 *
 * That second branch is not a nicety — it is the difference between a fix and a
 * regression, and it is why this function is async.
 *
 * ─── WHY IT RETURNS null RATHER THAN A ROUTE ───────────────────────────────
 *
 * Returning null tells expo-router "do not navigate". Returning the lock-screen
 * path instead would push the lock screen ONTO whatever is already showing,
 * which on a warm app means a second lock entry on the stack and, on a cold
 * one, a lock screen the normal boot sequence then replaces. Deferring and
 * saying nothing is the honest instruction.
 */

import { isAppLocked } from '@/lib/lock-gate';
import { deferNavigation } from '@/lib/locked-nav-queue';
import { isPinSetup } from '@/services/pin-auth';

export async function redirectSystemPath({
  path,
  initial,
}: {
  path: string;
  initial: boolean;
}): Promise<string | null> {
  // Anything we cannot reason about is passed through untouched rather than
  // guessed at — a malformed URL is expo-router's problem to reject, not ours
  // to interpret.
  if (typeof path !== 'string' || !path.startsWith('/')) return path;

  if (initial) {
    // Read from storage, not the in-memory flag — see the cold-start note.
    let pinConfigured = false;
    try {
      pinConfigured = await isPinSetup();
    } catch {
      // Cannot tell. Assume a PIN exists: deferring a link is recoverable
      // (the user unlocks and lands on it), showing PHI is not.
      pinConfigured = true;
    }
    if (!pinConfigured) return path;
    deferNavigation(path);
    return null;
  }

  if (isAppLocked()) {
    deferNavigation(path);
    return null;
  }

  return path;
}

/**
 * COS-778 — one deferred inbound navigation, held while the app is locked.
 *
 * ─── WHY THIS EXISTS ───────────────────────────────────────────────────────
 *
 * Tapping a push notification called `router.push()` with no lock check at all
 * (hooks/use-notifications.ts). Because the "lock" is only a `router.replace`
 * onto the stack rather than a render gate, that push landed a PHI route ON TOP
 * of the lock screen. Of the four confirmed bypasses in SCRUM-721 this is the
 * one with NO precondition — it needs nothing but a notification arriving — so
 * it is the cheapest and most reliable of them.
 *
 * Simply dropping the navigation would fix the leak and create a support
 * ticket: "I tap the notification and nothing happens." So the intent is held
 * here and replayed once the user has actually authenticated.
 *
 * ─── FOUR DELIBERATE CHOICES ───────────────────────────────────────────────
 *
 * ONE ROUTE, NOT A LIST. Three notifications tapped during a lock should not
 * fan out into three navigations on unlock. The most recent tap is the user's
 * actual intent; earlier ones are superseded.
 *
 * IT EXPIRES. A route queued and then left overnight is not something anyone
 * still wants to land on. After the TTL the queue simply reports empty and the
 * unlock lands wherever it normally would.
 *
 * IN MEMORY, NEVER PERSISTED. Two reasons, and the second is the important
 * one. A navigation intent that survives an app kill would resurrect itself on
 * a cold launch days later, which is baffling. And a route string can carry
 * clinical context (`/Home/biopsychosocial-plan?focus=medications`) — keeping
 * it off disk means there is nothing to protect.
 *
 * CLEARED ON SIGN-OUT. Without that, signing out and back in as a different
 * account could navigate the new session to the previous user's screen. That
 * is a PHI leak wearing the costume of a convenience feature.
 */

/** How long a deferred tap stays interesting. */
const TTL_MS = 5 * 60 * 1000;

interface Deferred {
  route: string;
  at: number;
}

let deferred: Deferred | null = null;

/** Injectable clock so the TTL is testable without waiting five minutes. */
let now: () => number = () => Date.now();

/** Test seam. Passing no argument restores the real clock. */
export function __setNowForTests(fn?: () => number): void {
  now = fn ?? (() => Date.now());
}

/**
 * Remember where an inbound navigation wanted to go, to be replayed after
 * unlock. A second call replaces the first — latest intent wins.
 */
export function deferNavigation(route: string): void {
  if (typeof route !== 'string' || !route.startsWith('/')) return;
  deferred = { route, at: now() };
}

/**
 * Take the deferred route, if there is a live one. Consuming CLEARS it, so a
 * replay can never happen twice — an unlock that fails partway through must
 * not leave a route armed for the next one.
 */
export function consumeDeferredNavigation(): string | null {
  if (!deferred) return null;
  const { route, at } = deferred;
  deferred = null;
  if (now() - at > TTL_MS) return null;
  return route;
}

/** True when something is waiting AND still within its TTL. Does not consume. */
export function hasDeferredNavigation(): boolean {
  if (!deferred) return false;
  return now() - deferred.at <= TTL_MS;
}

/**
 * Drop anything queued. Call on sign-out — see the note above about not
 * navigating a new session to the previous user's screen.
 */
export function clearDeferredNavigation(): void {
  deferred = null;
}

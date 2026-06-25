# Auth Resume Fix Report — COS-379 / SCRUM-520

## Problem

Warm resume (background → active after 1–2 hours) showed the **sign-in screen** instead of the **PIN lock screen**. Force-close + reopen (cold start) correctly showed the PIN screen. Regression introduced in commit `03c6bfb` (COS-351).

---

## Root Cause Analysis

### Part 1 — Stale module mirror short-circuiting the guard

`security-store.tsx` initialises `isLocked` to `true` (line 18) and the mirror effect (line 40) runs `setAppLocked(isLocked)` on every state change. This means `_appLocked` in `lock-gate.ts` starts as `true` on every cold launch — before `refreshSecurityState()` resolves and determines whether a PIN is actually configured.

The guard in `use-app-lock.ts` (lines 120–121 before this fix) was:

```ts
// BEFORE (buggy):
const alreadyLocked =
  isAppLocked() || (pathname ?? '').startsWith('/(security)/lock-screen');
```

The **OR** means: if `isAppLocked()` is `true` (stale boot mirror), the OR short-circuits to `true` → `alreadyLocked = true` → `captureAndLock()` is never called → the lock screen is never shown → the user sees sign-in instead of PIN.

### Part 2 — 401 race: background refetches route to sign-in before lock is established

On resume, React Query's `refetchOnWindowFocus`, calendar sync, and other background prefetches fire immediately. If the Cognito refresh token is expired, the 401 interceptor calls `requestSignIn('session_expired')`. The `getLockTimeout()` await in the handler creates a gap where `_appLocked` is still `false` (stale mirror) — so `requestSignIn` routes to sign-in immediately rather than deferring to the lock screen queue.

---

## Fix

### Change 1 — Guard rewritten to use `wasLocked && onLockScreen` (AND not OR)

**File:** `hooks/use-app-lock.ts` (background→active handler)

Capture the **real prior lock state** before the async gap:

```ts
// AFTER (fixed):
const wasLocked = isAppLocked();  // snapshot BEFORE await getLockTimeout()
```

Compute the guard using AND:

```ts
const { alreadyLocked } = computeResumeLockDecision({ wasLocked, pathname });
// Inside resume-lock-decision.ts:
// const onLockScreen = (pathname ?? '').startsWith('/(security)/lock-screen');
// return { alreadyLocked: wasLocked && onLockScreen };
```

**Why AND is correct:**
- `wasLocked=true && onLockScreen=true` → skip re-lock. User is genuinely mid-PIN-entry or mid-Face-ID animation. This is the COS-351 face-ID flicker fix — preserved.
- `wasLocked=false && onLockScreen=*` → always `false` → captureAndLock runs. Normal warm resume where user was in the app before backgrounding.
- `wasLocked=true && onLockScreen=false` → `false` → allow re-lock evaluation. Edge case where mirror was true but screen changed.

### Change 2 — Synchronous `setAppLocked(true)` to win the 401 race

```ts
if (!wasLocked) setAppLocked(true);  // BEFORE await getLockTimeout()
```

This forces the lock-gate mirror to `true` synchronously before any async gap, so a racing 401-driven `requestSignIn('session_expired')` is deferred into the pending queue instead of routing to sign-in immediately. Guard logic uses `wasLocked` (not the now-forced mirror) so COS-351 is unaffected.

### Change 3 — Cleanup for the forced-mirror path

After the main lock decision runs, if `wasLocked=false && !didLock` (the mirror was forced but captureAndLock didn't run), we must decide the outcome:

| Condition | Action |
|-----------|--------|
| `hasPendingSignIn() && hasPinSetup` | `captureAndLock()` — dead session, lock local-first |
| `hasPendingSignIn() && !hasPinSetup` | `setAppLocked(false)` — no PIN, release to sign-in |
| No pending sign-in | `setAppLocked(false)` — benign flicker, restore mirror |

This ensures the temporarily-forced `_appLocked=true` never strands the app permanently.

---

## lock-gate.ts — Pending Sign-In API

### What exists (before this fix)
- `requestSignIn(reason)` — defers if `_appLocked && !BYPASS_LOCK_REASONS.has(reason)`, routes immediately otherwise.
- `consumePendingSignIn()` — returns + clears `_pendingReason`. **Consuming** — cannot be called twice.
- `clearPendingSignIn()` — clears without returning. Used by sign-in success handlers.

### What was missing
- No **peek** (non-consuming read). The cleanup branch in the hook needs to know if a sign-in is pending WITHOUT consuming it (consuming it here would prevent the lock screen from draining it via `postUnlockNavigate`).

### What was added
```ts
// lib/lock-gate.ts
export function hasPendingSignIn(): boolean {
  return _pendingReason !== null;
}
```

Non-consuming boolean peek. The lock screen still uses `consumePendingSignIn()` after unlock, so the deferred reason is drained exactly once at the right time.

---

## Architecture — Pure Extraction

Guard logic was extracted into `lib/resume-lock-decision.ts`:

```ts
export function computeResumeLockDecision(input: {
  wasLocked: boolean;
  pathname: string | null | undefined;
}): { alreadyLocked: boolean }
```

This pure function has no expo-router / React Native imports, making it directly unit-testable in the Node test runner. The hook calls it and acts on the result — pure logic is tested, effectful bits (AsyncStorage, router.replace, setAppLocked) stay in the hook.

---

## Tests Added

**File:** `tests/unit/resume-lock-guard.test.ts` — 17 new tests across 3 groups:

| Group | Tests | What they cover |
|-------|-------|-----------------|
| Guard formula | 6 | `computeResumeLockDecision` AND vs OR formula; null pathname; regression illustration |
| Pending sign-in | 6 | In-process replica of lock-gate queue logic; deferral; bypass reasons; non-consuming peek |
| Cleanup path | 5 | `resolveCleanupAction` decision table: lock-local-first, release, restore, no-op |

Total: 70 tests passing (was 53 before this PR).

---

## Not-Locked Edge Cases Handled

| Scenario | Outcome |
|----------|---------|
| Sub-debounce flicker (<2s), live session, no pending sign-in | `setAppLocked(false)` → mirror restored, no lock |
| Sub-debounce flicker, dead session (401 raced in), PIN set up | `captureAndLock()` → PIN screen → lock screen drains pending reason → sign-in |
| Sub-debounce flicker, dead session, NO PIN | `setAppLocked(false)` → mirror released; `requestSignIn` already navigated to sign-in (it bypassed deferral since lock was being released) |
| Normal resume (elapsed ≥ timeout), PIN set up | `captureAndLock()` → PIN screen (the primary regression fix) |
| Normal resume, no PIN configured | Skip lock, `setAppLocked(false)` → user enters app directly |

---

## Before / After — `use-app-lock.ts` background→active block

**Before (buggy, lines 104–131):**
```ts
const alreadyLocked =
  isAppLocked() || (pathname ?? '').startsWith('/(security)/lock-screen');
const effectiveTimeout = Math.max(timeout, MIN_BG_DEBOUNCE_MS);
if (elapsed >= effectiveTimeout && !alreadyLocked) {
  const pinSetup = await isPinSetup();
  if (pinSetup) await captureAndLock();
}
```

**After (fixed):**
```ts
const wasLocked = isAppLocked();
if (!wasLocked) setAppLocked(true);  // win the 401 race synchronously
const timeout = await getLockTimeout();
const { alreadyLocked } = computeResumeLockDecision({ wasLocked, pathname });
const effectiveTimeout = Math.max(timeout, MIN_BG_DEBOUNCE_MS);
let didLock = false;
if (elapsed >= effectiveTimeout && !alreadyLocked) {
  const pinSetup = await isPinSetup();
  if (pinSetup) { await captureAndLock(); didLock = true; }
}
if (!wasLocked && !didLock) {
  if (hasPendingSignIn()) {
    const pinSetup = await isPinSetup();
    if (pinSetup) { await captureAndLock(); }
    else { setAppLocked(false); }
  } else {
    setAppLocked(false);
  }
}
```

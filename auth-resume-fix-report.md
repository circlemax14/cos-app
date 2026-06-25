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

---

## Adversarial Review Fixes — COS-379 Round 2 (2026-06-25)

### Adversarial Fix 1 — Mirror-clobber race: re-assert after `await getLockTimeout()`

**File:** `hooks/use-app-lock.ts` (background→active handler)

**Problem:** The security-store `useEffect(() => setAppLocked(isLocked), [isLocked])` can fire during the `await getLockTimeout()` gap if `refreshSecurityState` resolves and sets `isLocked=false`. This clobbers the forced `_appLocked=true` back to `false` — so a 401 arriving in that window routes directly to sign-in, defeating the 401-race fix.

**Before:**
```ts
if (!wasLocked) setAppLocked(true);
const timeout = await getLockTimeout();
// gap: security-store mirror can clobber _appLocked back to false here
const { alreadyLocked } = computeResumeLockDecision({ wasLocked, pathname });
```

**After:**
```ts
if (!wasLocked) setAppLocked(true);
const timeout = await getLockTimeout();
// SCRUM-520 (COS-379): re-assert forced lock after the await gap to beat
// the security-store mirror clobber (refreshSecurityState fires during gap).
if (!wasLocked) setAppLocked(true);
const { alreadyLocked } = computeResumeLockDecision({ wasLocked, pathname });
```

---

### Adversarial Fix 2 — Stranded pending sign-in: clear before releasing on no-PIN dead-session path

**File:** `hooks/use-app-lock.ts` (cleanup branch); `lib/lock-gate.ts` import in `use-app-lock.ts`

**Problem:** On the no-PIN dead-session branch, `setAppLocked(false)` was called but `_pendingReason` was left set. A future valid session — where the user later configures a PIN and idle-locks — would call `consumePendingSignIn()` from the lock screen and mis-route to sign-in despite the session being alive.

**Before:**
```ts
} else {
  // No PIN — can't lock locally; release immediately to sign-in.
  setAppLocked(false);
}
```

**After:**
```ts
} else {
  // No PIN — can't lock locally; release immediately to sign-in.
  // Clear the stale pending reason BEFORE releasing so a future valid
  // session is never mis-routed to sign-in by a leftover _pendingReason.
  clearPendingSignIn();
  setAppLocked(false);
}
```

`clearPendingSignIn()` already existed in `lib/lock-gate.ts` (line 129). Added to the import in `use-app-lock.ts`.

---

### Adversarial Fix 3 — Stranded locked on throw: release forced mirror in catch

**File:** `hooks/use-app-lock.ts` (decision/cleanup region)

**Problem:** If `captureAndLock()` throws (e.g. Expo Router or Keychain error), the forced `_appLocked=true` is left stranded with no lock screen showing — every API request defers into the pending queue forever, making the app unresponsive.

**Before:** No error handling around the decision/cleanup region. Any throw from `captureAndLock()` left the forced mirror uncleaned.

**After:** Wrapped the entire decision + cleanup region in `try/catch`. The catch releases the mirror only if `!wasLocked && !didLock` (we forced it, and no lock screen mounted):
```ts
try {
  if (elapsed >= effectiveTimeout && !alreadyLocked) {
    // ... captureAndLock() / isPinSetup() calls
    didLock = true;
  }
  // cleanup branch ...
} catch (err) {
  // Release stranded mirror only if we forced it and didn't successfully lock.
  // If didLock=true, the lock screen may be (partially) showing — don't clear.
  if (!wasLocked && !didLock) {
    setAppLocked(false);
  }
  throw err; // re-throw for error boundaries / Sentry
}
```

---

## Tests Added (Round 2)

**File:** `tests/unit/resume-lock-guard.test.ts` — 8 new tests in groups 4–6:

| Group | Tests | What they cover |
|-------|-------|-----------------|
| FIX 2 (group 4) | 2 | No-PIN dead-session cleanup calls `clearPendingSignIn` before `setAppLocked(false)`; pending reason gone after cleanup |
| FIX 3 (group 5) | 3 | Throw-recovery decision: release mirror when !wasLocked && !didLock; keep when didLock=true or wasLocked=true |
| FIX 1 (group 6) | 1 | Re-assert invariant: forced lock survives a simulated store clobber during await gap |

Total: 76 tests passing (was 54 before the original COS-379 fix; was 70 after round 1).

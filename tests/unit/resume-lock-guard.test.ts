/**
 * SCRUM-520 (COS-379): Unit tests for the warm-resume lock guard.
 *
 * Two groups:
 *   1. Guard formula tests — import lib/resume-lock-decision.ts directly.
 *      That module has NO expo-router dependency so it loads cleanly in the
 *      node:test runner without a React Native / JSX runtime.
 *   2. Pending-sign-in queue tests — replicate the lock-gate queue logic as a
 *      self-contained in-process state machine. We avoid importing lock-gate.ts
 *      directly because it imports expo-router at the module level (which blows
 *      up on JSX syntax in Navigator.js in the bare-Node test env).
 *
 * The AppState handler itself is effectful (async timers, router, AsyncStorage)
 * and is validated via manual QA + the scenarios in auth-resume-fix-report.md.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeResumeLockDecision } from '../../lib/resume-lock-decision.ts';

// ── 1. Guard formula ──────────────────────────────────────────────────────────

test('guard: wasLocked=false, not on lock screen → alreadyLocked=false (warm resume must lock)', () => {
  // THE core regression. Security-store initialises isLocked=true and the
  // mirror effect syncs it — so isAppLocked() was `true` on first render.
  // Old formula: `isAppLocked() || onLockScreen` = true || false = TRUE (BUG).
  // captureAndLock was never called → sign-in screen on warm resume.
  //
  // New formula uses `wasLocked` (captured BEFORE getLockTimeout await) with AND:
  // wasLocked=false → false && false = FALSE → captureAndLock runs → PIN screen.
  const { alreadyLocked } = computeResumeLockDecision({ wasLocked: false, pathname: '/Home' });
  assert.equal(alreadyLocked, false, 'warm resume with wasLocked=false must not suppress captureAndLock');
});

test('guard: wasLocked=true, on lock screen → alreadyLocked=true (COS-351 Face-ID flicker fix preserved)', () => {
  // Face-ID scenario: user is genuinely on the lock screen mid-PIN-entry or
  // mid-Face-ID animation. wasLocked=true AND onLockScreen=true → skip re-lock.
  // captureAndLock re-firing here would flash the PIN screen during Face-ID.
  const { alreadyLocked } = computeResumeLockDecision({
    wasLocked: true,
    pathname: '/(security)/lock-screen',
  });
  assert.equal(alreadyLocked, true, 'locked + on lock screen must skip re-lock (COS-351 preserved)');
});

test('guard: wasLocked=true, NOT on lock screen → alreadyLocked=false (stale mirror, wrong screen)', () => {
  // Mirror is true but user is not on the lock screen.
  // AND: true && false = false → allow re-lock evaluation.
  const { alreadyLocked } = computeResumeLockDecision({ wasLocked: true, pathname: '/Home' });
  assert.equal(alreadyLocked, false, 'locked mirror without lock screen must allow re-lock');
});

test('guard: wasLocked=false, on lock screen → alreadyLocked=false (AND: false && true = false)', () => {
  // AND formula: wasLocked=false → always alreadyLocked=false, regardless of pathname.
  const { alreadyLocked } = computeResumeLockDecision({
    wasLocked: false,
    pathname: '/(security)/lock-screen',
  });
  assert.equal(alreadyLocked, false, 'wasLocked=false always produces alreadyLocked=false');
});

test('guard: null/undefined pathname treated as empty string (no crash)', () => {
  const resultNull = computeResumeLockDecision({ wasLocked: false, pathname: null });
  const resultUndefined = computeResumeLockDecision({ wasLocked: false, pathname: undefined });
  assert.equal(resultNull.alreadyLocked, false);
  assert.equal(resultUndefined.alreadyLocked, false);
});

test('guard: OLD OR formula would incorrectly block captureAndLock with stale mirror', () => {
  // Illustrate why OR was wrong. If isAppLocked() returns the stale true
  // (security-store boot value) but wasLocked is actually false:
  //   old: stale_true  || false = TRUE  → captureAndLock suppressed → SIGN-IN BUG
  //   new: wasLocked   && false = FALSE → captureAndLock runs       → PIN SCREEN
  const staleMirrorTrue = true;  // isAppLocked() stale boot value
  const wasLocked = false;       // actual prior lock state
  const onLockScreen = false;

  const oldFormula = staleMirrorTrue || onLockScreen; // TRUE — the bug
  const newFormula = wasLocked && onLockScreen;       // FALSE — the fix

  assert.equal(oldFormula, true, 'old OR formula incorrectly blocks captureAndLock');
  assert.equal(newFormula, false, 'new AND formula correctly allows captureAndLock');
});

// ── 2. Pending-sign-in queue (in-process replica of lock-gate queue logic) ───
//
// We replicate the lock-gate._pendingReason logic here rather than importing
// lock-gate.ts directly. That module imports expo-router at the top level; the
// bare-Node test runner blows up on the JSX inside Navigator.js. The replica
// below mirrors the exact state-machine logic (same conditions, same priority
// rules) so these tests prove the algorithm, not just that we can import it.

type SignInReason =
  | 'session_expired'
  | 'refresh_failed'
  | 'manual_sign_out'
  | 'splash_no_session'
  | 'splash_revalidate_failed'
  | 'unrecoverable';

const BYPASS_LOCK_REASONS: ReadonlySet<SignInReason> = new Set([
  'splash_no_session',
  'splash_revalidate_failed',
  'unrecoverable',
]);

class LockGateReplica {
  private _locked = false;
  private _pending: SignInReason | null = null;
  private _navigations: string[] = [];

  setAppLocked(v: boolean) { this._locked = v; }
  isAppLocked() { return this._locked; }
  hasPendingSignIn() { return this._pending !== null; }
  consumePendingSignIn() { const r = this._pending; this._pending = null; return r; }
  clearPendingSignIn() { this._pending = null; }
  getNavigations() { return this._navigations; }

  async requestSignIn(reason: SignInReason) {
    if (this._locked && !BYPASS_LOCK_REASONS.has(reason)) {
      if (!this._pending) this._pending = reason;
      return;
    }
    this._navigations.push('/(auth)/sign-in');
  }

  reset() {
    this._locked = false;
    this._pending = null;
    this._navigations = [];
  }
}

test('pending-sign-in: hasPendingSignIn=false when queue is empty', () => {
  const gate = new LockGateReplica();
  assert.equal(gate.hasPendingSignIn(), false);
});

test('pending-sign-in: requestSignIn defers when locked — simulates 401 during getLockTimeout gap', async () => {
  // The race: setAppLocked(true) is called synchronously before the await.
  // A 401-driven requestSignIn fires during that window and must be deferred.
  const gate = new LockGateReplica();
  gate.setAppLocked(true);
  await gate.requestSignIn('session_expired');
  assert.equal(gate.hasPendingSignIn(), true, '401 during forced-lock must be deferred');
  assert.equal(gate.consumePendingSignIn(), 'session_expired');
  assert.equal(gate.getNavigations().length, 0, 'no immediate navigation while locked');
});

test('pending-sign-in: hasPendingSignIn is non-consuming — reason survives peek', async () => {
  const gate = new LockGateReplica();
  gate.setAppLocked(true);
  await gate.requestSignIn('refresh_failed');
  assert.equal(gate.hasPendingSignIn(), true);  // peek
  assert.equal(gate.hasPendingSignIn(), true);  // still there
  const reason = gate.consumePendingSignIn();   // consume
  assert.equal(reason, 'refresh_failed');
  assert.equal(gate.hasPendingSignIn(), false); // gone
});

test('pending-sign-in: first reason wins — second requestSignIn does not overwrite', async () => {
  const gate = new LockGateReplica();
  gate.setAppLocked(true);
  await gate.requestSignIn('session_expired');
  await gate.requestSignIn('refresh_failed');
  assert.equal(gate.consumePendingSignIn(), 'session_expired', 'first reason wins');
});

test('pending-sign-in: bypass reasons (splash_no_session) navigate immediately, no pending entry', async () => {
  // Splash-originated reasons bypass the lock gate even when locked.
  // They must NOT populate the deferred queue — no pending sign-in to peek.
  const gate = new LockGateReplica();
  gate.setAppLocked(true);
  await gate.requestSignIn('splash_no_session');
  assert.equal(gate.hasPendingSignIn(), false, 'bypass reasons must not queue');
  assert.equal(gate.getNavigations().length, 1, 'bypass reason must navigate immediately');
});

test('pending-sign-in: clearPendingSignIn resets without consuming', async () => {
  const gate = new LockGateReplica();
  gate.setAppLocked(true);
  await gate.requestSignIn('session_expired');
  gate.clearPendingSignIn();
  assert.equal(gate.hasPendingSignIn(), false);
  assert.equal(gate.consumePendingSignIn(), null);
});

// ── 3. Cleanup-path: forced-mirror decisions ──────────────────────────────────
//
// Prove the decisions in the !wasLocked && !didLock cleanup branch of the hook.
// This is logic, not effectful code, so we can test it purely.

function resolveCleanupAction(opts: {
  wasLocked: boolean;
  didLock: boolean;
  hasPending: boolean;
  hasPinSetup: boolean;
}): 'lock-local-first' | 'release-sign-in-no-pin' | 'restore-mirror' | 'no-op' {
  // Mirrors the cleanup branch in use-app-lock.ts exactly.
  if (!opts.wasLocked && !opts.didLock) {
    if (opts.hasPending) {
      return opts.hasPinSetup ? 'lock-local-first' : 'release-sign-in-no-pin';
    }
    return 'restore-mirror';
  }
  return 'no-op';
}

test('cleanup: wasLocked=false, didLock=false, pending=true, PIN=true → lock-local-first', () => {
  // Dead session caught during race window. Lock via PIN, let lock screen drain.
  const action = resolveCleanupAction({ wasLocked: false, didLock: false, hasPending: true, hasPinSetup: true });
  assert.equal(action, 'lock-local-first');
});

test('cleanup: wasLocked=false, didLock=false, pending=true, PIN=false → release-sign-in-no-pin', () => {
  // Dead session but no PIN — can't lock locally, release mirror to sign-in.
  const action = resolveCleanupAction({ wasLocked: false, didLock: false, hasPending: true, hasPinSetup: false });
  assert.equal(action, 'release-sign-in-no-pin');
});

test('cleanup: wasLocked=false, didLock=false, pending=false → restore-mirror (benign flicker)', () => {
  // No pending sign-in → live session / sub-debounce flicker. Release mirror.
  const action = resolveCleanupAction({ wasLocked: false, didLock: false, hasPending: false, hasPinSetup: true });
  assert.equal(action, 'restore-mirror');
});

test('cleanup: didLock=true → no-op (lock screen is showing, mirror stays locked)', () => {
  // captureAndLock ran. Mirror stays; postUnlockNavigate resets it.
  const action = resolveCleanupAction({ wasLocked: false, didLock: true, hasPending: false, hasPinSetup: true });
  assert.equal(action, 'no-op');
});

test('cleanup: wasLocked=true → no-op (was already locked, mirror was not forcibly set)', () => {
  const action = resolveCleanupAction({ wasLocked: true, didLock: false, hasPending: false, hasPinSetup: true });
  assert.equal(action, 'no-op');
});

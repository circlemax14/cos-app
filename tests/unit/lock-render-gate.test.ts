/**
 * COS-724 — the PIN lock gate's decision table.
 *
 * Two failure modes matter here and they pull in opposite directions:
 *
 *   FAIL OPEN  → PHI on screen while locked. Four confirmed ways in (swipe-back,
 *                Android back, notification tap, deep link).
 *   FAIL SHUT  → the user is wedged. This app has already shipped that bug once
 *                (COS-348: isLocked=true + no session = splash spinner forever,
 *                recoverable only by "clear app data").
 *
 * Most of these tests exist for the second one. It is easy to write a gate that
 * is secure and unusable.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeLockGate, type LockGateInput } from '../../lib/lock-render-gate.ts';

const LOCKED: Omit<LockGateInput, 'segments'> = {
  isReady: true,
  isPinConfigured: true,
  isLocked: true,
};

const gate = (segments: string[], over: Partial<LockGateInput> = {}) =>
  computeLockGate({ ...LOCKED, segments, ...over });

// ── The feature is inert unless all three preconditions hold ────────────────

test('no PIN configured → never gated, whatever the route', () => {
  for (const seg of [['Home'], ['Home', 'plan'], ['modal'], []]) {
    assert.deepEqual(gate(seg, { isPinConfigured: false }), { shield: false, trapBack: false }, seg.join('/'));
  }
});

test('not locked → never gated', () => {
  assert.deepEqual(gate(['Home', 'plan'], { isLocked: false }), { shield: false, trapBack: false });
});

test('security state not resolved yet → decide nothing', () => {
  // SecurityProvider initialises isLocked=true before reading Keychain. Acting on
  // that would gate every cold launch for users who have no PIN at all.
  assert.deepEqual(gate(['Home'], { isReady: false }), { shield: false, trapBack: false });
});

// ── THE POINT: PHI routes are covered ──────────────────────────────────────

test('THE POINT: every PHI surface is shielded when locked', () => {
  const phi = [
    ['Home'],
    ['Home', 'plan'],
    ['Home', 'medications'],
    ['Home', 'reports'],
    ['Home', 'health-plan'],
    ['Home', 'readiness'],
    ['Home', 'biopsychosocial-plan'],
    ['modal'], // the agency / care-circle picker
    ['agency-detail'],
    ['appointments-modal'],
    ['calendar-event-detail'],
    ['calendar-event-editor'],
    ['jenny-schedule'],
    ['(care-manager-detail)'],
    ['(doctor-detail)'],
  ];
  for (const seg of phi) {
    assert.equal(gate(seg).shield, true, `${seg.join('/')} must be shielded`);
  }
});

test('default-deny: a route group nobody has thought of yet is gated', () => {
  // The allowlist names groups, so a screen added next month is protected with
  // no code change. This is the property that stops this bug recurring.
  assert.deepEqual(gate(['some-future-feature']), { shield: true, trapBack: true });
  assert.deepEqual(gate(['(billing)', 'invoices']), { shield: true, trapBack: true });
});

// ── The wedge cases. These are why COS-348 happened. ───────────────────────

test('COS-348: the splash gate is never shielded', () => {
  // segments === [] is app/index.tsx, which owns the offline "Retry" card. Shield
  // it and the user cannot tap Retry — spinner forever, "clear app data" only.
  assert.deepEqual(gate([]), { shield: false, trapBack: false });
});

test('COS-348: a locked user with a dead session can still reach and use sign-in', () => {
  // The explicit requirement: isLocked=true + no session must still reach sign-in.
  for (const seg of [['(auth)'], ['(auth)', 'sign-in'], ['(auth)', 'sign-up'], ['(auth)', 'verify-email']]) {
    assert.deepEqual(gate(seg), { shield: false, trapBack: false }, seg.join('/'));
  }
});

test('the PIN pad itself is never shielded — that would be a perfect lockout', () => {
  for (const seg of [['(security)', 'lock-screen'], ['(security)', 'setup-pin'], ['(security)', 'confirm-pin'], ['(security)', 'enable-biometric']]) {
    assert.equal(gate(seg).shield, false, seg.join('/'));
  }
});

test('a first-run user is never shielded or trapped mid-onboarding', () => {
  for (const seg of [['(onboarding)'], ['(onboarding)', 'permissions'], ['(onboarding)', 'welcome']]) {
    assert.deepEqual(gate(seg), { shield: false, trapBack: false }, seg.join('/'));
  }
});

test('every route that traps back has an escape that clears the trap', () => {
  // Trapping back is only safe because (auth) is reachable from every trapped
  // surface: the lock screen has "Forgot PIN?" and a 5-attempt bailout, both of
  // which route to (auth) — where trapBack is false. Assert the escape exists.
  assert.equal(gate(['(security)', 'lock-screen']).trapBack, true, 'lock screen traps back');
  assert.equal(gate(['(auth)', 'sign-in']).trapBack, false, 'and (auth) releases it');
});

// ── The asymmetry that IS the Android fix ──────────────────────────────────

test('THE ASYMMETRY: (security) is shield-exempt but NOT back-exempt', () => {
  // If back were allowed on the lock screen, react-navigation's useBackButton
  // bubbles GO_BACK past the single-route (security) stack to the ROOT stack and
  // pops the lock screen off, revealing whatever was underneath. That is the
  // whole android-hardware-back vector.
  const d = gate(['(security)', 'lock-screen']);
  assert.deepEqual(d, { shield: false, trapBack: true });
});

test('the two allowlists genuinely differ — a refactor that merges them is a bug', () => {
  // Cheap canary. If someone "simplifies" the two sets into one, this fails.
  const sec = gate(['(security)', 'lock-screen']);
  assert.notEqual(sec.shield, sec.trapBack, '(security) must be shield:false, trapBack:true');
});

// ── Shape ──────────────────────────────────────────────────────────────────

test('the decision is a plain two-boolean record, always', () => {
  for (const seg of [[], ['Home'], ['(auth)'], ['(security)'], ['x']]) {
    const d = gate(seg);
    assert.deepEqual(Object.keys(d).sort(), ['shield', 'trapBack']);
    assert.equal(typeof d.shield, 'boolean');
    assert.equal(typeof d.trapBack, 'boolean');
  }
});

test('is pure — same input, same output, and the input is not mutated', () => {
  const segments = ['Home', 'plan'];
  const frozen = Object.freeze({ ...LOCKED, segments: Object.freeze([...segments]) as string[] });
  const a = computeLockGate(frozen);
  const b = computeLockGate(frozen);
  assert.deepEqual(a, b);
  assert.deepEqual(segments, ['Home', 'plan']);
});

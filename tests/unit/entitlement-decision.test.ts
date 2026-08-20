/**
 * COS-727 — the gate decision table.
 *
 * Two failure modes, pulling opposite ways:
 *
 *   HIDE WRONGLY  → a patient loses their own medication list because a request
 *                   timed out. Looks identical to a correct deny, so it is never
 *                   reported as a bug. Clinically unacceptable.
 *   SHOW WRONGLY  → a non-payer briefly sees a paid feature. Costs pennies.
 *
 * Clinical gating resolves that by never hiding on uncertainty. Billing cannot
 * use the same rule or the paywall is advisory — force-quit offline and
 * everything is free, because the profile query is memory-only.
 *
 * The paid gate therefore REMEMBERS rather than failing open or closed. These
 * tests pin every branch of that table, and in particular the cases where the
 * obvious answer is the wrong one.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  decideEntitlement,
  isPersistableEntitlements,
  type GateMode,
} from '../../lib/entitlement-decision.ts';

const KEY = 'plan.current-conditions';
const GRANTS = [KEY, 'plan.view'];
const OMITS = ['plan.view'];

const at = (over: Partial<Parameters<typeof decideEntitlement>[0]>) =>
  decideEntitlement({
    mode: 'paid',
    key: KEY,
    live: null,
    cached: null,
    isLoading: false,
    isError: false,
    ...over,
  });

// ── Authoritative answers are identical in both modes ──────────────────────

for (const mode of ['clinical', 'paid'] as GateMode[]) {
  test(`${mode}: a live array granting the key allows it`, () => {
    const d = at({ mode, live: GRANTS });
    assert.deepEqual(d, { allowed: true, source: 'live', provisional: false });
  });

  test(`${mode}: a live array OMITTING the key denies it`, () => {
    // The only case where anything is ever hidden.
    const d = at({ mode, live: OMITS });
    assert.deepEqual(d, { allowed: false, source: 'live', provisional: false });
  });

  test(`${mode}: the wildcard grants everything`, () => {
    // Kill switch off, or SUPER_ADMIN.
    const d = at({ mode, live: ['*'] });
    assert.deepEqual(d, { allowed: true, source: 'wildcard', provisional: false });
  });
}

// ── THE CLINICAL RULE ──────────────────────────────────────────────────────

test('CLINICAL: never hides while loading', () => {
  assert.equal(at({ mode: 'clinical', isLoading: true }).allowed, true);
});

test('CLINICAL: never hides on error', () => {
  assert.equal(at({ mode: 'clinical', isError: true }).allowed, true);
});

test('CLINICAL: never hides when entitlements are absent entirely', () => {
  assert.equal(at({ mode: 'clinical', live: null }).allowed, true);
});

test('CLINICAL: ignores the cache — it has no reason to consult it', () => {
  // Even a cached DENY must not hide a clinical surface.
  const d = at({ mode: 'clinical', cached: OMITS, isError: true });
  assert.deepEqual(d, { allowed: true, source: 'unknown', provisional: true });
});

// ── THE PAID RULE: remember, don't guess ───────────────────────────────────

test('THE POINT: paid falls back to what the device last knew', () => {
  // A subscriber on a plane keeps what they paid for.
  const d = at({ mode: 'paid', live: null, cached: GRANTS, isError: true });
  assert.deepEqual(d, { allowed: true, source: 'cached', provisional: true });
});

test('THE POINT: a cached DENY still denies when offline', () => {
  // This is the half that makes it a paywall rather than a suggestion. Without
  // it, force-quit + airplane mode unlocks every paid feature.
  const d = at({ mode: 'paid', live: null, cached: OMITS, isError: true });
  assert.deepEqual(d, { allowed: false, source: 'cached', provisional: true });
});

test('paid: a live answer always beats the cache', () => {
  // Stale grants must not survive a downgrade.
  const d = at({ mode: 'paid', live: OMITS, cached: GRANTS });
  assert.deepEqual(d, { allowed: false, source: 'live', provisional: false });
});

test('paid: a cached wildcard is honoured', () => {
  assert.deepEqual(at({ mode: 'paid', cached: ['*'], isError: true }), {
    allowed: true,
    source: 'wildcard',
    provisional: true,
  });
});

test('paid with nothing known at all opens, deliberately', () => {
  // A device that has never loaded a profile is a fresh install with no
  // network. Denying would also deny a brand-new subscriber — the more
  // expensive mistake. Marked provisional so a caller can prompt instead.
  const d = at({ mode: 'paid', live: null, cached: null, isLoading: true });
  assert.deepEqual(d, { allowed: true, source: 'unknown', provisional: true });
});

// ── EMPTY ARRAY IS A PROVISIONING GAP, NOT A DENY ──────────────────────────

for (const mode of ['clinical', 'paid'] as GateMode[]) {
  test(`${mode}: an EMPTY live array opens and is flagged unprovisioned`, () => {
    // The resolver returns [] when no plan is assigned. That is our bug, not a
    // statement about the patient. Paywalling them for it would be indefensible.
    const d = at({ mode, live: [] });
    assert.deepEqual(d, { allowed: true, source: 'unprovisioned', provisional: true });
  });
}

test('an empty array must never be persisted as last-known state', () => {
  // Caching a provisioning gap turns a transient server bug into a durable
  // client one — the cache would then confidently deny long after the fix.
  assert.equal(isPersistableEntitlements([]), false);
  assert.equal(isPersistableEntitlements(null), false);
  assert.equal(isPersistableEntitlements(undefined), false);
  assert.equal(isPersistableEntitlements(GRANTS), true);
});

// ── Shape + purity ─────────────────────────────────────────────────────────

test('every branch returns the full decision shape', () => {
  const cases = [
    { live: GRANTS }, { live: OMITS }, { live: [] }, { live: ['*'] },
    { isLoading: true }, { isError: true },
    { cached: GRANTS, isError: true }, { cached: OMITS, isError: true },
  ];
  for (const mode of ['clinical', 'paid'] as GateMode[]) {
    for (const c of cases) {
      const d = at({ mode, ...c });
      assert.deepEqual(Object.keys(d).sort(), ['allowed', 'provisional', 'source']);
      assert.equal(typeof d.allowed, 'boolean');
      assert.equal(typeof d.provisional, 'boolean');
    }
  }
});

test('is pure — does not mutate its inputs', () => {
  const live = Object.freeze([...GRANTS]);
  const cached = Object.freeze([...OMITS]);
  at({ mode: 'paid', live, cached });
  assert.deepEqual(live, GRANTS);
  assert.deepEqual(cached, OMITS);
});

test('an authoritative answer is never marked provisional', () => {
  // `provisional` is what a caller keys an upgrade prompt off. If a real deny
  // were marked provisional, the prompt would fire on legitimate denials.
  for (const mode of ['clinical', 'paid'] as GateMode[]) {
    assert.equal(at({ mode, live: GRANTS }).provisional, false);
    assert.equal(at({ mode, live: OMITS }).provisional, false);
  }
});

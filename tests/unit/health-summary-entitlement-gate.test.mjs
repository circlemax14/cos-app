// tests/unit/health-summary-entitlement-gate.test.mjs — SCRUM-715 (2026-08-18)
//
// Source-drift trip wires for the Health Summary's per-section entitlement
// gates.
//
// BACKGROUND
//   The Health Summary screen (app/Home/plan.tsx) renders nine sections. Each
//   is now gated on its own catalog key so the dashboard can disable, say,
//   biopsychosocial history without touching the rest.
//
//   The gate is `useCanRender` (hooks/use-entitlement.ts), which is FAIL-OPEN
//   by construction: false only on an affirmative deny, never while loading,
//   on a failed /v1/auth/me, or when entitlements are absent.
//
// WHAT THIS SUITE DEFENDS, AND WHY EACH ONE MATTERS
//
//   1. FAIL-OPEN CANNOT SILENTLY BECOME FAIL-CLOSED. If someone "simplifies"
//      useCanRender into `ents.includes(key)`, every patient loses their own
//      medications, labs and conditions the moment a request is slow — and it
//      is indistinguishable from a correct deny, so nobody would report it.
//
//   2. EVERY SECTION STAYS GATED. A new section added without a gate is
//      invisible to the dashboard; a gate deleted in a merge silently
//      un-gates a section. Both are quiet.
//
//   3. THE VITALS OBSERVER STAYS TIED TO ITS CARD.
//      useVitalsRedFlagNotifications fires local push notifications and POSTs
//      to a PHI-adjacent endpoint while rendering nothing. If it stops taking
//      the gate, a patient who cannot see the vitals card keeps getting
//      "recheck your blood pressure" alerts about it.
//
//   4. NO NEW RENDER PRIMITIVES. This screen is inside the iOS-26 cold-mount
//      envelope. The change must be strictly subtractive — boolean-AND
//      conditionals only, no new react-native imports.
//
// STYLE: reads source as TEXT. No `@/` alias imports — `node --test` has no
// module resolver for them (see feedback_node_test_no_alias_imports).

import { decideEntitlement } from '../../lib/entitlement-decision.ts'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

const PLAN = read('app/Home/plan.tsx');
const GATE = read('hooks/use-entitlement.ts');
const VITALS = read('hooks/use-vitals-red-flag-notifications.ts');

/** Every section of the Health Summary, and the key that gates it. */
const SECTIONS = [
  ['IntakeCtaCard', 'plan.intake-cta', 'canIntakeCta'],
  ['BpsHistorySection', 'plan.bps-history', 'canBpsHistory'],
  ['CurrentConditionsSection', 'plan.current-conditions', 'canConditions'],
  ['MedicationsByConditionSection', 'plan.medications-by-condition', 'canMedications'],
  ['LabsByConditionSection', 'plan.labs-by-condition', 'canLabs'],
  ['VitalsRedFlagSection', 'plan.vitals-red-flag', 'canVitals'],
  ['TreatmentsSupportsSection', 'plan.treatments-supports', 'canTreatments'],
  ['RecommendationsSection', 'plan.recommendations', 'canRecommendations'],
  ['ShareSummarySection', 'plan.share-summary', 'canShare'],
];

// ── 1. the gate never hides on nothing-known ──────────────────────────────

test('useCanRender delegates to the tested decision module', () => {
  // COS-727 deliberately rewrote this gate. It used to be
  // `useEntitlementDecision(dottedKey) !== 'denied'` — fail-open on every
  // uncertain state — which made the paywall advisory: force-quit offline and
  // everything was free, because the profile query is memory-only.
  //
  // The rule now REMEMBERS (live > cached > open) and lives in
  // lib/entitlement-decision.ts, where all 21 branches are tested directly.
  // What this file still guards is that the gate has not grown its own inline
  // copy of that logic, which could drift from the tested one.
  assert.match(
    GATE,
    /export function useCanRender\(dottedKey: string\): boolean \{\s*return useEntitlement\(dottedKey\)\.allowed;\s*\}/,
    'useCanRender must delegate to useEntitlement, not re-implement the decision',
  );
  assert.match(GATE, /decideEntitlement\(/, 'the decision must come from the pure, tested module');
});

test('the gate still opens when nothing is known at all', () => {
  // The clinical property that must survive the rewrite: a device with no live
  // answer AND no cache must render, not hide. Asserted against the real
  // function rather than its source.
  assert.equal(
    decideEntitlement({
      mode: 'standard', key: 'plan.view',
      live: null, cached: null, isLoading: true, isError: false,
    }).allowed,
    true,
    'a slow or failed /v1/auth/me with no cache must never hide health data',
  );
  assert.equal(
    decideEntitlement({
      mode: 'standard', key: 'plan.view',
      live: null, cached: null, isLoading: false, isError: true,
    }).allowed,
    true,
  );
});

test('an entitled patient keeps their data when the request fails', () => {
  // The reason one rule can serve both billing and clinical safety: the cache
  // says granted, so a timeout does not hide what they actually have.
  assert.equal(
    decideEntitlement({
      mode: 'standard', key: 'plan.view',
      live: null, cached: ['plan.view'], isLoading: false, isError: true,
    }).allowed,
    true,
  );
});

test('an absent or empty entitlements array is not a deny', () => {
  // The resolver returns [] for a patient with no plan assignment. That is a
  // provisioning gap, not an entitlement decision — treating it as a deny
  // would blank the app for anyone who slipped through onboarding.
  assert.match(GATE, /if\s*\(!ents\)\s*return\s*'unknown'/);
  assert.match(GATE, /if\s*\(ents\.length\s*===\s*0\)\s*return\s*'unknown'/);
});

test('the wildcard still grants everything', () => {
  // '*' is the resolver's kill-switch / SUPER_ADMIN sentinel. Losing this
  // would gate the entire app the moment the kill switch is OFF.
  assert.match(GATE, /ents\.includes\('\*'\)/);
});

// ── 2. every section is gated ──────────────────────────────────────────────

for (const [component, key, varName] of SECTIONS) {
  test(`${component} is gated on ${key}`, () => {
    assert.ok(
      PLAN.includes(`useCanRender('${key}')`),
      `plan.tsx must call useCanRender('${key}')`,
    );
    assert.ok(
      PLAN.includes(`{${varName} && <${component} />}`),
      `plan.tsx must render <${component} /> behind ${varName}`,
    );
  });
}

test('the gates are declared above every early return', () => {
  // They are hooks, and this component returns early on both loading and
  // error. A gate declared below either return is a rules-of-hooks crash.
  const firstGate = PLAN.indexOf('useCanRender(');
  const firstEarlyReturn = PLAN.indexOf('if (isLoading)');
  assert.ok(firstGate > -1 && firstEarlyReturn > -1);
  assert.ok(
    firstGate < firstEarlyReturn,
    'every useCanRender call must precede the first early return',
  );
});

test('the error-branch IntakeCtaCard is gated too', () => {
  // plan.tsx renders IntakeCtaCard twice — once on the happy path, once on
  // the error screen. Gating only one leaves the card reachable by taking the
  // app offline.
  const occurrences = PLAN.split('<IntakeCtaCard />').length - 1;
  const gated = PLAN.split('{canIntakeCta && <IntakeCtaCard />}').length - 1;
  assert.equal(gated, occurrences, 'every <IntakeCtaCard /> must be gated');
});

// ── 3. the invisible observer follows its card ─────────────────────────────

test('the vitals observer takes the same gate as its card', () => {
  assert.ok(
    PLAN.includes('useVitalsRedFlagNotifications(canVitals)'),
    'the observer fires push + POSTs while rendering nothing; hiding the card alone leaves a patient alerted about something they cannot see',
  );
});

test('the observer gate is inside the effect, not an early return', () => {
  // An early return before the remaining hooks would be its own crash class.
  assert.match(VITALS, /useVitalsRedFlagNotifications\(enabled:\s*boolean\s*=\s*true\)/);
  assert.match(VITALS, /if\s*\(!enabled\)\s*return;/);
});

test('enabled is in the effect dependency array', () => {
  // Entitlements arrive asynchronously, so this flips true -> false once a
  // real deny is known. Without the dep the effect keeps the stale `true`.
  assert.match(VITALS, /\}, \[trends, disabled, healthAlertsEnabled, enabled\]\)/);
});

test('the default keeps every existing caller unchanged', () => {
  assert.match(VITALS, /enabled:\s*boolean\s*=\s*true/);
});

// ── 4. iOS-26 envelope: the change is strictly subtractive ─────────────────

test('no new react-native primitives were imported', () => {
  // The screen is inside the cold-mount envelope. Gating must only ever
  // REMOVE nodes; it must not add any.
  const rnImport = /import\s*\{([^}]*)\}\s*from\s*'react-native'/.exec(PLAN);
  assert.ok(rnImport, 'expected a react-native import block');
  const imported = rnImport[1].split(',').map((s) => s.trim()).filter(Boolean);
  const ALLOWED = new Set([
    'View', 'Text', 'StyleSheet', 'ScrollView', 'ActivityIndicator',
    'TouchableOpacity', 'Pressable', 'RefreshControl', 'TextStyle', 'Platform',
  ]);
  const unexpected = imported.filter((n) => !ALLOWED.has(n));
  assert.deepEqual(unexpected, [], `unexpected react-native imports: ${unexpected.join(', ')}`);
});

test('gates are plain boolean-AND, adding zero wrapper nodes', () => {
  // `{cond && <X/>}` mounts nothing extra. A <Gate> wrapper component, or a
  // ternary rendering a placeholder, would add render primitives to a screen
  // that has crashed before.
  for (const [component, , varName] of SECTIONS) {
    assert.ok(
      PLAN.includes(`{${varName} && <${component} />}`),
      `${component} must use a plain && gate, not a wrapper or ternary`,
    );
  }
});

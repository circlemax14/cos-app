import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  routeForNotificationData,
  NOTIFICATION_MEDS_ROUTE_BPS_ENABLED,
  NOTIFICATION_PLAN_READY_ROUTE_BPS_ENABLED,
  NOTIFICATION_RETAKE_ROUTE_ENABLED,
} from '../../lib/notification-routing.ts';

// COS-361 (Bug #9): notification tap → route map. The DEFAULT (Home,
// represented as null) must hold for unknown/new/data-ready types so a
// new backend type can never break tap handling on a shipped binary.

// ─── Kill-switch defaults ─────────────────────────────────────────────
// Locks in the current shipped defaults for chunks 64 and 70. If either
// of these constants is intentionally flipped OFF in an incident (OTA
// revert), flip the assertion below to match — that's the deliberate
// signal that the pre-chunk behavior has been restored. Matches the
// existing pattern used by care-plan/med-forms/notification-categories
// tests for feature-flag defaults.

test('NOTIFICATION_MEDS_ROUTE_BPS_ENABLED default is ON (chunk 64 shipped)', () => {
  assert.equal(NOTIFICATION_MEDS_ROUTE_BPS_ENABLED, true);
});

test('NOTIFICATION_PLAN_READY_ROUTE_BPS_ENABLED default is ON (chunk 70 shipped)', () => {
  assert.equal(NOTIFICATION_PLAN_READY_ROUTE_BPS_ENABLED, true);
});

test('NOTIFICATION_RETAKE_ROUTE_ENABLED default is ON (COS-482 Phase 1)', () => {
  assert.equal(NOTIFICATION_RETAKE_ROUTE_ENABLED, true);
});

// ─── ASSESSMENT_RETAKE_REQUESTED (COS-482 Phase 1) ────────────────────

test('ASSESSMENT_RETAKE_REQUESTED → Home (null) so the inbox card renders at top', () => {
  // Explicit null (not undefined / not throw): the card at the top of Home
  // is the destination. Returning null lands the tap on Home per the
  // shared `route ?? "/Home"` fallback in hooks/use-notifications.ts.
  assert.equal(
    routeForNotificationData({ type: 'ASSESSMENT_RETAKE_REQUESTED', requestId: 'r1', instrumentKey: 'phq-9' }),
    null,
  );
});

test('ASSESSMENT_RETAKE_REQUESTED: bpsEnabled has no effect (card is agency-agnostic)', () => {
  assert.equal(
    routeForNotificationData({ type: 'ASSESSMENT_RETAKE_REQUESTED' }, { bpsEnabled: true }),
    null,
  );
  assert.equal(
    routeForNotificationData({ type: 'ASSESSMENT_RETAKE_REQUESTED' }, { bpsEnabled: false }),
    null,
  );
});

test('ASSESSMENT_RETAKE_REQUESTED: malformed data still routes safely to Home', () => {
  assert.equal(
    routeForNotificationData({ type: 'ASSESSMENT_RETAKE_REQUESTED', requestId: null as unknown as string }),
    null,
  );
});

// ─── HEALTH_PLAN_REMINDER (COS-361) ───────────────────────────────────

test('HEALTH_PLAN_REMINDER → Today\'s Schedule', () => {
  assert.equal(
    routeForNotificationData({ type: 'HEALTH_PLAN_REMINDER', slot: 'morning', pending: 2, total: 5 }),
    '/Home/today-schedule',
  );
});

test('HEALTH_PLAN_REMINDER route is unaffected by bpsEnabled (both flags)', () => {
  // Slot-agnostic screen; BPS pivot does not repoint this reminder.
  assert.equal(
    routeForNotificationData({ type: 'HEALTH_PLAN_REMINDER' }, { bpsEnabled: true }),
    '/Home/today-schedule',
  );
  assert.equal(
    routeForNotificationData({ type: 'HEALTH_PLAN_REMINDER' }, { bpsEnabled: false }),
    '/Home/today-schedule',
  );
});

// ─── MEDICATION_REFILL_REMINDER (chunk 64) ────────────────────────────

test('MEDICATION_REFILL_REMINDER → legacy Health Plan when bpsEnabled omitted (undefined)', () => {
  // Back-compat: no opts / bpsEnabled undefined preserves the pre-chunk-64
  // destination so callers that haven't been updated to pass eligibility
  // never get routed to a screen their flags won't render.
  assert.equal(
    routeForNotificationData({ type: 'MEDICATION_REFILL_REMINDER', count: 1, localDate: '2026-06-22' }),
    '/Home/health-plan?focus=medications',
  );
  // Explicit empty opts is the same as omitting them.
  assert.equal(
    routeForNotificationData({ type: 'MEDICATION_REFILL_REMINDER', count: 1 }, {}),
    '/Home/health-plan?focus=medications',
  );
});

test('MEDICATION_REFILL_REMINDER → legacy Health Plan when bpsEnabled=false', () => {
  assert.equal(
    routeForNotificationData(
      { type: 'MEDICATION_REFILL_REMINDER', count: 1 },
      { bpsEnabled: false },
    ),
    '/Home/health-plan?focus=medications',
  );
});

test('MEDICATION_REFILL_REMINDER → BPS Care Plan when bpsEnabled=true (chunk 64)', () => {
  // Bio-eligible caller — the chunk-55 deep-link handler on
  // BiopsychosocialPlanScreen reads ?focus=medications and scrolls to
  // the meds section + announces to VoiceOver.
  assert.equal(
    routeForNotificationData(
      { type: 'MEDICATION_REFILL_REMINDER', count: 1, localDate: '2026-06-22' },
      { bpsEnabled: true },
    ),
    '/Home/biopsychosocial-plan?focus=medications',
  );
});

test('MEDICATION_REFILL_REMINDER: bpsEnabled truthy-but-not-true does NOT trigger BPS route', () => {
  // The router uses `opts.bpsEnabled === true`, not truthy coercion — a
  // stringly-typed "true" or 1 from a mis-serialized caller must NOT
  // silently land users on a surface their build can't render.
  assert.equal(
    routeForNotificationData(
      { type: 'MEDICATION_REFILL_REMINDER' },
      { bpsEnabled: 'true' as unknown as boolean },
    ),
    '/Home/health-plan?focus=medications',
  );
  assert.equal(
    routeForNotificationData(
      { type: 'MEDICATION_REFILL_REMINDER' },
      { bpsEnabled: 1 as unknown as boolean },
    ),
    '/Home/health-plan?focus=medications',
  );
});

test('MEDICATION_REFILL_REMINDER kill-switch-off semantics: bpsEnabled=false always legacy (chunk 64)', () => {
  // The kill-switch is `NOTIFICATION_MEDS_ROUTE_BPS_ENABLED`. When it is
  // ON (current default) the BPS repoint requires bpsEnabled=true. When
  // it is OFF, the guard `bpsEnabled && NOTIFICATION_MEDS_ROUTE_BPS_ENABLED`
  // short-circuits to false regardless of bpsEnabled, so EVERY caller
  // falls through to legacy `/Home/health-plan?focus=medications`.
  //
  // We can't runtime-flip the const without a source change, but we can
  // pin the observable half of the semantics: bpsEnabled=false MUST
  // route to legacy regardless of the kill-switch's value (both branches
  // of the `&&` false-out). The `_ENABLED default` tests above lock the
  // const's shipped value; together they document the full matrix.
  assert.equal(
    routeForNotificationData(
      { type: 'MEDICATION_REFILL_REMINDER' },
      { bpsEnabled: false },
    ),
    '/Home/health-plan?focus=medications',
  );
});

// ─── BIOPSYCHOSOCIAL_PLAN_READY (chunk 70) ────────────────────────────

test('BIOPSYCHOSOCIAL_PLAN_READY → legacy Health Plan when bpsEnabled omitted (undefined)', () => {
  // Back-compat: no opts / bpsEnabled undefined preserves the pre-chunk-70
  // destination so callers that haven't been updated to pass eligibility
  // never get routed to a screen their flags won't render.
  assert.equal(
    routeForNotificationData({ type: 'BIOPSYCHOSOCIAL_PLAN_READY' }),
    '/Home/health-plan',
  );
  // Explicit empty opts is the same as omitting them.
  assert.equal(
    routeForNotificationData({ type: 'BIOPSYCHOSOCIAL_PLAN_READY' }, {}),
    '/Home/health-plan',
  );
});

test('BIOPSYCHOSOCIAL_PLAN_READY → legacy Health Plan when bpsEnabled=false', () => {
  assert.equal(
    routeForNotificationData(
      { type: 'BIOPSYCHOSOCIAL_PLAN_READY' },
      { bpsEnabled: false },
    ),
    '/Home/health-plan',
  );
});

test('BIOPSYCHOSOCIAL_PLAN_READY → BPS Care Plan when bpsEnabled=true (chunk 70)', () => {
  // Bio-eligible caller lands on the BPS surface where the freshly
  // regenerated plan actually renders. No focus param — the ready
  // push should show the whole plan from the top.
  assert.equal(
    routeForNotificationData(
      { type: 'BIOPSYCHOSOCIAL_PLAN_READY' },
      { bpsEnabled: true },
    ),
    '/Home/biopsychosocial-plan',
  );
});

test('BIOPSYCHOSOCIAL_PLAN_READY: no focus param appended on BPS route (chunk 70)', () => {
  // Guardrail: the ready push must NOT carry ?focus=... — the plan
  // should render top-of-screen, not pre-scrolled into a single section.
  const route = routeForNotificationData(
    { type: 'BIOPSYCHOSOCIAL_PLAN_READY' },
    { bpsEnabled: true },
  );
  assert.equal(route, '/Home/biopsychosocial-plan');
  assert.ok(route !== null && !route.includes('?'), 'ready push must not carry query params');
});

test('BIOPSYCHOSOCIAL_PLAN_READY: bpsEnabled truthy-but-not-true does NOT trigger BPS route', () => {
  // Same strict-equality guard as the meds push — a stringly-typed
  // "true" or 1 must not silently escalate to the BPS surface.
  assert.equal(
    routeForNotificationData(
      { type: 'BIOPSYCHOSOCIAL_PLAN_READY' },
      { bpsEnabled: 'true' as unknown as boolean },
    ),
    '/Home/health-plan',
  );
  assert.equal(
    routeForNotificationData(
      { type: 'BIOPSYCHOSOCIAL_PLAN_READY' },
      { bpsEnabled: 1 as unknown as boolean },
    ),
    '/Home/health-plan',
  );
});

test('BIOPSYCHOSOCIAL_PLAN_READY kill-switch-off semantics: bpsEnabled=false always legacy (chunk 70)', () => {
  // Mirrors the meds kill-switch semantics test. When
  // `NOTIFICATION_PLAN_READY_ROUTE_BPS_ENABLED` is OFF, EVERY caller
  // falls through to legacy `/Home/health-plan` (the `&&` short-circuits
  // to false regardless of bpsEnabled). We pin the observable half here
  // — bpsEnabled=false MUST route to legacy regardless of the const —
  // and the `_ENABLED default` test above locks the shipped value.
  assert.equal(
    routeForNotificationData(
      { type: 'BIOPSYCHOSOCIAL_PLAN_READY' },
      { bpsEnabled: false },
    ),
    '/Home/health-plan',
  );
});

// ─── Existing mappings (unchanged behavior) ───────────────────────────

test('existing types keep their routes', () => {
  assert.equal(routeForNotificationData({ type: 'APPOINTMENT_REMINDER' }), '/Home/appointments');
  assert.equal(routeForNotificationData({ type: 'RECOMMENDED_APPOINTMENTS' }), '/Home/appointments');
  assert.equal(routeForNotificationData({ type: 'CARE_PLAN_UPDATE' }), '/Home/plan');
  assert.equal(routeForNotificationData({ type: 'NEW_MESSAGE' }), '/Home/chat');
  assert.equal(routeForNotificationData({ type: 'CARE_GAP' }), '/Home/care-checklist');
});

test('existing-type routes are unaffected by bpsEnabled=true (BPS pivot did not repoint them)', () => {
  // Belt-and-suspenders: only MEDICATION_REFILL_REMINDER (chunk 64) and
  // BIOPSYCHOSOCIAL_PLAN_READY (chunk 70) may vary on bpsEnabled — every
  // other type must ignore the flag entirely.
  assert.equal(
    routeForNotificationData({ type: 'APPOINTMENT_REMINDER' }, { bpsEnabled: true }),
    '/Home/appointments',
  );
  assert.equal(
    routeForNotificationData({ type: 'RECOMMENDED_APPOINTMENTS' }, { bpsEnabled: true }),
    '/Home/appointments',
  );
  assert.equal(
    routeForNotificationData({ type: 'CARE_PLAN_UPDATE' }, { bpsEnabled: true }),
    '/Home/plan',
  );
  assert.equal(
    routeForNotificationData({ type: 'NEW_MESSAGE' }, { bpsEnabled: true }),
    '/Home/chat',
  );
  assert.equal(
    routeForNotificationData({ type: 'CARE_GAP' }, { bpsEnabled: true }),
    '/Home/care-checklist',
  );
});

test('data-ready / EHI / sync-complete → Home default (null)', () => {
  assert.equal(routeForNotificationData({ type: 'DATA_SYNC_COMPLETE' }), null);
  assert.equal(routeForNotificationData({ type: 'EHI_EXPORT_COMPLETE' }), null);
});

test('data-ready types stay Home even with bpsEnabled=true', () => {
  // BPS pivot does not repoint sync-complete pushes.
  assert.equal(
    routeForNotificationData({ type: 'DATA_SYNC_COMPLETE' }, { bpsEnabled: true }),
    null,
  );
  assert.equal(
    routeForNotificationData({ type: 'EHI_EXPORT_COMPLETE' }, { bpsEnabled: true }),
    null,
  );
});

// ─── Default fall-through (COS-361 back-compat contract) ──────────────

test('unknown / future type → Home default (null), never throws', () => {
  assert.equal(routeForNotificationData({ type: 'SOME_BRAND_NEW_TYPE' }), null);
  assert.equal(routeForNotificationData({ type: 'GUIDELINES_UPDATED' }), null);
});

test('unknown types stay Home regardless of bpsEnabled (default fall-through)', () => {
  // The BPS pivot is scoped to the two named cases — unknown types must
  // never be silently interpreted as BPS-eligible.
  assert.equal(
    routeForNotificationData({ type: 'SOME_BRAND_NEW_TYPE' }, { bpsEnabled: true }),
    null,
  );
  assert.equal(
    routeForNotificationData({ type: 'GUIDELINES_UPDATED' }, { bpsEnabled: true }),
    null,
  );
  assert.equal(
    routeForNotificationData({ type: 'FUTURE_BPS_EVENT' }, { bpsEnabled: false }),
    null,
  );
});

test('type is case-sensitive: near-misses fall through to Home', () => {
  // Guards against a backend typo silently mis-routing — e.g. lowercase
  // or camelCase variants of a real type must NOT match the switch and
  // must safely fall through to Home.
  assert.equal(
    routeForNotificationData({ type: 'medication_refill_reminder' }, { bpsEnabled: true }),
    null,
  );
  assert.equal(
    routeForNotificationData({ type: 'BiopsychosocialPlanReady' }, { bpsEnabled: true }),
    null,
  );
  assert.equal(
    routeForNotificationData({ type: 'HEALTH_PLAN_REMINDER ' }), // trailing space
    null,
  );
});

test('malformed payloads → Home default (null), never throws', () => {
  assert.equal(routeForNotificationData(null), null);
  assert.equal(routeForNotificationData(undefined), null);
  assert.equal(routeForNotificationData({}), null);
  assert.equal(routeForNotificationData({ type: 123 } as never), null);
  assert.equal(routeForNotificationData({ notType: 'HEALTH_PLAN_REMINDER' }), null);
  // A primitive masquerading as data must not throw.
  assert.equal(routeForNotificationData('HEALTH_PLAN_REMINDER' as never), null);
});

test('malformed payloads stay Home even when bpsEnabled=true', () => {
  // Defensive: the eligibility flag must NEVER coerce a malformed
  // payload into a real route.
  assert.equal(routeForNotificationData(null, { bpsEnabled: true }), null);
  assert.equal(routeForNotificationData(undefined, { bpsEnabled: true }), null);
  assert.equal(routeForNotificationData({}, { bpsEnabled: true }), null);
  assert.equal(routeForNotificationData({ type: null } as never, { bpsEnabled: true }), null);
  assert.equal(routeForNotificationData({ type: '' }, { bpsEnabled: true }), null);
});

// ─── CHUNK 81: expanded MEDICATION_REFILL_REMINDER coverage ───────────

test('MEDICATION_REFILL_REMINDER: explicit bpsEnabled=undefined is treated as omitted (legacy)', () => {
  // Distinct from `omitted` — some callers spread a partially-populated
  // eligibility object and end up passing `{ bpsEnabled: undefined }`.
  // The strict-equality guard (`opts.bpsEnabled === true`) must handle
  // this the same as truly missing — legacy route.
  assert.equal(
    routeForNotificationData(
      { type: 'MEDICATION_REFILL_REMINDER' },
      { bpsEnabled: undefined },
    ),
    '/Home/health-plan?focus=medications',
  );
});

test('MEDICATION_REFILL_REMINDER: all additional falsy bpsEnabled values → legacy', () => {
  // Locks the strict-equality contract for the full falsy surface —
  // null / 0 / '' / NaN. If someone weakens the guard to a truthy check
  // in the future these break instead of silently escalating a
  // legacy-only patient onto the BPS surface.
  const falsyValues: unknown[] = [null, 0, '', NaN];
  for (const v of falsyValues) {
    assert.equal(
      routeForNotificationData(
        { type: 'MEDICATION_REFILL_REMINDER' },
        { bpsEnabled: v as unknown as boolean },
      ),
      '/Home/health-plan?focus=medications',
      `bpsEnabled=${String(v)} must route to legacy`,
    );
  }
});

test('MEDICATION_REFILL_REMINDER: extra unrelated data fields are ignored (both flag states)', () => {
  // The router must key ONLY on `type` (+ opts.bpsEnabled). Adding
  // arbitrary sibling fields (some real, some invented) must not
  // perturb the destination on either branch.
  const legacyDest = '/Home/health-plan?focus=medications';
  const bpsDest = '/Home/biopsychosocial-plan?focus=medications';
  const enriched = {
    type: 'MEDICATION_REFILL_REMINDER',
    count: 3,
    localDate: '2026-07-23',
    userId: 'abc-123',
    timestamp: 1_800_000_000_000,
    correlationId: 'push-xyz',
    bpsEnabled: false, // MUST NOT be read off `data` — only off `opts`
    focus: 'appointments', // must not be honored as a route override
  };
  assert.equal(routeForNotificationData(enriched), legacyDest);
  assert.equal(routeForNotificationData(enriched, { bpsEnabled: false }), legacyDest);
  assert.equal(routeForNotificationData(enriched, { bpsEnabled: true }), bpsDest);
});

test('MEDICATION_REFILL_REMINDER: legacy branch keeps focus=medications query param', () => {
  // Both the legacy screen (health-plan.tsx) and the BPS screen
  // (BiopsychosocialPlanScreen.tsx, chunk 55) read ?focus=medications
  // to scroll + VoiceOver-announce the meds section. Stripping the
  // param on either branch is a silent UX regression — pin the shape.
  const legacy = routeForNotificationData(
    { type: 'MEDICATION_REFILL_REMINDER' },
    { bpsEnabled: false },
  );
  assert.equal(legacy, '/Home/health-plan?focus=medications');
  assert.ok(legacy !== null && legacy.includes('?focus=medications'));

  const bps = routeForNotificationData(
    { type: 'MEDICATION_REFILL_REMINDER' },
    { bpsEnabled: true },
  );
  assert.equal(bps, '/Home/biopsychosocial-plan?focus=medications');
  assert.ok(bps !== null && bps.includes('?focus=medications'));
});

// ─── CHUNK 81: expanded BIOPSYCHOSOCIAL_PLAN_READY coverage ───────────

test('BIOPSYCHOSOCIAL_PLAN_READY: explicit bpsEnabled=undefined is treated as omitted (legacy)', () => {
  assert.equal(
    routeForNotificationData(
      { type: 'BIOPSYCHOSOCIAL_PLAN_READY' },
      { bpsEnabled: undefined },
    ),
    '/Home/health-plan',
  );
});

test('BIOPSYCHOSOCIAL_PLAN_READY: all additional falsy bpsEnabled values → legacy', () => {
  const falsyValues: unknown[] = [null, 0, '', NaN];
  for (const v of falsyValues) {
    assert.equal(
      routeForNotificationData(
        { type: 'BIOPSYCHOSOCIAL_PLAN_READY' },
        { bpsEnabled: v as unknown as boolean },
      ),
      '/Home/health-plan',
      `bpsEnabled=${String(v)} must route to legacy`,
    );
  }
});

test('BIOPSYCHOSOCIAL_PLAN_READY: legacy branch has NO focus param either (parity with BPS branch)', () => {
  // The chunk-70 guardrail (no query param on the BPS branch) already
  // pins one half. Pin the other half here: the legacy fallback also
  // lands on the plan top, not a pre-scrolled section. If anyone later
  // adds `?focus=plan` to either branch, both this test and the
  // chunk-70 no-query-param test above catch the drift.
  const legacy = routeForNotificationData(
    { type: 'BIOPSYCHOSOCIAL_PLAN_READY' },
    { bpsEnabled: false },
  );
  assert.equal(legacy, '/Home/health-plan');
  assert.ok(legacy !== null && !legacy.includes('?'), 'legacy ready push must not carry query params');
});

test('BIOPSYCHOSOCIAL_PLAN_READY: extra unrelated data fields are ignored (both flag states)', () => {
  const enriched = {
    type: 'BIOPSYCHOSOCIAL_PLAN_READY',
    planVersion: 7,
    regeneratedAt: '2026-07-23T09:00:00Z',
    correlationId: 'plan-xyz',
    bpsEnabled: false, // must not be read off `data`
  };
  assert.equal(routeForNotificationData(enriched), '/Home/health-plan');
  assert.equal(routeForNotificationData(enriched, { bpsEnabled: false }), '/Home/health-plan');
  assert.equal(
    routeForNotificationData(enriched, { bpsEnabled: true }),
    '/Home/biopsychosocial-plan',
  );
});

// ─── CHUNK 81: kill-switch matrix documentation ───────────────────────

test('kill-switch matrix (chunk 64 + 70): current shipped defaults + bpsEnabled=true DO reach BPS', () => {
  // This test is the positive half of the kill-switch documentation. The
  // two `_ENABLED default` tests above pin that the switches are ON;
  // the `bpsEnabled=false always legacy` tests pin one observable half
  // (short-circuit false regardless of switch). This test locks the
  // OTHER observable half of the shipped matrix: with the switches at
  // their true defaults AND bpsEnabled=true, callers MUST reach the BPS
  // surface. If a future OTA flips either switch OFF, this test flips
  // to the corresponding legacy route as the deliberate signal.
  assert.equal(NOTIFICATION_MEDS_ROUTE_BPS_ENABLED, true);
  assert.equal(NOTIFICATION_PLAN_READY_ROUTE_BPS_ENABLED, true);
  assert.equal(
    routeForNotificationData(
      { type: 'MEDICATION_REFILL_REMINDER' },
      { bpsEnabled: true },
    ),
    '/Home/biopsychosocial-plan?focus=medications',
  );
  assert.equal(
    routeForNotificationData(
      { type: 'BIOPSYCHOSOCIAL_PLAN_READY' },
      { bpsEnabled: true },
    ),
    '/Home/biopsychosocial-plan',
  );
});

// ─── CHUNK 81: default fall-through — additional unknown types ────────

test('default fall-through: additional never-shipped / future-type strings → Home', () => {
  // Expands the unknown-type surface beyond the two names already
  // covered above. Explicitly includes strings that could plausibly
  // appear in a future backend release before the client is aware of
  // them (per the COS-361 back-compat contract). If any of these ever
  // becomes a real route, the switch must gain an explicit case and
  // this test must be updated deliberately.
  const futureTypes = [
    'HEALTH_PLAN_COMPLETED',
    'BIOPSYCHOSOCIAL_PLAN_UPDATED',
    'MEDICATION_TAKEN',
    'APPOINTMENT_CANCELLED',
    'CARE_TEAM_CHANGED',
    'INTAKE_REQUIRED',
    'SUMMARY_READY',
    'VITALS_ALERT',
  ];
  for (const type of futureTypes) {
    assert.equal(
      routeForNotificationData({ type }),
      null,
      `unknown type ${type} must fall through to Home`,
    );
    assert.equal(
      routeForNotificationData({ type }, { bpsEnabled: true }),
      null,
      `unknown type ${type} must fall through to Home even with bpsEnabled=true`,
    );
    assert.equal(
      routeForNotificationData({ type }, { bpsEnabled: false }),
      null,
      `unknown type ${type} must fall through to Home even with bpsEnabled=false`,
    );
  }
});

test('default fall-through: unrecognised type with meds-shaped payload does NOT get meds route', () => {
  // A backend typo like `MED_REFILL_REMINDER` or `MEDICATIONS_REFILL`
  // that ships with the exact same sibling fields as the real payload
  // must still fall through to Home — the switch keys on the EXACT
  // string, never on payload heuristics.
  assert.equal(
    routeForNotificationData(
      { type: 'MED_REFILL_REMINDER', count: 1, localDate: '2026-07-23' },
      { bpsEnabled: true },
    ),
    null,
  );
  assert.equal(
    routeForNotificationData(
      { type: 'MEDICATIONS_REFILL', count: 1 },
      { bpsEnabled: true },
    ),
    null,
  );
});

// ─── CHUNK 81: purity + input non-mutation ────────────────────────────

test('router is pure: same input yields same output across repeated calls', () => {
  // No hidden state — repeated identical calls must return identical
  // routes, on both the meds and plan-ready branches, both flag values.
  const data = { type: 'MEDICATION_REFILL_REMINDER', count: 2 };
  const first = routeForNotificationData(data, { bpsEnabled: true });
  const second = routeForNotificationData(data, { bpsEnabled: true });
  const third = routeForNotificationData(data, { bpsEnabled: false });
  assert.equal(first, '/Home/biopsychosocial-plan?focus=medications');
  assert.equal(second, first);
  assert.equal(third, '/Home/health-plan?focus=medications');

  const readyData = { type: 'BIOPSYCHOSOCIAL_PLAN_READY' };
  assert.equal(
    routeForNotificationData(readyData, { bpsEnabled: true }),
    routeForNotificationData(readyData, { bpsEnabled: true }),
  );
});

test('router does not mutate its inputs (data or opts)', () => {
  // Callers pass expo-notifications payload objects directly — the
  // router must not add/remove/mutate keys on them.
  const data = { type: 'MEDICATION_REFILL_REMINDER', count: 1, localDate: '2026-07-23' };
  const dataSnapshot = JSON.stringify(data);
  const opts = { bpsEnabled: true };
  const optsSnapshot = JSON.stringify(opts);

  routeForNotificationData(data, opts);
  routeForNotificationData(data, opts);

  assert.equal(JSON.stringify(data), dataSnapshot, 'data payload must not be mutated');
  assert.equal(JSON.stringify(opts), optsSnapshot, 'opts must not be mutated');
});

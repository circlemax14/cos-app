import { test } from 'node:test';
import assert from 'node:assert/strict';
import { routeForNotificationData } from '../../lib/notification-routing.ts';

// COS-361 (Bug #9): notification tap → route map. The DEFAULT (Home,
// represented as null) must hold for unknown/new/data-ready types so a
// new backend type can never break tap handling on a shipped binary.

test('HEALTH_PLAN_REMINDER → Today\'s Schedule', () => {
  assert.equal(
    routeForNotificationData({ type: 'HEALTH_PLAN_REMINDER', slot: 'morning', pending: 2, total: 5 }),
    '/Home/today-schedule',
  );
});

test('MEDICATION_REFILL_REMINDER → Health Plan, focused on medications', () => {
  assert.equal(
    routeForNotificationData({ type: 'MEDICATION_REFILL_REMINDER', count: 1, localDate: '2026-06-22' }),
    '/Home/health-plan?focus=medications',
  );
});

test('existing types keep their routes', () => {
  assert.equal(routeForNotificationData({ type: 'APPOINTMENT_REMINDER' }), '/Home/appointments');
  assert.equal(routeForNotificationData({ type: 'RECOMMENDED_APPOINTMENTS' }), '/Home/appointments');
  assert.equal(routeForNotificationData({ type: 'CARE_PLAN_UPDATE' }), '/Home/plan');
  assert.equal(routeForNotificationData({ type: 'NEW_MESSAGE' }), '/Home/chat');
  assert.equal(routeForNotificationData({ type: 'CARE_GAP' }), '/Home/care-checklist');
});

test('data-ready / EHI / sync-complete → Home default (null)', () => {
  assert.equal(routeForNotificationData({ type: 'DATA_SYNC_COMPLETE' }), null);
  assert.equal(routeForNotificationData({ type: 'EHI_EXPORT_COMPLETE' }), null);
});

test('unknown / future type → Home default (null), never throws', () => {
  assert.equal(routeForNotificationData({ type: 'SOME_BRAND_NEW_TYPE' }), null);
  assert.equal(routeForNotificationData({ type: 'GUIDELINES_UPDATED' }), null);
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

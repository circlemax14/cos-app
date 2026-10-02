/**
 * COS-1235 — THE BLOCKER: a new invitee could never reach their invitation.
 *
 * `!fastenConnected` sent every account to /(onboarding)/fasten-connect, whose
 * only two ways out are "Connect a Clinic" and "Sign out". So somebody who
 * installed the app BECAUSE they were invited to a care circle was funnelled into
 * connecting a clinic they may not have, and could reach neither the Supports
 * modal nor the Home card where the invitation lives. The feature dead-ended for
 * exactly the population it exists for.
 *
 * The ladder also existed in THREE copies (app/index.tsx, app/(auth)/sign-in.tsx,
 * app/(onboarding)/permissions.tsx) which had already drifted. These assertions
 * are on the one function all three now call, at runtime, so they fail if the rule
 * moves rather than if the wording of a call site changes.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { onboardingGate, ONBOARDING_ROUTES } from './onboarding-gate.ts';

/** A brand-new invitee: terms accepted, no clinic, no records, an invitation. */
const invitee = {
  termsAccepted: true,
  fastenConnected: false,
  dataReady: false,
  ehrOnboardingOptional: true,
};
/** The same person without the care-circle reason to be here. */
const newPatient = { termsAccepted: true, fastenConnected: false, dataReady: false };

describe('THE BLOCKER: an invitee is not held by the EHR gate', () => {
  test('reaches Home with no clinic and no records at all', () => {
    const gate = onboardingGate(invitee, { permissionsRequested: true });
    assert.equal(gate.route, null, 'an invitee must not be sent to connect a clinic');
  });

  test('and is not held by the data-processing gate either', () => {
    // dataReady is false and always will be — there is no export to wait for.
    const gate = onboardingGate(
      { ...invitee, fastenConnected: true },
      { permissionsRequested: true },
    );
    assert.equal(gate.route, null);
  });

  test('THE REGRESSION: without the flag, the same person is funnelled', () => {
    const gate = onboardingGate(newPatient, { permissionsRequested: true });
    assert.equal(gate.route, ONBOARDING_ROUTES.fastenConnect);
  });

  test('an older cached profile with no flag at all behaves exactly as before', () => {
    // The field is absent on a profile cached by a build that predates it. That
    // must read as "mandatory", never as undefined-is-truthy.
    const { ehrOnboardingOptional: _omitted, ...cached } = invitee;
    assert.equal(
      onboardingGate(cached, { permissionsRequested: true }).route,
      ONBOARDING_ROUTES.fastenConnect,
    );
  });
});

describe('the patient funnel is untouched', () => {
  test('no clinic → connect one; connected but not ready → data processing', () => {
    assert.equal(
      onboardingGate(newPatient, { permissionsRequested: true }).route,
      ONBOARDING_ROUTES.fastenConnect,
    );
    assert.equal(
      onboardingGate({ ...newPatient, fastenConnected: true }, { permissionsRequested: true })
        .route,
      ONBOARDING_ROUTES.dataProcessing,
    );
  });

  test('fully onboarded → nothing in the way', () => {
    const gate = onboardingGate(
      { termsAccepted: true, fastenConnected: true, dataReady: true },
      { permissionsRequested: true },
    );
    assert.equal(gate.route, null);
    assert.equal(gate.backfillPermissions, false);
  });
});

describe('terms come before everything, for everyone', () => {
  test('an invitee is NOT exempt — that gate is legal, not product', () => {
    const gate = onboardingGate({ ...invitee, termsAccepted: false }, { permissionsRequested: true });
    assert.equal(gate.route, ONBOARDING_ROUTES.usageGuidelines);
  });

  test('and it beats the permission prompt, so nothing is backfilled past it', () => {
    const gate = onboardingGate({ termsAccepted: false }, { permissionsRequested: false });
    assert.equal(gate.route, ONBOARDING_ROUTES.usageGuidelines);
    assert.equal(gate.backfillPermissions, false);
  });
});

describe('the one-time permission prompt', () => {
  test('is shown once to somebody still mid-onboarding', () => {
    const gate = onboardingGate(newPatient, { permissionsRequested: false });
    assert.equal(gate.route, ONBOARDING_ROUTES.permissions);
    assert.equal(gate.backfillPermissions, false);
  });

  test('is BACKFILLED rather than replayed for an already-onboarded account', () => {
    // Reinstall / "clear app data" / device migration: the local flag is gone but
    // the server says they are done. Replaying onboarding would trap them.
    const gate = onboardingGate(
      { termsAccepted: true, fastenConnected: true, dataReady: true },
      { permissionsRequested: false },
    );
    assert.equal(gate.route, null);
    assert.equal(gate.backfillPermissions, true);
  });

  test('is backfilled for an invitee too — they have no onboarding left either', () => {
    const gate = onboardingGate(invitee, { permissionsRequested: false });
    assert.equal(gate.route, null);
    assert.equal(gate.backfillPermissions, true);
  });
});

test('every route it can return is one of the declared four', () => {
  const declared = new Set(Object.values(ONBOARDING_ROUTES));
  const users = [
    {},
    newPatient,
    invitee,
    { termsAccepted: true, fastenConnected: true, dataReady: false },
    { termsAccepted: true, fastenConnected: true, dataReady: true },
  ];
  for (const user of users) {
    for (const permissionsRequested of [true, false]) {
      const { route } = onboardingGate(user, { permissionsRequested });
      assert.ok(route === null || declared.has(route), `undeclared route: ${route}`);
      if (route) assert.ok(route.startsWith('/'), `not an absolute route: ${route}`);
    }
  }
});

/**
 * COS-1061 — both gates, and the direction each one fails in.
 *
 * Vishal: *"within the app both checks need to be mandatory when we are
 * showing that feature."*
 *
 * The two ways this ships broken are opposite, and the second is far worse:
 *
 *   1. the launch axis does nothing, and an unbuilt screen reaches a patient
 *   2. a MISSING answer reads as "not launched", and the whole app goes blank
 *      on any client whose payload predates the field
 *
 * So every assertion below is about which of `undefined`, `false` and absent
 * produces which answer.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  decideScreenVisible,
  decideFeatureLaunched,
  isCachedScreenAccess,
} from '../../lib/screen-visibility.ts';

describe('COS-1061 — the two axes are AND', () => {
  test('THE POINT: launched + in plan = visible', () => {
    assert.equal(
      decideScreenVisible('calendar', { calendar: { enabled: true, reason: 'entitlement' } }, { calendar: true }),
      true,
    );
  });

  test('THE POINT: launched but NOT in plan = hidden', () => {
    assert.equal(
      decideScreenVisible(
        'calendar',
        { calendar: { enabled: false, reason: 'entitlement-missing' } },
        { calendar: true },
      ),
      false,
    );
  });

  test('THE POINT: in plan but NOT launched = hidden', () => {
    /*
     * The case the whole feature exists for. The plan says yes; the feature is
     * not built. A patient must not reach it.
     */
    assert.equal(
      decideScreenVisible('chat', { chat: { enabled: true, reason: 'entitlement' } }, { chat: false }),
      false,
    );
  });

  test('neither = hidden', () => {
    assert.equal(
      decideScreenVisible('chat', { chat: { enabled: false, reason: 'entitlement-missing' } }, { chat: false }),
      false,
    );
  });
});

describe('COS-1061 — a STALE screens map cannot outvote a fresh launch map', () => {
  test('THE POINT: launched:false wins over a cached enabled:true', () => {
    /*
     * This is why the app re-checks rather than trusting the server's combined
     * answer. The response is held for five minutes and cached across
     * launches, so `screens` can be a minute older than the switch.
     */
    assert.equal(
      decideScreenVisible('chat', { chat: { enabled: true, reason: 'entitlement' } }, { chat: false }),
      false,
    );
  });

  test("and the server's own 'not-launched' reason hides it even with no launch map", () => {
    assert.equal(
      decideScreenVisible('chat', { chat: { enabled: true, reason: 'not-launched' } }, undefined),
      false,
    );
  });
});

describe('COS-1061 — absent means YES, in every direction', () => {
  test('THE POINT: no launch map at all — an older API — shows everything', () => {
    /*
     * If this inverted, every client on a bundle older than the backend would
     * render an app with no screens in it, and the bug would look like a
     * deliberate policy rather than a version skew.
     */
    assert.equal(
      decideScreenVisible('calendar', { calendar: { enabled: true, reason: 'entitlement' } }, undefined),
      true,
    );
  });

  test('a route missing from the launch map is launched', () => {
    assert.equal(
      decideScreenVisible('calendar', { calendar: { enabled: true, reason: 'entitlement' } }, { chat: false }),
      true,
    );
  });

  test('a route missing from BOTH maps is visible — unknown is not a deny', () => {
    assert.equal(decideScreenVisible('brand-new-screen', {}, {}), true);
  });

  test('no data at all — the query is still in flight — is visible', () => {
    assert.equal(decideScreenVisible('calendar', undefined, undefined), true);
  });

  test('launched:undefined is NOT false', () => {
    assert.equal(
      decideScreenVisible('calendar', { calendar: { enabled: true } }, { calendar: undefined as unknown as boolean }),
      true,
    );
  });
});

describe('COS-1061 — decideFeatureLaunched ignores the plan', () => {
  test('a launched feature the plan excludes still reports LAUNCHED', () => {
    /*
     * The two answers are different messages: "not in your plan" can offer an
     * upgrade, "does not exist yet" cannot. A call site that conflated them
     * would advertise an upgrade to something unbuilt.
     */
    assert.equal(
      decideFeatureLaunched('calendar', { calendar: { enabled: false, reason: 'entitlement-missing' } }, { calendar: true }),
      true,
    );
  });

  test('an unlaunched feature reports NOT launched even when granted', () => {
    assert.equal(
      decideFeatureLaunched('chat', { chat: { enabled: true, reason: 'entitlement' } }, { chat: false }),
      false,
    );
  });

  test('unknown is launched', () => {
    assert.equal(decideFeatureLaunched('whatever', undefined, undefined), true);
  });
});

describe('COS-1061 — the disk cache is re-validated on read', () => {
  const good = { screens: { calendar: true }, launched: { calendar: true }, at: 1 };

  test('accepts a well-formed map', () => {
    assert.equal(isCachedScreenAccess(good), true);
  });

  test('THE POINT: rejects an EMPTY screens map', () => {
    /*
     * An empty map is what a half-written record looks like. Accepting it
     * would make the boot gate render from "no routes known" for the life of
     * the install, and every screen would silently fall through to its default.
     */
    assert.equal(isCachedScreenAccess({ screens: {}, launched: {}, at: 1 }), false);
  });

  test('rejects non-boolean values — a hand-edited file is not an answer', () => {
    assert.equal(isCachedScreenAccess({ screens: { calendar: 'yes' }, launched: {}, at: 1 }), false);
    assert.equal(isCachedScreenAccess({ screens: { calendar: 1 }, launched: {}, at: 1 }), false);
  });

  test('rejects arrays, null, and missing fields', () => {
    assert.equal(isCachedScreenAccess(null), false);
    assert.equal(isCachedScreenAccess([]), false);
    assert.equal(isCachedScreenAccess({ screens: [], launched: {}, at: 1 }), false);
    assert.equal(isCachedScreenAccess({ screens: { a: true }, at: 1 }), false);
    assert.equal(isCachedScreenAccess({ screens: { a: true }, launched: {} }), false);
  });
});

/**
 * APPLE-02 / APPLE-03 / GP-03 / GP-04 / MOB-09 — in-app account deletion.
 *
 *  - success is shown only when the server CONFIRMS the deletion (not on a
 *    swallowed error, not on a bare 200)
 *  - the copy matches the 30-day soft delete + Privacy Policy §7
 *  - every self-signup can reach it: onboarding's fasten-connect dead end
 *    offers it, and no plan entitlement can hide it in Profile
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  deletionOutcome,
  deletionCopy,
  ACCOUNT_DELETION_WEB_URL,
} from '../../lib/account-deletion.ts';

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const strip = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

const ok = {
  success: true,
  data: { deleted: true, softDeleted: true, cognitoDisabled: true, cognitoGlobalSignedOut: true, userRowMarkedDeleted: true },
};

test('a fully confirmed response counts as deleted', () => {
  assert.equal(deletionOutcome(ok), 'confirmed');
});

test('a 200 whose users row was not marked is NOT a deletion', () => {
  assert.equal(deletionOutcome({ ...ok, data: { ...ok.data, userRowMarkedDeleted: false } }), 'failed');
  assert.equal(deletionOutcome({ ...ok, data: { ...ok.data, userRowMarkedDeleted: false, cognitoDisabled: false } }), 'failed');
});

test('row marked for purge but Cognito disable failed is REQUESTED, not "NOT deleted"', () => {
  // e.g. every test-users-pool account: adminDisableCognitoUser targets the main pool only
  assert.equal(deletionOutcome({ ...ok, data: { ...ok.data, cognitoDisabled: false } }), 'requested');
});

test('garbage / error envelopes are not a deletion', () => {
  for (const b of [undefined, null, '', {}, { success: true }, { success: false, data: ok.data }, { data: null }]) {
    assert.equal(deletionOutcome(b), 'failed', JSON.stringify(b));
  }
});

test('copy no longer promises an immediate, irreversible erase', () => {
  for (const p of ['ios', 'android']) {
    const c = deletionCopy(p);
    const all = Object.values(c).join(' ');
    assert.doesNotMatch(all, /cannot be undone/i);
    // Must match Privacy Policy §7 / the public /delete-account page: a reader
    // must never come away thinking health records go after 30 days.
    assert.doesNotMatch(all, /permanently erased/i);
    for (const body of [c.confirmBody, c.successBody, c.requestedBody]) {
      assert.match(body, /profile is kept for 30 days/);
      assert.match(body, /at least 7 years/);
      assert.match(body, /audit logs for 6 years/);
      assert.match(body, /section 7/);
    }
    assert.doesNotMatch(c.requestedBody, /NOT/);
    assert.match(c.failureBody, /NOT been deleted/);
    assert.match(c.failureBody, /circlesupporthealth\.ai\/delete-account/);
  }
  assert.match(deletionCopy('ios').confirmBody, /App Store/);
  assert.match(deletionCopy('android').confirmBody, /Google Play/);
  assert.equal(ACCOUNT_DELETION_WEB_URL, 'https://circlesupporthealth.ai/delete-account');
});

test('the flow shows success only after deletionOutcome, and never swallows into success', () => {
  const svc = strip(read('services/account-deletion.ts'));
  assert.match(svc, /deletionOutcome\(/);
  const ok = svc.indexOf("if (outcome !== 'failed')");
  assert.ok(ok > -1, 'success branch is conditional');
  assert.ok(svc.indexOf('successTitle') > ok, 'success alert sits inside the confirmed branch');
  assert.match(svc, /failureTitle/);
  assert.match(svc, /ACCOUNT_DELETION_WEB_URL/);
});

test('Profile uses the shared flow, with no private copy and no entitlement gate', () => {
  const p = strip(read('components/profile-content.tsx'));
  assert.match(p, /confirmAndDeleteAccount\(/);
  assert.ok(!p.includes("apiClient.delete('/v1/auth/account')"), 'no second inline copy');
  assert.ok(!p.includes("useCanRender('profile.delete-account')"), 'deletion cannot be withheld by plan');
  assert.ok(!p.includes("useCanRender('profile.sign-out')"), 'sign-out cannot be withheld by plan');
});

test('every onboarding dead end (fasten-connect, data-processing) offers deletion and sign-out', () => {
  // data-processing: the gate sends every connected-but-not-ready patient here
  // on each cold launch, and a failed export can stay failed.
  for (const screen of ['app/(onboarding)/fasten-connect.tsx', 'app/(onboarding)/data-processing.tsx']) {
    const f = strip(read(screen));
    assert.match(f, /confirmAndDeleteAccount\(/, screen);
    assert.match(f, /Delete my account/, screen);
    assert.match(f, /signOut\(\)/, screen);
  }
  // Both buttons sit outside the pending/failed branches, so both states have them.
  const dp = strip(read('app/(onboarding)/data-processing.tsx'));
  assert.ok(dp.indexOf('Delete my account') > dp.lastIndexOf('We will notify you once'), 'after both branches');
});

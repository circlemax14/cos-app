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
  isDeletionConfirmed,
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
  assert.equal(isDeletionConfirmed(ok), true);
});

test('a 200 whose deletion steps failed is NOT a deletion', () => {
  assert.equal(isDeletionConfirmed({ ...ok, data: { ...ok.data, userRowMarkedDeleted: false } }), false);
  assert.equal(isDeletionConfirmed({ ...ok, data: { ...ok.data, cognitoDisabled: false } }), false);
});

test('garbage / error envelopes are not a deletion', () => {
  for (const b of [undefined, null, '', {}, { success: true }, { success: false, data: ok.data }, { data: null }]) {
    assert.equal(isDeletionConfirmed(b), false, JSON.stringify(b));
  }
});

test('copy no longer promises an immediate, irreversible erase', () => {
  for (const p of ['ios', 'android']) {
    const c = deletionCopy(p);
    const all = Object.values(c).join(' ');
    assert.doesNotMatch(all, /cannot be undone/i);
    assert.match(c.confirmBody, /30 days/);
    assert.match(c.confirmBody, /section 7/);
    assert.match(c.failureBody, /NOT been deleted/);
    assert.match(c.failureBody, /circlesupporthealth\.ai\/delete-account/);
  }
  assert.match(deletionCopy('ios').confirmBody, /App Store/);
  assert.match(deletionCopy('android').confirmBody, /Google Play/);
  assert.equal(ACCOUNT_DELETION_WEB_URL, 'https://circlesupporthealth.ai/delete-account');
});

test('the flow shows success only after isDeletionConfirmed, and never swallows into success', () => {
  const svc = strip(read('services/account-deletion.ts'));
  assert.match(svc, /isDeletionConfirmed\(/);
  const ok = svc.indexOf('if (confirmed)');
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

test('onboarding fasten-connect (the self-signup dead end) offers deletion', () => {
  const f = strip(read('app/(onboarding)/fasten-connect.tsx'));
  assert.match(f, /confirmAndDeleteAccount\(/);
  assert.match(f, /Delete my account/);
});

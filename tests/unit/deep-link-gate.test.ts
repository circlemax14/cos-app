/**
 * MOB-01 — deep links past the PIN lock, tested with REAL URLs.
 *
 * expo-router 55 passes redirectSystemPath the raw URL. The COS-778 guard only
 * handled paths starting with '/', so every real link (cos://…, https://…)
 * skipped the lock checks. These call the decision function itself.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decideInboundLink, toInAppPath, isPublicLink } from '../../lib/deep-link-gate.ts';
// The router's own URL → path function: the one router-store / useLinking run.
import { extractExpoPathFromURL } from 'expo-router/build/fork/extractPathFromURL.js';

const URLS = [
  'cos://Home/personal-info',
  'https://circlesupporthealth.ai/Home/personal-info',
  'https://dev.circlesupporthealth.ai/Home/personal-info',
  '/Home/personal-info',
];

function deps({ pin = true, locked = false, pinThrows = false } = {}) {
  const deferred: string[] = [];
  return {
    deferred,
    d: {
      isPinSetup: async () => {
        if (pinThrows) throw new Error('keychain');
        return pin;
      },
      isAppLocked: () => locked,
      deferNavigation: (r: string) => { deferred.push(r); },
    },
  };
}

test('toInAppPath reduces every inbound form to the same in-app path', () => {
  for (const u of URLS) assert.equal(toInAppPath(u), '/Home/personal-info', u);
  assert.equal(toInAppPath('cos://Home/x?a=1#f'), '/Home/x?a=1#f');
  assert.equal(toInAppPath('https://circlesupporthealth.ai'), '/');
  assert.equal(toInAppPath('https://circlesupporthealth.ai?x=1'), '/?x=1');
  assert.equal(toInAppPath('exp://192.168.0.2:8081/--/Home/x'), '/Home/x');
  assert.equal(toInAppPath('cos://'), '/');
  for (const bad of [undefined, null, 42, '', 'garbage', 'mailto:x@y']) {
    assert.equal(toInAppPath(bad), null, String(bad));
  }
});

test('WARM + LOCKED: every URL form is deferred, never opened', async () => {
  for (const u of URLS) {
    const { d, deferred } = deps({ locked: true });
    assert.equal(await decideInboundLink({ path: u, initial: false }, d), null, u);
    assert.deepEqual(deferred, ['/Home/personal-info'], u);
  }
});

test('COLD + PIN configured: every URL form is deferred, never opened', async () => {
  for (const u of URLS) {
    const { d, deferred } = deps({ pin: true });
    assert.equal(await decideInboundLink({ path: u, initial: true }, d), null, u);
    assert.deepEqual(deferred, ['/Home/personal-info'], u);
  }
});

test('COLD + unreadable PIN state fails closed', async () => {
  const { d, deferred } = deps({ pinThrows: true });
  assert.equal(await decideInboundLink({ path: 'cos://Home/x', initial: true }, d), null);
  assert.deepEqual(deferred, ['/Home/x']);
});

test('an unparseable link is refused (not passed through) when a lock applies', async () => {
  const warm = deps({ locked: true });
  assert.equal(await decideInboundLink({ path: 'garbage', initial: false }, warm.d), null);
  assert.deepEqual(warm.deferred, []);
  const cold = deps({ pin: true });
  assert.equal(await decideInboundLink({ path: 'garbage', initial: true }, cold.d), null);
});

test('no lock: the link passes through UNCHANGED (no deep-link regression)', async () => {
  for (const u of URLS) {
    const warm = deps({ locked: false });
    assert.equal(await decideInboundLink({ path: u, initial: false }, warm.d), u);
    const cold = deps({ pin: false });
    assert.equal(await decideInboundLink({ path: u, initial: true }, cold.d), u);
    assert.deepEqual([...warm.deferred, ...cold.deferred], []);
  }
});

test('COS-1251 Apple callback is swallowed in both forms', async () => {
  const { d } = deps({ locked: false });
  assert.equal(await decideInboundLink({ path: 'cos://auth/apple?id_token=x', initial: false }, d), null);
  assert.equal(await decideInboundLink({ path: '/auth/apple?id_token=x', initial: false }, d), null);
});

test('the PHI-free privacy policy opens even while locked (Health Connect rationale)', async () => {
  for (const initial of [true, false]) {
    const { d, deferred } = deps({ pin: true, locked: true });
    assert.equal(await decideInboundLink({ path: 'cos://privacy-policy', initial }, d), 'cos://privacy-policy');
    assert.deepEqual(deferred, []);
  }
  const { d } = deps({ locked: true });
  assert.equal(await decideInboundLink({ path: 'cos://privacy-policy/../Home/x', initial: false }, d), null);
});

// Review of f740d99: '/--/' anywhere in the URL (query, fragment, any scheme)
// made the gate see '/privacy-policy' while the router opened Personal Info.
const SMUGGLED = [
  'cos://Home/personal-info?x=/--/privacy-policy',
  'cos://Home/personal-info#/--/privacy-policy',
  'https://circlesupporthealth.ai/Home/personal-info?x=/--/privacy-policy',
  'cos://privacy-policy/../Home/personal-info',
  'cos://Home/personal-info?/privacy-policy',
];

test('a PHI link dressed up as the privacy policy is NOT let past the lock (cold or warm)', async () => {
  for (const u of SMUGGLED) {
    // Ground truth: where the ROUTER would go.
    assert.notEqual(extractExpoPathFromURL([], u).replace(/[?#].*$/, ''), 'privacy-policy', u);
    assert.equal(isPublicLink(u), false, u);
    for (const initial of [true, false]) {
      const { d } = deps({ pin: true, locked: true });
      assert.equal(await decideInboundLink({ path: u, initial }, d), null, `${u} initial=${initial}`);
    }
  }
  // and the deferred route is the real target, not the policy
  assert.equal(toInAppPath(SMUGGLED[0]), '/Home/personal-info?x=/--/privacy-policy');
});

test('isPublicLink agrees with the router on every genuine policy form', () => {
  for (const u of ['cos://privacy-policy', 'cos:///privacy-policy', '/privacy-policy',
    'https://circlesupporthealth.ai/privacy-policy', 'cos://privacy-policy?from=hc']) {
    assert.equal(extractExpoPathFromURL([], u).replace(/[?#].*$/, ''), 'privacy-policy', u);
    assert.equal(isPublicLink(u), true, u);
  }
});

test('+native-intent delegates to the tested function', () => {
  const src = readFileSync(new URL('../../app/+native-intent.ts', import.meta.url), 'utf8');
  assert.match(src, /decideInboundLink\(/);
  assert.ok(!/startsWith\('\/'\)\) return path/.test(src), 'the no-op early return is gone');
});

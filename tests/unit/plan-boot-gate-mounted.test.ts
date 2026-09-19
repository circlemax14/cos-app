/**
 * COS-1061 — the boot gate has to be IN THE TREE, and in the right place.
 *
 * The logic is tested in screen-visibility.test.ts. This asserts the far
 * cheaper failure: the component exists, is correct, and is not actually
 * wrapping anything — which is precisely the shape of COS-1038, where the
 * screenshot policy was written, tested and read by nothing.
 *
 * Source text rather than a render: this tree is the whole app, and
 * `node --test` cannot load React Native at all (see cos-app CLAUDE.md).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const layout = readFileSync(new URL('../../app/_layout.tsx', import.meta.url), 'utf8');
const gate = readFileSync(new URL('../../components/PlanBootGate.tsx', import.meta.url), 'utf8');
const tokens = readFileSync(new URL('../../lib/auth-tokens.ts', import.meta.url), 'utf8');

/** Comments describe intent; only code proves it. */
const layoutCode = layout.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const gateCode = gate.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('COS-1061 — PlanBootGate is mounted', () => {
  test('THE POINT: it wraps the Stack, so no route mounts behind the loader', () => {
    /*
     * Wrapping matters as much as being present. Rendered as a SIBLING of the
     * Stack it would draw a spinner over an app that had already mounted every
     * route and started firing their queries — the flash would still happen,
     * just underneath.
     */
    assert.match(
      layoutCode,
      /<PlanBootGate>\s*<StackWithAppLock\s*\/>\s*<\/PlanBootGate>/,
      'PlanBootGate must WRAP <StackWithAppLock />, not sit beside it',
    );
  });

  test('it is imported, not just referenced', () => {
    assert.match(layoutCode, /import\s*\{\s*PlanBootGate\s*\}\s*from\s*'@\/components\/PlanBootGate'/);
  });

  test('it sits inside QueryProvider — its hook needs the client', () => {
    const q = layoutCode.indexOf('<QueryProvider>');
    const g = layoutCode.indexOf('<PlanBootGate>');
    assert.ok(q > -1 && g > q, 'PlanBootGate must be inside <QueryProvider>');
  });
});

describe('COS-1061 — the gate cannot trap anyone', () => {
  test('THE POINT: an unauthenticated user is never held', () => {
    /*
     * Sign-in, onboarding and the PIN screen have no plan to wait for. Gating
     * them would mean a signed-out patient waits for a 401 before the app
     * lets them sign in.
     */
    assert.match(gateCode, /if \(signedIn === false\) return <>\{children\}<\/>/);
  });

  test('THE POINT: there is a timeout, and it leads to a retry — not a permanent spinner', () => {
    assert.match(gateCode, /BOOT_TIMEOUT_MS/);
    assert.match(gateCode, /isError \|\| timedOut/);
    assert.match(gateCode, /ConnectionErrorScreen/);
    assert.match(gateCode, /onRetry=\{retry\}/);
  });

  test('the retry clears the timed-out state, so the second attempt gets a full window', () => {
    assert.match(gateCode, /setTimedOut\(false\)[\s\S]{0,80}refetch\(\)/);
  });

  test('a cached map renders immediately — no loader for a returning patient', () => {
    assert.match(gateCode, /readCachedScreenAccess\(\)\) return <>\{children\}<\/>/);
  });

  test('the timeout is generous enough for a cold Lambda', () => {
    const m = /BOOT_TIMEOUT_MS = ([\d_]+)/.exec(gateCode);
    assert.ok(m, 'BOOT_TIMEOUT_MS must be a literal so it can be read here');
    const ms = Number(m[1].replace(/_/g, ''));
    assert.ok(ms >= 8000, `boot timeout ${ms}ms is too short for a cold start`);
    assert.ok(ms <= 20000, `boot timeout ${ms}ms leaves a patient staring at a spinner`);
  });
});

describe('COS-1061 — the cached map is cleared on sign-out', () => {
  test('THE POINT: the next person on this device does not get this one\'s navigation', () => {
    /*
     * The gate renders straight from the cache when present. A map left behind
     * would show the next account the previous patient's tab bar — and which
     * screens someone has is itself a statement about their care.
     */
    assert.match(tokens, /clearScreenAccessCache/);
    const call = tokens.indexOf('await clearScreenAccessCache()');
    assert.ok(call > -1, 'clearScreenAccessCache must be CALLED, not only imported');
  });
});

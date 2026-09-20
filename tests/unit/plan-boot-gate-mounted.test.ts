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

  test('a cached map is used when the fetch is slow — the patient is never stranded', () => {
    /*
     * COS-1069 — this used to read "renders immediately — no loader for a
     * returning patient", and that WAS the behaviour: the cache short-circuit
     * had no timer, so the loader never appeared after the first launch and the
     * plan was not resolved before screens drew. The cache is now a bounded
     * fallback; see the COS-1069 block below for the ordering that matters.
     */
    assert.match(gateCode, /mayUseCache && cacheReady && readCachedScreenAccess\(\)\) return <>\{children\}<\/>/);
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


/**
 * COS-1069 — the gate and the gating hook must read the SAME evidence.
 *
 * The first version opened as soon as a disk-cached map existed. `useCanShowScreen`
 * could not see that cache — it read only the live query — so on every launch
 * after the first: the gate opened, every screen fell through to its visible
 * default, and the tab bar retracted when the network answered.
 *
 * That is precisely the flash PlanBootGate exists to remove, caused by
 * PlanBootGate. A gate must not open on evidence the gated code cannot see.
 */
describe('COS-1069 — the cache is a fallback, not a fast path', () => {
  const hookCode = readFileSync(new URL('../../hooks/use-feature-permissions.ts', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

  test('THE POINT: useCanShowScreen reads the same disk cache the gate does', () => {
    assert.match(hookCode, /readCachedScreenAccess/);
    assert.match(
      hookCode,
      /if \(data\) return decideScreenVisible[\s\S]{0,200}cachedMaps\(\)/,
      'live answer first, then the cached map — a remembered answer beats a guess',
    );
  });

  test('THE POINT: the gate waits before falling back to cache', () => {
    /*
     * Without the timer the loader never appeared for a returning patient, and
     * the plan was NOT resolved before screens rendered — which is the entire
     * requirement.
     */
    assert.match(gateCode, /CACHE_FALLBACK_MS/);
    assert.match(gateCode, /mayUseCache && cacheReady && readCachedScreenAccess\(\)/);
  });

  test('a live answer still short-circuits immediately — no artificial delay', () => {
    /*
     * The `data` branch must come BEFORE the cache branch, so a normal fetch
     * dismisses the loader the moment it lands. The timer bounds a slow
     * network; it must never add latency to a fast one.
     */
    const dataAt = gateCode.indexOf('if (data) return');
    const cacheAt = gateCode.indexOf('mayUseCache && cacheReady');
    assert.ok(dataAt > -1 && cacheAt > dataAt, 'the live-data branch must precede the cache branch');
  });

  test('the fallback window is bounded and sane', () => {
    const m = /CACHE_FALLBACK_MS = ([\d_]+)/.exec(gateCode);
    assert.ok(m, 'CACHE_FALLBACK_MS must be a literal');
    const ms = Number(m[1].replace(/_/g, ''));
    assert.ok(ms >= 1000, `${ms}ms is too short — a normal fetch would lose the race`);
    assert.ok(ms <= 5000, `${ms}ms leaves a returning patient staring at a spinner`);
  });

  test('a retry re-arms the wait rather than jumping straight to cache', () => {
    assert.match(gateCode, /setMayUseCache\(false\)/);
  });
});

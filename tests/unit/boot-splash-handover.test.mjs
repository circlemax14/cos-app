/**
 * COS-1226 — the native splash must be handed over by whoever is holding.
 *
 * `SplashScreen.preventAutoHideAsync()` runs at module load (app/_layout.tsx)
 * and `hideAsync()` lived ONLY in app/index.tsx, which is a <Stack> route and
 * therefore a CHILD of <PlanBootGate>. Anything that held above the Stack held
 * the splash up with it and drew itself underneath: the COS-1061/1069/1072
 * loader, the COS-1072 retry screen (built, and unreachable by construction),
 * and security-store's `if (!isReady) return null`.
 *
 * Source-reading contracts: `node --test` cannot load React Native at all (see
 * cos-app CLAUDE.md), and the failure lives in a cold-start race. What CAN be
 * pinned is that every holding branch renders the one boot screen, that the
 * screen lifts the splash, and that it still MATCHES the splash — because the
 * daily launch of 26 production patients goes through this handover and a
 * mismatch is a flicker on all of them.
 *
 * The branch logic itself is pure and tested without a renderer in
 * boot-gate-decision.test.ts.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
/** Comments describe intent; only code proves it. */
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const splash = read('components/BootSplash.tsx');
const splashCode = codeOnly(splash);
const gateCode = codeOnly(read('components/PlanBootGate.tsx'));
const securityCode = codeOnly(read('stores/security-store.tsx'));
const indexCode = codeOnly(read('app/index.tsx'));
const layoutCode = codeOnly(read('app/_layout.tsx'));
const appJson = JSON.parse(read('app.json'));

const splashPlugin = appJson.expo.plugins.find(
  (p) => Array.isArray(p) && p[0] === 'expo-splash-screen',
)?.[1];

describe('COS-1226 — every state before the first screen renders the boot screen', () => {
  test('THE POINT: the gate hands over while it HOLDS, not only when it succeeds', () => {
    assert.match(gateCode, /<BootSplash/, 'the gate must render the boot screen while holding');
    assert.match(gateCode, /splashHandover\(decision\) === 'now'/);
    assert.match(gateCode, /SplashScreen\.hideAsync\(\)/, 'the error branch has nothing to decode');
  });

  test('THE POINT: security-store no longer renders the whole app as nothing', () => {
    assert.doesNotMatch(
      securityCode,
      /if \(!isReady\) return null/,
      'returning null holds the entire app invisible under the splash',
    );
    assert.match(securityCode, /if \(!isReady\) return <BootSplash \/>/);
  });

  test("the splash gate's own loading state is the SAME screen", () => {
    // Different pixels here would be a visible jump on every launch, because
    // the states above it now hand the splash over before this route mounts.
    assert.match(indexCode, /return <BootSplash \/>/);
    assert.doesNotMatch(indexCode, /ActivityIndicator/, 'no second loading look');
  });

  test('the first real screen still owns the handover on the healthy path', () => {
    // Unchanged behaviour: run()'s finally. Removing it would make the splash
    // depend on an image decode rather than on the app being ready.
    assert.match(indexCode, /SplashScreen\.hideAsync\(\)/);
    assert.match(layoutCode, /SplashScreen\.preventAutoHideAsync\(\)/);
  });
});

describe('COS-1226 — the handover is invisible', () => {
  test('THE POINT: the boot screen hides the splash on PAINT, not on commit', () => {
    /*
     * React commits before the image has decoded. Hiding in an effect would
     * expose a frame or two of bare background on every launch — trading a rare
     * frozen splash for a daily flicker, which is the one outcome ruled out.
     */
    assert.match(splashCode, /onLoadEnd=\{handOver\}/);
    assert.match(splashCode, /const handOver[\s\S]{0,160}SplashScreen\.hideAsync\(\)/);
  });

  test('and hands over anyway if the image never reports back', () => {
    assert.match(splashCode, /setTimeout\(handOver, HANDOVER_CEILING_MS\)/);
    const ms = Number(/HANDOVER_CEILING_MS = ([\d_]+)/.exec(splashCode)[1].replace(/_/g, ''));
    assert.ok(ms > 0 && ms <= 3000, `${ms}ms is not a backstop`);
  });

  test('THE POINT: it matches app.json — the splash is generated from these values', () => {
    assert.equal(splashPlugin.imageWidth, 200, 'app.json changed; BootSplash must follow');
    assert.match(splashCode, /SPLASH_IMAGE_WIDTH = 200/);
    assert.equal(splashPlugin.backgroundColor, '#ffffff');
    assert.match(splashCode, /SPLASH_BACKGROUND_LIGHT = '#ffffff'/);
    assert.equal(splashPlugin.dark.backgroundColor, '#000000');
    assert.match(splashCode, /SPLASH_BACKGROUND_DARK = '#000000'/);
    assert.match(splashPlugin.image, /splash-icon\.png$/);
    assert.match(splashCode, /require\('@\/assets\/images\/splash-icon\.png'\)/);
    assert.equal(splashPlugin.resizeMode, 'contain');
    assert.match(splashCode, /contentFit="contain"/);
  });

  test('the background follows the OS, like the storyboard does', () => {
    // userInterfaceStyle is "automatic", so the native splash picked its
    // background from the system appearance — not from the in-app theme
    // setting, which can disagree with it.
    assert.equal(appJson.expo.userInterfaceStyle, 'automatic');
    assert.match(splashCode, /useColorScheme/);
  });

  test('centred in the FULL window — the storyboard ignores safe areas', () => {
    assert.doesNotMatch(splashCode, /SafeArea/);
    assert.match(splashCode, /justifyContent: 'center'/);
  });

  test('it reads no context, so it cannot throw on a path with no providers', () => {
    assert.doesNotMatch(splashCode, /useAccessibility|useSecurity|useSettings/);
  });

  test('it stays a pure splash first, then admits to being a loader', () => {
    const ms = Number(/REVEAL_MS = ([\d_]+)/.exec(splashCode)[1].replace(/_/g, ''));
    assert.ok(ms >= 600, `${ms}ms would flash a loader on a healthy launch`);
    assert.ok(ms <= 3000, `${ms}ms leaves a frozen-looking logo for too long`);
    assert.match(splashCode, /revealed \? \(/);
    assert.match(splashCode, /ActivityIndicator/, 'evidence the app is alive');
  });
});

describe('COS-1226 — the gate stops flip-flopping on a cold start', () => {
  test('THE POINT: readSessionPresence is never called bare', () => {
    /*
     * With no `expectSession`, lib/auth-tokens.ts does not retry a null read
     * and answers 'absent' — so a cold Keychain made the gate decide "signed
     * out" and open the app wide. That is COS-874 / COS-890 again, in the one
     * place that decides whether the whole app renders.
     */
    assert.doesNotMatch(gateCode, /readSessionPresence\(\)/);
    assert.match(gateCode, /readSessionPresence\(\{\s*expectSession:/);
  });

  test('it corroborates exactly as the splash gate does', () => {
    const corroboration = /expectSession: pinConfigured \|\| cachedProfile !== null/;
    assert.match(gateCode, corroboration);
    assert.match(indexCode, corroboration, 'the two must not drift apart');
  });

  test('an unreadable session waits — it does not claim to be signed in', () => {
    assert.match(gateCode, /setPresence\('indeterminate'\)/);
  });
});

describe('COS-1226 — the retry actually retries', () => {
  test('THE POINT: the in-flight request is cancelled first', () => {
    /*
     * Verified in @tanstack/query-core/build/modern/query.js fetch(): with a
     * fetch in flight it honours cancelRefetch only `if (this.state.data !==
     * void 0`, and otherwise returns the EXISTING retryer promise. On the boot
     * path data is undefined by definition, so on the case the retry screen
     * exists for — timed out, request still pending — refetch() alone started
     * nothing.
     */
    assert.match(gateCode, /cancelQueries\(\{ queryKey: FEATURE_PERMISSIONS_QUERY_KEY/);
    assert.match(gateCode, /cancelQueries[\s\S]{0,160}refetch\(\)/);
    assert.match(
      read('hooks/use-feature-permissions.ts'),
      /export const FEATURE_PERMISSIONS_QUERY_KEY/,
      'one key, one owner — a copy here would drift',
    );
  });

  test('THE POINT: the clocks start over, so a second attempt can also time out', () => {
    /*
     * `waiting` does not change across a retry that is still waiting, so
     * without `attempt` the effect never re-ran: the fired timer was never
     * replaced and the second attempt spun forever.
     */
    assert.match(gateCode, /setAttempt\(\(n\) => n \+ 1\)/);
    const deps = [...gateCode.matchAll(/\}, \[waiting, attempt\]\)/g)];
    assert.equal(deps.length, 2, 'both the boot timeout and the cache fallback must re-arm');
  });

  test('and it still clears the states that made the error screen show', () => {
    assert.match(gateCode, /setTimedOut\(false\)/);
    assert.match(gateCode, /setMayUseCache\(false\)/);
  });
});

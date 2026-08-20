/**
 * COS-723 — every route must degrade to one broken screen, never a dead app.
 *
 * WHAT THIS PREVENTS
 * On 2026-08-15 Health Summary threw, nothing caught it, and expo-updates'
 * error recovery aborted the process. From the patient's side the app simply
 * vanished; from ours the native crash log carried no JS frames, so it could
 * not even say what threw. ScreenErrorBoundary was added in response — but to
 * 5 screens. As of 2026-08-19 the other 74 routes were still bare.
 *
 * THE MISREADING THAT LET IT SIT
 * app/_layout.tsx carried the comment "Sentry.wrap installs the JS error
 * boundary ... Any uncaught error inside the React tree now lands in Sentry".
 * It does not. Sentry.wrap renders TouchEventBoundary > ReactNativeProfiler >
 * FeedbackWidgetProvider (@sentry/react-native/dist/js/sdk.js `wrap`), and none
 * of the three implements componentDidCatch or getDerivedStateFromError.
 * "TouchEventBoundary" is about touch breadcrumbs, not catching. So the app
 * genuinely had no boundary above these routes.
 *
 * THE INVARIANT
 *   1. every leaf route either exports ErrorBoundary or wraps in ScreenErrorBoundary
 *   2. NO _layout.tsx exports ErrorBoundary
 *
 * (2) matters as much as (1). The Tabs navigator lives in app/Home/_layout.tsx.
 * A boundary there catches ABOVE the tab bar and replaces the whole shell, so a
 * single screen's bad data strands the patient with no way to navigate out. Kept
 * on the leaf, the tab bar survives and they can walk to another tab.
 *
 * Source-text assertions, matching lib/screen-error-boundary.test.mjs — there is
 * no React renderer in this repo's `node --test` setup, and the properties that
 * matter here are structural anyway.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const APP = join(ROOT, 'app');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (entry.endsWith('.tsx')) out.push(p);
  }
  return out;
}

const all = walk(APP);
const layouts = all.filter((p) => p.endsWith('_layout.tsx'));

/** Leaf routes: expo-router treats a .tsx with a default export as a screen. */
const leaves = all.filter((p) => {
  if (p.endsWith('_layout.tsx')) return false;
  const base = p.split('/').pop()!;
  if (base.startsWith('+')) return false; // +not-found, +html — expo internals
  return /export\s+default/.test(readFileSync(p, 'utf8'));
});

const EXPORTS_BOUNDARY = /export\s*\{[^}]*\bErrorBoundary\b[^}]*\}|export\s+(?:function|const)\s+ErrorBoundary\b/;

/** Comments can quote code; strip them before asserting on structure. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*$/gm, '');
}

test('there are routes to check (guard against a silently empty suite)', () => {
  assert.ok(leaves.length > 20, `only found ${leaves.length} leaf routes — the walk is probably broken`);
});

test('THE POINT: every leaf route has an error boundary', () => {
  const bare = leaves.filter((p) => {
    const src = readFileSync(p, 'utf8');
    return !EXPORTS_BOUNDARY.test(src) && !src.includes('ScreenErrorBoundary');
  });
  assert.deepEqual(
    bare.map((p) => relative(ROOT, p)),
    [],
    'These routes would take the whole app down if they threw. Add:\n' +
      "  export { ErrorBoundary } from '@/components/RouteErrorBoundary';",
  );
});

test('no _layout.tsx exports ErrorBoundary — it would replace the whole shell', () => {
  const offenders = layouts.filter((p) => EXPORTS_BOUNDARY.test(readFileSync(p, 'utf8')));
  assert.deepEqual(
    offenders.map((p) => relative(ROOT, p)),
    [],
    'A boundary in a layout catches above the navigator. If app/Home/_layout.tsx ' +
      'caught, the tab bar itself would be replaced and the patient could not ' +
      'navigate away from the failure. Put the boundary on the leaf route instead.',
  );
});

test('the fallback stays inside the iOS 26 render envelope', () => {
  // The 2026-08 crash run cost ~8 production crashes to exotic native rendering.
  // A fallback that only renders when something has ALREADY gone wrong is the
  // last place to get clever: there is no second boundary above it.
  const src = stripComments(readFileSync(join(ROOT, 'components', 'RouteErrorBoundary.tsx'), 'utf8'));
  const imported = [...src.matchAll(/^import[\s\S]*?from\s+'([^']+)'/gm)].map((m) => m[1]);
  const allowed = new Set(['react', 'react-native', '@expo/vector-icons/MaterialIcons', 'expo-router']);
  const unexpected = imported.filter((i) => !allowed.has(i));
  assert.deepEqual(unexpected, [], 'RouteErrorBoundary must stay dependency-light');
});

test('the fallback reports — a swallowed error is worse than a crash', () => {
  const src = readFileSync(join(ROOT, 'components', 'RouteErrorBoundary.tsx'), 'utf8');
  assert.match(src, /captureException/);
  assert.match(src, /console\.error/);
});

test('reporting can never itself crash the app', () => {
  const src = readFileSync(join(ROOT, 'components', 'RouteErrorBoundary.tsx'), 'utf8');
  const fn = src.slice(src.indexOf('function report'));
  assert.match(fn, /try \{/, 'the Sentry require/capture must be inside try/catch');
  assert.match(fn, /\} catch \{/);
});

test('the fallback leaks no PHI into the report', () => {
  // Only a route path and the error itself — never anything from what the screen
  // was rendering. Asserted against the actual call payload, with comments
  // stripped, so prose about PHI in the docblock cannot satisfy or fail it.
  const src = readFileSync(join(ROOT, 'components', 'RouteErrorBoundary.tsx'), 'utf8');
  const start = src.indexOf('Sentry.captureException?.(');
  assert.ok(start > -1, 'no captureException call found');
  const payload = src
    .slice(start, src.indexOf('});', start))
    .replace(/\/\/[^\n]*/g, '') // strip line comments
    .replace(/\/\*[\s\S]*?\*\//g, ''); // strip block comments

  // The only keys allowed in the context object.
  const topLevelKeys = [...payload.matchAll(/^\s{6}(\w+)\s*:/gm)].map((m) => m[1]);
  assert.deepEqual(
    topLevelKeys,
    ['tags'],
    `captureException context must carry only \`tags\`, got: ${topLevelKeys.join(', ')}`,
  );
  // Belt and braces: nothing that could hold rendered content.
  assert.ok(
    !/\b(extra|contexts|props|state|patient|user|payload)\b/.test(payload),
    `report payload looks too broad: ${payload}`,
  );
});

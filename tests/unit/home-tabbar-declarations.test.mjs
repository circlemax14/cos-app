/**
 * Every screen under app/Home/ must be declared in the tab layout.
 *
 * expo-router registers each file in a tabs directory as a TAB unless the
 * layout says otherwise. So adding a screen and forgetting the declaration
 * does not fail a build, does not fail a test, and does not look wrong in
 * review — it just quietly puts a new item in the bottom navigation of a
 * production app.
 *
 * That is exactly what happened on 2026-08-14: app/Home/assessment-detail.tsx
 * shipped in an OTA and appeared as an "assessment detail" tab. Vishal found
 * it, not us.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
/**
 * Comments STRIPPED. The layout's own prose explains the `href: null` idiom,
 * and that sentence sits between two screen declarations — so a naive slice
 * reads a neighbour's comment as this screen's config. That false positive
 * cost a debugging round; it is the third time today a source-reading test
 * has been fooled by a comment.
 */
const LAYOUT = readFileSync(join(ROOT, 'app/Home/_layout.tsx'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/^\s*\/\/.*$/gm, '');

/**
 * The unconditionally-visible tabs, read off the layout rather than guessed
 * from the labels — the file names do not match the titles. `plan` is titled
 * "Health Summary"; `health-plan` is a HIDDEN screen; `today-schedule` is
 * hidden too despite sounding like a tab. I got this wrong twice by assuming.
 *
 * The centre tab is declared conditionally, with `href: null` in one branch of
 * a ternary, so a static read cannot classify it. It is therefore not listed
 * here — which costs nothing, since the check below only asserts that
 * non-tabs ARE hidden.
 */
// COS-803 — `care-plan-plus` is unconditionally visible: it is the surface
// for testing entitlements, so a `canShow` gate would hide it exactly when a
// plan got the answer wrong. `health-plan` stays out of this set because it
// flips to href: null under unifiedDefault.
const REAL_TABS = new Set(['index', 'appointments', 'plan', 'reports', 'care-plan-plus']);

const screens = readdirSync(join(ROOT, 'app/Home'))
  .filter((f) => /\.tsx$/.test(f))
  .map((f) => f.replace(/\.tsx$/, ''))
  .filter((n) => !n.startsWith('_'));

test('every Home screen is declared in the tab layout', () => {
  const undeclared = screens.filter(
    (n) => !new RegExp(`name="${n}"`).test(LAYOUT),
  );
  assert.deepEqual(
    undeclared,
    [],
    'undeclared screens become tabs in the bottom bar — add <Tabs.Screen name="..." options={{ href: null }} />',
  );
});

test('every non-tab screen is hidden with href: null', () => {
  const exposed = [];
  for (const name of screens) {
    if (REAL_TABS.has(name)) continue;
    // Slice from this screen's declaration to the next one, so a neighbour's
    // href: null cannot satisfy the check for this one.
    const at = LAYOUT.indexOf(`name="${name}"`);
    if (at === -1) continue; // covered by the test above
    const next = LAYOUT.indexOf('<Tabs.Screen', at);
    const block = LAYOUT.slice(at, next === -1 ? undefined : next);
    if (!/href: null/.test(block)) exposed.push(name);
  }
  assert.deepEqual(exposed, [], 'these would show in the bottom navigation');
});

test('the unconditional tabs are still visible', () => {
  // The inverse guard: a stray href: null on one of these empties the bar.
  for (const name of REAL_TABS) {
    const at = LAYOUT.indexOf(`name="${name}"`);
    assert.notEqual(at, -1, `${name} must be declared`);
    const next = LAYOUT.indexOf('<Tabs.Screen', at);
    const block = LAYOUT.slice(at, next === -1 ? undefined : next);
    assert.doesNotMatch(block, /href: null/, `${name} is a real tab and must not be hidden`);
  }
});

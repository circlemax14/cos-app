/**
 * COS-855 — the Health Summary says when it is being rebuilt.
 *
 * A plan switch (and four other activities) now enqueues a summary rebuild.
 * Without this the patient sees content built for the plan they just left,
 * with nothing on screen saying so, until the rebuild silently replaces it.
 *
 * Source-contract tests: this card renders through react-native primitives
 * and an accessibility store, and standing that up under `node --test` costs
 * more than it proves. What matters is the four decisions below, each of which
 * would be easy to undo without noticing.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

const CARD = read('components/HealthSummaryCard.tsx');
const HOOK = read('hooks/use-health-summary.ts');

test('THE POINT: the banner does NOT replace the summary', () => {
  // The care-plan flow replaces its screen because the stale plan underneath
  // has tappable goals. A summary is read-only prose — hiding it removes
  // something useful to say nothing new.
  const bannerAt = CARD.indexOf('summary.rebuilding === true');
  const overviewAt = CARD.indexOf('{summary.overview}');
  assert.ok(bannerAt > -1, 'no rebuilding banner');
  assert.ok(overviewAt > -1, 'no summary content');
  assert.ok(bannerAt < overviewAt, 'banner must sit ABOVE the content, not instead of it');
  // An early `return` between them would mean the content never renders.
  assert.ok(
    !/summary\.rebuilding === true[\s\S]{0,400}?\breturn\b/.test(CARD),
    'the banner must not early-return past the summary',
  );
});

test('THE POINT: polling runs ONLY while a rebuild is in flight', () => {
  // This hook is mounted on the Plan screen. An unconditional interval would
  // poll an endpoint that can cost a Bedrock call for as long as the screen
  // is open.
  assert.match(HOOK, /refetchInterval:\s*\(query\)\s*=>/);
  assert.match(HOOK, /rebuilding === true \? 5000 : false/);
});

test('`rebuilding` is optional, so an older API response still renders', () => {
  // The backend field is additive; a bundle pointed at an API without it must
  // behave exactly as before rather than rendering a permanent banner.
  assert.match(HOOK, /rebuilding\?: boolean/);
  assert.match(CARD, /summary\.rebuilding === true/, 'must test explicitly, not truthiness');
});

test('the banner uses primitives this file already imports (iOS 26 envelope)', () => {
  // cos-app/CLAUDE.md: no new react-native primitive imports on a screen you
  // are only gating. View / Text / ActivityIndicator were all already here.
  const imports = CARD.slice(0, CARD.indexOf("} from 'react-native'"));
  for (const prim of ['View', 'Text', 'ActivityIndicator']) {
    assert.ok(imports.includes(prim), `${prim} should already be imported`);
  }
});

/**
 * COS-859 — a screen the plan does not include must be unreachable, not just
 * absent from the tab bar.
 *
 * The navigator gates <Tabs.Screen> entries, which covers the FIVE screens in
 * the tab bar. The other 55 carry href:null and are reached with router.push()
 * from inside the app. Vishal removed calendar-settings from his plan and
 * could still open it — the backend correctly reported it hidden, and nothing
 * on the client acted on that.
 */
test('COS-859: one guard enforces access for every route', () => {
  const LAYOUT = read('app/Home/_layout.tsx');
  const HOOK = read('hooks/use-feature-permissions.ts');

  assert.match(LAYOUT, /useEnforceScreenAccess\(\)/, 'the guard must be mounted in the Home layout');
  assert.match(HOOK, /export function useEnforceScreenAccess/);
  assert.match(HOOK, /router\.replace\('\/Home'\)/, 'a blocked route must send the patient somewhere');
});

test('COS-859: it waits for a real answer before blocking anyone', () => {
  // canShow() defaults to TRUE while the query is in flight, so acting before
  // `screens` exists would be acting on a default rather than an answer —
  // and would bounce a patient off a screen they are entitled to.
  const HOOK = read('hooks/use-feature-permissions.ts');
  assert.match(HOOK, /if \(!data\?\.screens\) return/);
});

test('COS-859: the tab root is never blocked, or the redirect would loop', () => {
  const HOOK = read('hooks/use-feature-permissions.ts');
  assert.match(HOOK, /route === 'Home' \|\| route === 'index'/);
});

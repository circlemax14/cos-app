/**
 * COS-784 — the plan shelf: contract, gating, and the iOS 26 envelope.
 *
 * `node --test` cannot resolve the `@/` alias and will not render RN, so these
 * read the sources as TEXT. That sounds weak and is not: every regression this
 * guards is a STRUCTURAL one — a flag that defaults ON, a primitive that must
 * not appear on Home, a field the API stopped sending — and those are all
 * visible in the source. The behavioural half is covered by the pure functions
 * in the backend suite, which does run real code.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');

/**
 * Source with comments stripped.
 *
 * These files document what NOT to do — the flag hook's own docblock names
 * `useIsFeatureFlagEnabled` precisely to warn against it. A `doesNotMatch` over
 * the raw text therefore fails on the warning rather than on the mistake, which
 * is worse than useless: it punishes the comment that prevents the bug. Assert
 * against the code.
 */
const code = (p) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const SCREEN = 'app/Home/plans.tsx';
const API = 'services/api/patient-plans.ts';
const FLAG = 'hooks/use-plan-shelf-flag.ts';
const HOME = 'app/Home/index.tsx';
const PROFILE = 'components/profile-content.tsx';

test('THE POINT: the flag defaults OFF, never speculatively ON', () => {
  /*
   * `useIsFeatureFlagEnabled` defaults to TRUE while the query loads. Using it
   * here would flash a PRICING surface open on every cold start during a dark
   * launch — the one place a flicker is genuinely unacceptable. The strict
   * `=== true` on the shared query is the whole point of this hook existing.
   */
  const src = code(FLAG);
  assert.match(src, /useFeatureFlags\(\)/);
  assert.match(src, /=== true/);
  assert.doesNotMatch(src, /useIsFeatureFlagEnabled/);
});

test('both entry points are gated by that same flag', () => {
  // Two entry points, one switch. If they could diverge, turning the feature
  // off would leave one of them live.
  assert.match(read(PROFILE), /planShelfEnabled && \(/);
  assert.match(read(HOME), /planShelfEnabled && \(/);
  for (const f of [PROFILE, HOME]) {
    assert.match(read(f), /usePlanShelfFlag\(\)/, `${f} must read the flag`);
  }
});

test('THE POINT: the Home tile introduces no new react-native primitive', () => {
  /*
   * app/Home/index.tsx is the file with the iOS 26 cold-mount crash history
   * (ADR-0003). The tile is built only from primitives Home already imported,
   * so the flag-off path is byte-identical to before and the flag-on path adds
   * no unfamiliar native view.
   */
  const home = read(HOME);
  const importLine = home.match(/import \{([^}]*)\} from 'react-native';/);
  assert.ok(importLine, 'Home must still import react-native as one named list');
  const imported = importLine[1].split(',').map((s) => s.trim());
  for (const p of ['Pressable', 'View', 'Text']) {
    assert.ok(imported.includes(p), `${p} should already have been imported`);
  }
  // The tile block itself uses nothing else.
  const tile = home.slice(home.indexOf('COS-784'), home.indexOf('SCRUM-279 (2026-06-03)'));
  assert.doesNotMatch(tile, /<(FlatList|SectionList|Modal|Animated|TouchableHighlight)/);
});

test('the flag hook is called unconditionally — a varying hook count is a SIGABRT', () => {
  for (const f of [HOME, PROFILE]) {
    const src = read(f);
    const call = src.match(/^\s*const planShelfEnabled = usePlanShelfFlag\(\);/m);
    assert.ok(call, `${f} must call the hook at the top level`);
    // Not inside a conditional or a callback.
    assert.doesNotMatch(src, /if \([^)]*\)\s*\{[^}]*usePlanShelfFlag/s);
  }
});

test('THE POINT: the shelf fails soft — an advisory READ may degrade', () => {
  /*
   * Deliberately the OPPOSITE of COS-777, where swallowing a failed WRITE told
   * a patient their notification toggles were saved when they were not. The
   * rule: a failed read of an advisory list may degrade to empty; a failed
   * write never may. This is a read, it grants nothing, and the endpoint
   * already degrades the same way server-side.
   */
  const src = read(API);
  assert.match(src, /catch \{\s*return EMPTY;/);
  assert.match(src, /!Array\.isArray\(data\.plans\)/, 'must shape-check, not just trust a 200');
});

test('the client does not re-sort or re-filter what the server decided', () => {
  // Ordering (cheapest first) and audience (`isVisibleTo`) are the server's.
  // Re-doing either here would be a second opinion on a settled decision, and
  // re-filtering would imply the client is a security boundary. It is not.
  const src = code(API);
  assert.doesNotMatch(src, /\.sort\(/);
  assert.doesNotMatch(src, /\.filter\(/);
});

test('the price label WINS over the figures', () => {
  // "Free forever" over a $0 plan must not also render "$0/mo".
  const src = read(API);
  const fn = src.slice(src.indexOf('export function formatPlanPrice'));
  const labelAt = fn.indexOf('displayPriceLabel');
  const centsAt = fn.indexOf('monthlyPriceCents');
  assert.ok(labelAt !== -1 && labelAt < centsAt, 'the label must be checked first');
});

test('no pricing reads as Included, not as an error or a blank', () => {
  // Agency and enterprise plans are ASSIGNED, never bought, and carry no
  // pricing at all. That is a real state, not a missing one.
  assert.match(read(API), /return 'Included'/);
});

test('THE POINT: the screen shows the trial the card now carries', () => {
  // COS-769 made a trial a property of any plan; toCard dropped it until
  // COS-784, so the most persuasive thing about a plan was invisible here.
  const src = read(SCREEN);
  assert.match(src, /trialDays !== null && plan\.trialDays > 0/);
  assert.match(src, /-day free trial/);
});

test('coming-soon renders disabled; drafts are never mentioned', () => {
  const src = code(SCREEN);
  assert.match(src, /coming-soon/);
  // Drafts are filtered by isPurchasable server-side. A client-side draft
  // branch would imply they can arrive, and invite someone to render one.
  assert.doesNotMatch(src, /=== 'draft'/);
});

test('read-only: no purchase or plan-switch affordance', () => {
  /*
   * Approved read-only for v1 on 2026-08-27 — switching plans needs Stripe,
   * and a button that cannot complete is worse than no button.
   */
  const src = code(SCREEN);
  for (const word of ['Choose this plan', 'Upgrade', 'Subscribe', 'Buy']) {
    assert.ok(!src.includes(word), `v1 must not offer "${word}"`);
  }
});

test('every conditional in the screen is a plain && gate', () => {
  // The iOS 26 envelope: no ternaries returning elements, which is where the
  // cold-mount crashes came from.
  const src = code(SCREEN);
  assert.doesNotMatch(src, /\?\s*<[A-Z]/, 'no ternary returning a component');
});

test('the route is registered as a hidden tab', () => {
  // Reached from Profile and Home, never from the tab bar.
  const layout = read('app/Home/_layout.tsx');
  const block = layout.slice(layout.indexOf('name="plans"'));
  assert.match(block.slice(0, 200), /href: null/);
});

test('plans.tsx is a flat route file, not a directory with a barrel', () => {
  // A directory under app/ with an index.ts is a documented expo-router trap.
  assert.ok(read(SCREEN).length > 0);
  assert.throws(() => read('app/Home/plans/index.tsx'));
});

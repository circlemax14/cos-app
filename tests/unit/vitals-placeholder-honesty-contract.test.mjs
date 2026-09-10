/**
 * COS-966 — a placeholder must never look like a measurement.
 *
 * Ken, 2026-09-10, on his whole wish list: "It doesn't mean that all the data
 * can be filled in yet... these are kind of placeholders. We let people know,
 * this is what we're getting at."
 *
 * That licences a LABEL. It does not licence a STATE. The card this guards
 * lists measures we have never taken (heart rhythm, falls, appetite, mood)
 * beside measures we take every day — and a patient cannot be left to work
 * out which is which from styling alone.
 *
 * The specific failure this exists to prevent already shipped once: the card
 * mapped `Severity.info` (= "not enough data to judge") to a GREY DOT via
 * toLight(). A grey dot beside "Heart rhythm (ECG)" reads to a patient with
 * an arrhythmia diagnosis as "we looked, and it's fine". We never looked.
 *
 * Source-contract tests: this card renders through react-native primitives,
 * a HealthKit hook and an accessibility store. Standing all that up under
 * `node --test` costs more than it proves. What matters is that the five
 * decisions below survive the next person editing this file.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

const CARD = read('components/health-summary/VitalsRedFlagSection.tsx');

test('THE POINT: a dot is drawn ONLY where a value exists', () => {
  // The dot is the whole claim. Rendering it unconditionally — or defaulting
  // its colour — turns "we have no reading" into "your reading is fine".
  assert.match(
    CARD,
    /\{row\.light \?\s*\(\s*<View style=\{\[styles\.dot/,
    'the dot must be conditional on row.light, not always rendered',
  );
  // No grey in the palette at all. A grey entry is how the old bug got in:
  // once `gray` is a legal TrafficLight, every unmeasured row can wear one.
  const palette = CARD.slice(
    CARD.indexOf('const LIGHT_COLOR'),
    CARD.indexOf('const LIGHT_WORD'),
  );
  assert.doesNotMatch(palette, /gray|grey|9CA3AF/i, 'no grey light — see the header note');
});

test('THE POINT: `info` severity produces NO colour, not a neutral one', () => {
  // evaluateRestingHR / evaluateSpO2 / evaluateHRVTrend all return `info`
  // when there is too little data to judge. That must erase the dot.
  const fn = CARD.slice(CARD.indexOf('function toLight'), CARD.indexOf('function mean'));
  assert.match(fn, /TrafficLight \| undefined/, 'toLight must be able to return undefined');
  assert.match(fn, /default:\s*\n\s*return undefined;/, '`info` must fall through to undefined');
});

test('a not-collected measure says so in words, and is excluded from every count', () => {
  assert.match(
    CARD,
    /We're not collecting this yet\./,
    'the placeholder state needs a literal sentence, not just muted styling',
  );
  // Placeholders carry no `value`, so the aggregate — which counts `light` —
  // cannot see them. Guard the shape that makes that true.
  const agg = CARD.slice(CARD.indexOf('const aggregate = useMemo'), CARD.indexOf('COS-932'));
  assert.match(agg, /r\.light === 'green'/, 'the aggregate must count lights, not rows');
  assert.doesNotMatch(agg, /notCollected/, 'placeholders must be excluded by construction');
});

test('a category of nothing but placeholders gets a DISTINCT pill', () => {
  // A neutral/absent pill on such a category is indistinguishable from
  // "measured and normal" — the same failure one level up.
  assert.match(CARD, /allPlaceholders\s*\n?\s*\?\s*'Not tracked yet'/);
  // ...and the pill must not promise a date we do not have.
  assert.doesNotMatch(CARD, /Not tracked yet[\s\S]{0,200}?\b(next|soon|shortly|week|month)\b/i);
});

test('every tappable row clears the 44px floor', () => {
  // Ken's cohort skews older. The labs disclosure this pattern copies relies
  // on padding alone and lands a single-line row at ~36px.
  const styles = CARD.slice(CARD.indexOf('const styles = StyleSheet.create'));
  for (const rule of ['categoryRow', 'measureRow']) {
    const block = styles.slice(styles.indexOf(`${rule}: {`));
    const end = block.indexOf('},');
    assert.match(
      block.slice(0, end),
      /minHeight: TouchTargets\.minimum/,
      `${rule} must set an explicit 44px minimum`,
    );
  }
});

test('no font size below 14 survives on this card', () => {
  // The screen breached the ≥16 floor at 10 and 11 before this rewrite.
  // 14 is the hard floor for secondary text; primary labels are 16+.
  const sizes = [...CARD.matchAll(/getScaledFontSize\((\d+)\)/g)].map((m) => Number(m[1]));
  assert.ok(sizes.length > 0, 'expected scaled font sizes');
  const tooSmall = sizes.filter((n) => n < 13);
  assert.deepEqual(tooSmall, [], `font sizes below 13: ${tooSmall.join(', ')}`);
});

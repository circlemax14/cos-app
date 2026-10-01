/**
 * The assessment detail screen (SCRUM-675, 3 of 3).
 *
 * Two things this closes:
 *   1. the self-assessment cards were tappable and went NOWHERE —
 *      `onOpenInstrument` is optional and no mount point passed it
 *   2. subscale scores had nowhere to render
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const SCREEN = codeOnly(read('app/Home/assessment-detail.tsx'));
const TRENDS = codeOnly(read('components/health-plan/SelfAssessmentTrends.tsx'));

test('EVERY card branch now routes somewhere', () => {
  // There are two card renderers behind a kill-switch. Wiring one and not the
  // other would leave half the taps dead, which is how this shipped before.
  const dead = TRENDS.match(/onOpenInstrument\?\.\(record\.instrumentId\)/g) ?? [];
  assert.deepEqual(dead, [], 'no card may call the optional prop directly');
  const wired = TRENDS.match(/openInstrument\(record\.instrumentId\)/g) ?? [];
  assert.equal(wired.length, 2, 'both card branches must be wired');
});

test('an explicit onOpenInstrument still wins', () => {
  // The prop is public API; a caller may want its own destination.
  assert.match(TRENDS, /if \(onOpenInstrument\) \{\s*onOpenInstrument\(instrumentId\)/);
});

test('history is re-sorted newest-first, not trusted', () => {
  // The trends carousel already learned this: an oldest-first response made an
  // improving patient read as worsening.
  assert.match(SCREEN, /\.sort\(\(a, b\) => \(b\.completedAt \?\? ''\)\.localeCompare\(a\.completedAt \?\? ''\)\)/);
});

test('an INCOMPLETE subscale never renders a number', () => {
  // A two-item subscale answered once is a different quantity wearing the same
  // label; beside properly scored rows it would invite the comparison it
  // cannot support.
  assert.match(SCREEN, /s\.complete \?/);
  assert.match(SCREEN, /answered\} of \$\{s\.total\} answered/);
});

test('the screen works with NO subscales — that is every instrument today', () => {
  assert.match(SCREEN, /subscales\.length > 0 \? \(/);
  // ...and still shows the latest result plus history without them.
  assert.match(SCREEN, /Your latest result/);
  assert.match(SCREEN, /Previous results/);
});

test('a patient who has never taken it gets words, not an empty screen', () => {
  assert.match(SCREEN, /haven&apos;t completed this check-in yet/);
});

// ─── COS-1189 — the redesign ───────────────────────────────────────────────

test('COS-1189 THE SCORE: the screen finally renders a number', () => {
  /*
   * It rendered ZERO numbers. A patient could take PHQ-9 six times and read
   * six words, with nothing to compare take to take.
   */
  assert.match(SCREEN, /latestScore !== null \?/)
  // COS-1196 — the label now carries the DENOMINATOR, which is the whole point:
  // "5" alone says nothing. Vishal: "it is saying elevated risk 5. What is the
  // meaning of that?"
  assert.match(SCREEN, /Score \$\{latestScore\} out of \$\{ceiling\}/)
  assert.match(SCREEN, /of \{ceiling\}/)
  // Digits must not shift as they change.
  assert.match(SCREEN, /fontVariant: \['tabular-nums'\]/)
})

test('COS-1189: `independent` beats `total`, or ADL charts a flat line', () => {
  // ADL/IADL report {independent, total} where `total` is the ITEM COUNT.
  const fn = SCREEN.match(/const scoreOf = React\.useCallback\([\s\S]*?\n  \}, \[\]\)/)
  assert.ok(fn, 'scoreOf not found')
  assert.ok(
    fn[0].indexOf('sc.independent') < fn[0].indexOf('sc.total'),
    'independent must be checked first',
  )
  // 0 is a real score; a missing one is not.
  assert.match(fn[0], /if \(!sc\) return null/)
})

test('COS-1189 THE GRAPH: oldest-first, and never from a single point', () => {
  // A line read right-to-left is a lie about direction; one dot is not a trend.
  assert.match(SCREEN, /\.reverse\(\)/)
  assert.match(SCREEN, /chartPoints\.length >= 2/)
  assert.match(SCREEN, /<TrendLineChart/)
})

test('COS-1189: the chart stays inside the iOS 26.5 envelope', () => {
  // react-native-svg is not linked in the iOS binary — every SVG chart
  // rendered as an UnimplementedView placeholder. TrendLineChart is hand-rolled
  // from Views.
  assert.doesNotMatch(SCREEN, /react-native-svg/)
  assert.doesNotMatch(SCREEN, /ActivityIndicator/)
})

test('COS-1189 THE AI SUMMARY: a failure is an apology, not a finding', () => {
  /*
   * "Nothing to report" about someone's mental health is the worst possible
   * failure mode, so unavailable text is styled as subtext.
   */
  assert.match(SCREEN, /summaryQ\.data\.available \? colors\.text : colors\.subtext/)
  assert.match(SCREEN, /Putting your summary together…/)
})

test('COS-1189: the summary is its OWN query, so it cannot block the result', () => {
  assert.match(SCREEN, /queryKey: \['assessment-history-summary', instrumentId\]/)
  assert.match(SCREEN, /enabled: instrumentId !== '' && records\.length > 0/)
})

test('COS-1196: back goes to the OPENER, never Home', () => {
  /*
   * COS-1189 used `canGoBack() ? back() : replace(gate)`. canGoBack() is TRUE
   * here, so it took back() — and this route is on the TABS navigator, where
   * popping lands on the tab stack's initial route, which is Home. The history
   * check was answering the wrong question.
   */
  assert.doesNotMatch(SCREEN, /router\.canGoBack\(\)/)
  assert.match(SCREEN, /from === 'health-trends' \? '\/Home\/health-trends' : RETAKE_GATE_ROUTE/)
  // The opener names itself, because SelfAssessmentTrends mounts on both.
  assert.match(TRENDS, /from: fromScreen/)
})

test('COS-1196: the scale comes from the instrument riskBands', () => {
  // The bands carry min/max/severity/careAction and the screen read none of it.
  assert.match(SCREEN, /scoreCeiling\(riskBands\)/)
  assert.match(SCREEN, /bandForScore\(riskBands, latestScore\)/)
  assert.match(SCREEN, /humaniseBandLabel\(/)
  // The raw kebab-case key must never reach the screen.
  assert.doesNotMatch(SCREEN, /\{latest\.band\.label\}/)
})

test('COS-1196: every history row carries its score', () => {
  // Vishal: "previous result ... it is saying just elevated risk. Why there was
  // no number?" COS-1189 put the number on the latest card only.
  const rows = SCREEN.match(/records\.slice\(1\)\.map\([\s\S]*?\n                  \)\)/)
  assert.ok(rows, 'history rows not found')
  assert.match(rows[0], /const sc = scoreOf\(r\)/)
  assert.match(rows[0], /bandForScore\(riskBands, sc\)/)
})

test('COS-1196: severity colours the BAND and not the direction', () => {
  /*
   * Higher is worse on falls-12 and BETTER on wellbeing-5, so colouring the
   * arrow would be wrong on half the catalogue.
   */
  assert.match(SCREEN, /backgroundColor: severityColor\(severity\)/)
  const deltaBlock = SCREEN.match(/\{delta \? \([\s\S]*?\) : null\}/)
  assert.ok(deltaBlock)
  assert.doesNotMatch(deltaBlock[0], /severityColor/)
})

test('COS-1196: the loading state looks like loading', () => {
  // It was one grey sentence, which reads as content rather than as waiting.
  assert.match(SCREEN, /accessibilityRole="progressbar"/)
  assert.doesNotMatch(SCREEN, /ActivityIndicator/)
})

test('COS-1189: the title is centred with a matching gutter', () => {
  assert.match(SCREEN, /textAlign: 'center'/)
  const gutters = SCREEN.match(/style=\{styles\.back\}/g) ?? []
  assert.equal(gutters.length, 2, 'both gutters must exist or the title is off-centre')
})

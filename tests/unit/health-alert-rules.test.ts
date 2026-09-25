/**
 * COS-1112 — Health Alerts thresholds.
 *
 * The load-bearing assertion in this file is not any single threshold: it is
 * that an ABSENT reading never becomes green. A crisis indicator that reports
 * "nothing flagged" to a patient with no data is a false reassurance, and it
 * is the one failure mode that would make this feature worse than not shipping
 * it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PENDING_THRESHOLDS,
  SOURCES,
  UNMONITORED,
  alertColor,
  alertShouldFlash,
  evaluateBloodPressure,
  evaluateGad7,
  evaluateGlucoseMgDl,
  evaluatePainScore,
  evaluatePhq9,
  evaluateRespirationRate,
  evaluateSpo2Percent,
  evaluateTemperatureCelsius,
  rollUpAlerts,
} from '../../lib/health-alert-rules.ts';

test('THE POINT: nothing measured is NOT green', () => {
  const r = rollUpAlerts([null, null, null]);
  assert.equal(r.level, null, 'no readings must not resolve to a level');
  assert.equal(r.measuredCount, 0);
  // And the colour must not be the reassuring one.
  assert.notEqual(alertColor(null), alertColor('none'));
});

test('every evaluator returns null for an absent or unusable reading', () => {
  const absent = [undefined, null, Number.NaN, Number.POSITIVE_INFINITY];
  for (const v of absent) {
    assert.equal(evaluateGlucoseMgDl(v), null);
    assert.equal(evaluateSpo2Percent(v), null);
    assert.equal(evaluateRespirationRate(v), null);
    assert.equal(evaluateTemperatureCelsius(v), null);
    assert.equal(evaluatePhq9(v), null);
    assert.equal(evaluateGad7(v), null);
    assert.equal(evaluatePainScore(v), null);
    assert.equal(evaluateBloodPressure(v, 80), null);
    assert.equal(evaluateBloodPressure(120, v), null);
  }
});

test('BP: Ken’s bands, and each limb of the crisis test fires alone', () => {
  assert.equal(evaluateBloodPressure(118, 76)?.level, 'none');
  assert.equal(evaluateBloodPressure(140, 88)?.level, 'moderate');
  assert.equal(evaluateBloodPressure(130, 92)?.level, 'moderate');
  assert.equal(evaluateBloodPressure(179, 109)?.level, 'moderate');
  // Systolic alone.
  assert.equal(evaluateBloodPressure(182, 78)?.level, 'critical');
  // Diastolic alone — the case a single combined comparison would miss.
  assert.equal(evaluateBloodPressure(130, 124)?.level, 'critical');
});

test('BP moderate here is what the MONITORING rules call red — the scales differ on purpose', () => {
  // vitals-red-flag-rules calls 140/90 red. This module calls it moderate and
  // reserves critical for a hypertensive crisis. If these ever converge,
  // someone has merged two different clinical questions.
  assert.equal(evaluateBloodPressure(140, 90)?.level, 'moderate');
});

test('glucose: severe hypo and severe hyper are both critical', () => {
  assert.equal(evaluateGlucoseMgDl(54)?.level, 'critical');
  assert.equal(evaluateGlucoseMgDl(301)?.level, 'critical');
  assert.equal(evaluateGlucoseMgDl(150)?.level, 'moderate');
  assert.equal(evaluateGlucoseMgDl(65)?.level, 'moderate');
  assert.equal(evaluateGlucoseMgDl(90)?.level, 'none');
});

test('REGRESSION COS-1111: a mmol/L value must not be read as mg/dL', () => {
  // 10.0 mmol/L IS 180 mg/dL — genuinely high. Passed raw it looks like 10,
  // which this module reports as a severe LOW. That inversion shipped to
  // production once already, so the guard lives here too: the caller owes us
  // mg/dL, and the name of the function says so.
  assert.equal(evaluateGlucoseMgDl(10)?.level, 'critical');
  assert.match(evaluateGlucoseMgDl(10)?.reason ?? '', /hypoglyc/i);
  // The real value, correctly converted, is the opposite verdict.
  assert.equal(evaluateGlucoseMgDl(180)?.level, 'moderate');
});

test('SpO2: a 0..1 fraction is rejected, not reported as a desaturation', () => {
  // HealthKit returns a fraction. Reporting 0.97 as "1% — severe hypoxaemia"
  // would be the COS-1111 bug in a new metric.
  assert.equal(evaluateSpo2Percent(0.97), null);
  assert.equal(evaluateSpo2Percent(1), null);
  assert.equal(evaluateSpo2Percent(97)?.level, 'none');
  assert.equal(evaluateSpo2Percent(92)?.level, 'moderate');
  assert.equal(evaluateSpo2Percent(89)?.level, 'critical');
});

test('respiration: critical at both ends', () => {
  assert.equal(evaluateRespirationRate(9)?.level, 'critical');
  assert.equal(evaluateRespirationRate(26)?.level, 'critical');
  assert.equal(evaluateRespirationRate(22)?.level, 'moderate');
  assert.equal(evaluateRespirationRate(16)?.level, 'none');
});

test('temperature is CELSIUS — a Fahrenheit value would be absurd, not silently graded', () => {
  assert.equal(evaluateTemperatureCelsius(36.8)?.level, 'none');
  assert.equal(evaluateTemperatureCelsius(38.5)?.level, 'moderate');
  assert.equal(evaluateTemperatureCelsius(40.5)?.level, 'critical');
  // 98.6°F passed by mistake grades critical, which is loud and wrong — the
  // opposite of silent. Documented so nobody "fixes" it by widening the band.
  assert.equal(evaluateTemperatureCelsius(98.6)?.level, 'critical');
});

test('PHQ-9 and GAD-7 use their published bands', () => {
  assert.equal(evaluatePhq9(4)?.level, 'none');
  assert.equal(evaluatePhq9(12)?.level, 'moderate');
  assert.equal(evaluatePhq9(21)?.level, 'critical');
  assert.equal(evaluateGad7(4)?.level, 'none');
  assert.equal(evaluateGad7(11)?.level, 'moderate');
  assert.equal(evaluateGad7(16)?.level, 'critical');
});

test('pain: out-of-range input is rejected rather than clamped', () => {
  assert.equal(evaluatePainScore(11), null);
  assert.equal(evaluatePainScore(-1), null);
  assert.equal(evaluatePainScore(8)?.level, 'critical');
  assert.equal(evaluatePainScore(5)?.level, 'moderate');
  assert.equal(evaluatePainScore(2)?.level, 'none');
});

test('roll-up takes the worst level and orders firing verdicts worst-first', () => {
  const r = rollUpAlerts([
    evaluateSpo2Percent(97),
    evaluateBloodPressure(145, 92),
    evaluateRespirationRate(28),
    null,
  ]);
  assert.equal(r.level, 'critical');
  assert.equal(r.firing[0].level, 'critical');
  assert.equal(r.firing[1].level, 'moderate');
  assert.equal(r.clear.length, 1);
  assert.equal(r.measuredCount, 3);
});

test('all-clear resolves to none, and only critical flashes', () => {
  const r = rollUpAlerts([evaluateSpo2Percent(98), evaluateBloodPressure(118, 74)]);
  assert.equal(r.level, 'none');
  assert.equal(r.firing.length, 0);
  assert.equal(alertShouldFlash('none'), false);
  assert.equal(alertShouldFlash('moderate'), false);
  assert.equal(alertShouldFlash('critical'), true);
  assert.equal(alertShouldFlash(null), false);
});

test('one unusable reading among good ones does not drag the roll-up to unknown', () => {
  const r = rollUpAlerts([evaluateSpo2Percent(0.97), evaluateBloodPressure(118, 74)]);
  assert.equal(r.level, 'none');
  assert.equal(r.measuredCount, 1);
});

// ─── COS-1115 — the badge must never be invisible ────────────────────────
import { readFileSync } from 'node:fs';

const RULES = readFileSync(
  new URL('../../lib/health-alert-rules.ts', import.meta.url),
  'utf8',
);
const BADGE = readFileSync(
  new URL('../../components/health-summary/HealthAlertBadge.tsx', import.meta.url),
  'utf8',
);

test('THE POINT: the badge has no early return null — absence must be unambiguous', () => {
  // It returned null while loading. A component that renders nothing on a
  // state it reaches normally cannot be tested from the outside: "I don't see
  // it" is then indistinguishable from a stale build, a flag being off, or a
  // crash. Grey "Checking…" is a state you can point at.
  assert.doesNotMatch(BADGE, /if \(isLoading\) return null/);
  assert.match(BADGE, /React\.JSX\.Element \{/, 'return type must not admit null');
});

test('loading is never rendered as green', () => {
  // The one transition worth preventing is a reassuring green that becomes red
  // a second later.
  assert.match(BADGE, /isLoading \? ALERT_COLOR_UNKNOWN : alertColor\(level\)/);
  assert.match(BADGE, /!isLoading && alertShouldFlash\(level\)/);
});

// ─── COS-1116 — Ken's emblem, not ours ───────────────────────────────────
const ICON = readFileSync(
  new URL('../../components/ui/medical-alert-icon.tsx', import.meta.url),
  'utf8',
);

test('THE POINT: the badge uses the medical-alert emblem Ken supplied', () => {
  // He sent the artwork and asked for that mark specifically. Substituting the
  // app's own Health Status icon loses the thing that makes it worth using:
  // a paramedic or carer recognises the universal emblem untaught.
  assert.match(BADGE, /MedicalAlertIcon/);
  assert.doesNotMatch(BADGE, /HealthStatusIcon/);
});

test('the Star of Life has SIX arms — three bars at 60°, not eight', () => {
  // Six is definitional (one per link in the chain of survival). An eight-arm
  // star is a different symbol entirely.
  assert.match(ICON, /ARM_ROTATIONS = \[0, 60, 120\]/);
});

test('the hexagon is stroked, not filled — the star sits on the page', () => {
  assert.match(ICON, /d=\{HEX\}\s+fill="none"/);
});

test('colour is a parameter, so the three variants cannot drift apart', () => {
  // Ken sent green/amber/red as separate images. Same geometry, three hues.
  assert.match(ICON, /color: string/);
  assert.doesNotMatch(ICON, /#(EF4444|FF0000|DC2626)/i);
});

test('only red flashes, and it never fades to invisible', () => {
  // A hard on/off square wave is a migraine and seizure risk. The mark stays
  // legible at every instant of the cycle.
  assert.match(ICON, /outputRange: \[1, 0\.45\]/);
  assert.match(BADGE, /flashing=\{flashing\}/);
});

test("COS-1123: the caption is Ken's label in EVERY state", () => {
  // I had made this conditional so the word "CRITICAL" never sat over a green
  // mark. Overruled by Vishal, 2026-09-25, and the objection was weaker than it
  // looked: the caption names the instrument, it does not report a reading.
  assert.match(BADGE, /const caption = 'CRITICAL HEALTH ALERTS'/);
  assert.doesNotMatch(BADGE, /\? 'CRITICAL HEALTH ALERTS' :/);
});

test('the state is still carried in WORDS, not by the caption or colour alone', () => {
  // With a fixed caption, the small line below is the only textual signal of
  // level. Losing it would leave colour as the sole carrier, which fails older
  // patients, glare and colour-blindness.
  assert.match(BADGE, /alertWord\(level\)/);
});

// ─── COS-1118 — placement ────────────────────────────────────────────────
const SCREEN = readFileSync(
  new URL('../../app/Home/health-alerts.tsx', import.meta.url),
  'utf8',
);
const PLAN = readFileSync(new URL('../../app/Home/plan.tsx', import.meta.url), 'utf8');

test('THE POINT: the title is centred by a MIRRORED spacer, not by the leftover space', () => {
  // With only a back button and a flex:1 title, the title centres in what is
  // left beside the arrow — visibly right of the screen's centre. A spacer of
  // the same width on the right is what actually centres it.
  const slots = SCREEN.match(/style=\{styles\.navSlot\}/g) ?? [];
  assert.equal(slots.length, 2, 'back button and its mirror must both use navSlot');
  assert.match(SCREEN, /navSlot: \{\s*width: NAV_SLOT/);
});

test('the emblem sits on the Health Status title line, absolutely positioned', () => {
  // Laying them out as a row would centre the PAIR and shove the title left by
  // half the badge width — so the heading would move when a flag flips.
  assert.match(PLAN, /alertCorner: \{\s*position: 'absolute'/);
  assert.match(PLAN, /<View style=\{styles\.titleRow\}>/);
});

test('the detail screen shows the same emblem as the badge', () => {
  assert.match(SCREEN, /MedicalAlertIcon/);
});

// ─── COS-1119 — coverage against Ken's document ──────────────────────────
const HOOK = readFileSync(
  new URL('../../hooks/use-health-alerts.ts', import.meta.url),
  'utf8',
);

test('THE POINT: every rule that exists is actually CALLED', () => {
  // evaluatePainScore existed, was tested, and nothing invoked it — pain was
  // absent from the roll-up while looking covered in code and green in tests.
  // That is the worst shape a gap can take, so the guard is mechanical.
  const defined = [...RULES.matchAll(/export function (evaluate\w+)/g)].map((m) => m[1]);
  assert.ok(defined.length >= 8, `only found ${defined.length} rules — the scan broke`);
  const uncalled = defined.filter((fn) => !HOOK.includes(`${fn}(`));
  assert.deepEqual(uncalled, [], 'these rules are dead code — wire them or declare them uncovered');
});

test('pain reads the NEWEST point — the series is oldest-first', () => {
  // The backend reads with ScanIndexForward: true. Taking points[0] would
  // grade a month-old pain score as today's.
  assert.match(HOOK, /painHistory\.points\.length - 1/);
});

test("the metrics Ken's document lists and we do NOT do are named to the patient", () => {
  // The evaluated half is guarded by the no-dead-rules test above. This is the
  // other half: a light that silently covers 8 of Ken's 12+ metrics, while
  // looking like it covers all of them, is worse than no light.
  const declared = UNMONITORED.map((u) => u.metric.toLowerCase()).join(' ');
  for (const missing of ['lab', 'cognition', 'fall', 'daily living']) {
    assert.ok(declared.includes(missing), `${missing} must be declared uncovered`);
  }
  // And each must say WHY, not just that it is absent.
  for (const u of UNMONITORED) {
    assert.ok(u.why.length > 10, `${u.metric} needs a reason`);
  }
});

test('all three truncated cells in the PDF are recorded, not guessed', () => {
  const joined = PENDING_THRESHOLDS.join(' ').toLowerCase();
  assert.ok(joined.includes('hypotension'));
  assert.ok(joined.includes('hyperglyc'));
  assert.ok(joined.includes('hypothermia'));
});

test("the sources list covers every rule's citation", () => {
  assert.ok(SOURCES.length >= 8, 'one citation per rule family');
  assert.equal(new Set(SOURCES).size, SOURCES.length, 'no duplicate citations');
});

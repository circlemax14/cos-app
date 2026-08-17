/**
 * Grouping clinic labs and Apple Health metrics by body system / organ.
 *
 * The grouping itself is a lookup. What is dangerous is the matching, because
 * every failure is silent and plausible:
 *
 *   - a substring test that puts "fasting glucose" under Liver, because "ast"
 *     is inside "fasting"
 *   - "Hemoglobin A1c" landing in Blood with the haemoglobins instead of
 *     Metabolic, because a broader pattern was tested first
 *   - "Urine Microalbumin" reading as hepatic albumin
 *   - a real lab result quietly vanishing because nothing matched
 *
 * So most of these tests are about ORDER and BOUNDARIES, not about the happy
 * path. Fixtures use the three code namespaces that actually reach the screen:
 * hk-* from services/health.ts, LOINC from the backend tracked list, and
 * report-<slug> from hooks/use-report-trends.ts.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  bodySystemForMetric,
  groupTrendsByBodySystem,
} from './body-system-grouping.ts';

const sys = (metricCode, metricName) => bodySystemForMetric({ metricCode, metricName });

test('every Apple Health code resolves — none fall to Other', () => {
  // These 17 are the complete set in services/health.ts. If one is added there
  // without a line here it silently becomes "Other", which on an Apple-Health
  // account is a visibly broken screen.
  const HK = {
    'hk-bp-systolic': 'heart', 'hk-bp-diastolic': 'heart', 'hk-heart-rate': 'heart',
    'hk-resting-hr': 'heart', 'hk-walking-hr': 'heart', 'hk-hrv': 'heart',
    'hk-spo2': 'lungs', 'hk-resp-rate': 'lungs',
    'hk-glucose': 'metabolic',
    'hk-weight': 'body', 'hk-bmi': 'body', 'hk-body-temp': 'body',
    'hk-steps': 'activity', 'hk-active-energy': 'activity', 'hk-distance-walking': 'activity',
    'hk-flights': 'activity', 'hk-exercise-time': 'activity',
    'hk-sleep': 'sleep',
  };
  for (const [code, expected] of Object.entries(HK)) {
    assert.equal(sys(code, ''), expected, `${code} must map to ${expected}`);
  }
});

test('every backend tracked LOINC resolves', () => {
  // The tracked list in cos-backend trend-computation.service.ts.
  const LOINC = {
    '4548-4': 'metabolic', '1558-6': 'metabolic',
    '85354-9': 'heart', '2093-3': 'heart', '2085-9': 'heart',
    '13457-7': 'heart', '2571-8': 'heart',
    '33914-3': 'kidneys', '39156-5': 'body',
  };
  for (const [code, expected] of Object.entries(LOINC)) {
    assert.equal(sys(code, ''), expected, `LOINC ${code} must map to ${expected}`);
  }
});

test('THE SUBSTRING TRAP: "fasting glucose" is metabolic, not liver', () => {
  // "ast" is inside "fasting". Without a word boundary this reads as the liver
  // enzyme AST and a diabetes marker lands under Liver.
  assert.equal(sys('report-fasting-glucose', 'Fasting Glucose'), 'metabolic');
  assert.equal(sys('report-ast', 'AST'), 'liver');
  assert.equal(sys('report-ast-sgot', 'AST (SGOT)'), 'liver');
});

test('THE SUBSTRING TRAP: "bilirubin" is not BUN', () => {
  // "bun" is inside "bilirubin".
  assert.equal(sys('report-total-bilirubin', 'Total Bilirubin'), 'liver');
  assert.equal(sys('report-bun', 'BUN'), 'kidneys');
});

test('ORDER: A1c is metabolic even though it contains "hemoglobin"', () => {
  assert.equal(sys('report-hemoglobin-a1c', 'Hemoglobin A1c'), 'metabolic');
  assert.equal(sys('report-haemoglobin-a1c', 'Haemoglobin A1c'), 'metabolic');
  assert.equal(sys('4548-4', 'Hemoglobin A1C'), 'metabolic');
  // ...while plain haemoglobin is still Blood.
  assert.equal(sys('report-hemoglobin', 'Hemoglobin'), 'blood');
  assert.equal(sys('report-hgb', 'HGB'), 'blood');
});

test('ORDER: urine microalbumin is kidney, plain albumin is liver', () => {
  assert.equal(sys('report-microalbumin', 'Microalbumin'), 'kidneys');
  assert.equal(sys('report-urine-albumin', 'Urine Albumin'), 'kidneys');
  assert.equal(sys('report-albumin-creatinine-ratio', 'Albumin/Creatinine Ratio'), 'kidneys');
  assert.equal(sys('report-albumin', 'Albumin'), 'liver');
  assert.equal(sys('1751-7', 'Albumin'), 'liver');
});

test('a realistic CMP + CBC + lipid panel lands where a clinician would expect', () => {
  const EXPECT = {
    'Sodium': 'kidneys', 'Potassium': 'kidneys', 'Chloride': 'kidneys',
    'Creatinine': 'kidneys', 'eGFR': 'kidneys',
    'ALT': 'liver', 'Alkaline Phosphatase': 'liver', 'Total Protein': 'liver',
    'Platelets': 'blood', 'WBC': 'blood', 'Hematocrit': 'blood', 'MCV': 'blood',
    'Neutrophils': 'blood',
    'Total Cholesterol': 'heart', 'HDL Cholesterol': 'heart',
    'LDL Cholesterol': 'heart', 'Triglycerides': 'heart',
    'TSH': 'metabolic', 'Insulin': 'metabolic',
    'C-Reactive Protein': 'immune', 'ESR': 'immune',
    'Vitamin D': 'nutrition', 'Vitamin B12': 'nutrition', 'Ferritin': 'nutrition',
  };
  for (const [name, expected] of Object.entries(EXPECT)) {
    assert.equal(
      sys(`report-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, name),
      expected,
      `${name} should be ${expected}`,
    );
  }
});

test('matching works from the CODE alone when the name is missing', () => {
  // report-* codes are a slug of the analyte name, so they are still matchable.
  assert.equal(sys('report-total-cholesterol', undefined), 'heart');
  assert.equal(sys('report-vitamin-d', ''), 'nutrition');
});

test('an unrecognised analyte goes to Other and is never dropped', () => {
  const odd = { metricCode: 'report-zzz-9', metricName: 'Zylophosphamide Index' };
  assert.equal(bodySystemForMetric(odd), null);
  const groups = groupTrendsByBodySystem([{ metricCode: 'hk-steps', metricName: 'Steps' }, odd]);
  const other = groups.find((g) => g.label === 'Other');
  assert.ok(other, 'an Other bucket must exist');
  assert.equal(other.metrics.length, 1);
  assert.equal(groups[groups.length - 1].label, 'Other', 'and it goes last');
});

test('each metric appears exactly once across all groups', () => {
  const metrics = [
    { metricCode: 'hk-heart-rate', metricName: 'Heart Rate' },
    { metricCode: '4548-4', metricName: 'Hemoglobin A1C' },
    { metricCode: 'report-albumin', metricName: 'Albumin' },
    { metricCode: 'hk-sleep', metricName: 'Sleep' },
    { metricCode: 'report-mystery', metricName: 'Mystery' },
  ];
  const out = groupTrendsByBodySystem(metrics).flatMap((g) => g.metrics.map((m) => m.metricCode));
  assert.equal(out.length, 5, 'nothing dropped');
  assert.equal(new Set(out).size, 5, 'nothing duplicated');
});

test('groups come back in the fixed display order', () => {
  const groups = groupTrendsByBodySystem([
    { metricCode: 'hk-sleep' },
    { metricCode: 'hk-steps' },
    { metricCode: 'hk-heart-rate' },
    { metricCode: 'report-alt', metricName: 'ALT' },
  ]);
  assert.deepEqual(groups.map((g) => g.label), ['Heart & Circulation', 'Liver', 'Activity & Fitness', 'Sleep']);
});

test('order WITHIN a group is preserved', () => {
  // The caller sorts by how interesting a trend is; regrouping must not reshuffle.
  const groups = groupTrendsByBodySystem([
    { metricCode: 'hk-heart-rate', metricName: 'a' },
    { metricCode: 'hk-hrv', metricName: 'b' },
  ]);
  assert.deepEqual(groups[0].metrics.map((m) => m.metricName), ['a', 'b']);
});

test('NOTHING recognisable ⇒ one unlabelled group, i.e. today\'s flat carousel', () => {
  const groups = groupTrendsByBodySystem([
    { metricCode: 'report-aaa', metricName: 'Aaa' },
    { metricCode: 'report-bbb', metricName: 'Bbb' },
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].label, '');
  assert.equal(groups[0].system, null);
  assert.equal(groups[0].metrics.length, 2);
});

test('junk input does not crash or mis-place', () => {
  for (const m of [null, undefined, {}, { metricCode: '' }, { metricName: '   ' }, { metricCode: '???' }]) {
    assert.equal(bodySystemForMetric(m), null, `${JSON.stringify(m)} must be unplaceable, not wrong`);
  }
  assert.deepEqual(groupTrendsByBodySystem([]), []);
});

test('an exact code always beats the name pattern', () => {
  // hk-glucose is metabolic by code. If a name ever contradicted the code, the
  // code is the authority — it is the thing we actually control.
  assert.equal(sys('hk-glucose', 'Blood Glucose'), 'metabolic');
  assert.equal(sys('39156-5', 'BMI'), 'body');
});

// ─── Added 2026-08-16, when Ken's LOINC sources arrived ──────────────────
//
// [TOP2000] LOINC Mapper's Guide to the Top 2000+ US Lab Tests v1.6
// [HCUP]    AHRQ HCUP LOINC codes for lab data (26 core tests + ranges)

test('THE HOLE THIS CLOSED: a FHIR lab with NO display name still groups', () => {
  // BY_CODE runs before BY_NAME, but when an Observation carries no name the
  // fallback has only the bare code to match on — "1920 8" matches no pattern
  // and the result lands in Other. Every code here was already handled BY NAME;
  // none was handled when the name was absent. That is the whole point of
  // having expanded the code table, so it is the test that must not regress.
  assert.equal(sys('1920-8', undefined), 'liver');    // AST      [HCUP 4]
  assert.equal(sys('3094-0', undefined), 'kidneys');  // BUN      [HCUP 25]
  assert.equal(sys('718-7', undefined), 'blood');     // Hgb      [HCUP 13]
  assert.equal(sys('10839-9', undefined), 'heart');   // Troponin [HCUP 24]
  assert.equal(sys('2703-7', undefined), 'lungs');    // pO2      [HCUP 21]
  assert.equal(sys('1989-3', undefined), 'nutrition');// Vit D    [TOP2000]
});

test('hs-CRP is a CARDIAC marker, not an inflammatory one', () => {
  // [TOP2000] separates these by stated clinical use: 1988-5 assesses severity
  // of inflammatory disease; 30522-7 assesses cardiovascular risk. Carrying
  // both under Immune filed a patient's cardiac-risk number under an
  // inflammation heading. Regenstrief's distinction, not ours.
  assert.equal(sys('1988-5', undefined), 'immune');
  assert.equal(sys('30522-7', undefined), 'heart');
});

test('both RDW codes resolve — they are one test in two units', () => {
  // [TOP2000] warns explicitly that these are the same measurement reported as
  // a percentage (788-0) and as a volume in fL (21000-5), and must not be
  // confused. Carrying only one silently drops the other lab's result.
  assert.equal(sys('21000-5', undefined), 'blood');
  assert.equal(sys('788-0', undefined), 'blood');
});

test('all three TSH generations land together', () => {
  // [TOP2000] calls 3016-3 obsolete and 11579-0 / 11580-8 the assays in real
  // use. The distinction matters to the lab, never to the patient reading it.
  for (const code of ['3016-3', '11579-0', '11580-8']) {
    assert.equal(sys(code, undefined), 'metabolic', `TSH ${code}`);
  }
});

test('specimen variants of one analyte never split across groups', () => {
  // [HCUP] gives serum and whole-blood codes for the same test. A patient with
  // one drawn each way must not see the analyte under two headings.
  assert.equal(sys('2951-2', undefined), sys('2947-0', undefined));   // Sodium
  assert.equal(sys('2823-3', undefined), sys('6298-4', undefined));   // Potassium
  assert.equal(sys('17861-6', undefined), sys('2000-8', undefined));  // Calcium
  assert.equal(sys('1975-2', undefined), sys('14631-6', undefined));  // Bilirubin
  assert.equal(sys('3094-0', undefined), sys('14937-7', undefined));  // BUN
  assert.equal(sys('13969-1', undefined), sys('32673-6', undefined)); // CK-MB
});

test('the added codes did not break name matching for OCR reports', () => {
  // report-* codes come from slugifying whatever the lab printed. They must
  // still resolve, since on PDF-upload accounts they are most of the screen.
  assert.equal(sys('report-fasting-glucose', 'Fasting Glucose'), 'metabolic');
  assert.equal(sys('report-urine-microalbumin', 'Urine Microalbumin'), 'kidneys');
  assert.equal(sys('report-hemoglobin-a1c', 'Hemoglobin A1c'), 'metabolic');
});

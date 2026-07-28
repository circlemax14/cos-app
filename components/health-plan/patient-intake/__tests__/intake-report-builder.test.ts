/**
 * intake-report-builder.test.ts — pins the pure helper's boundaries.
 *
 * Why this exists: the report screen and the share-PDF flow both consume
 * buildReport()/screener helpers. A silent scale change or a key rename in
 * cos-backend/src/config/intake-questions.ts would otherwise regress Ken's
 * clinical view on device without any test signal. These assertions lock the
 * canonical group ordering, missing-answer handling, screener-row exclusion,
 * and score thresholds.
 *
 * Uses node:test to match the existing cos-app tests/unit/*.test.ts style.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildReport,
  phq2Score,
  gad2Score,
  pss4Score,
  lsns6AbbrevScore,
  formatAnswer,
  VACCINES_INTAKE_ENABLED,
} from '../intake-report-builder';
import type {
  IntakeAnswerValue,
  IntakeQuestion,
  IntakeSection,
  PatientIntakeRecord,
} from '@/types/patient-intake';

// ── Fixture builders ────────────────────────────────────────────────────────

function mkQuestion(
  key: string,
  section: IntakeSection,
  prompt: string,
  extras: Partial<IntakeQuestion> = {},
): IntakeQuestion {
  return {
    key,
    section,
    prompt,
    type: 'text',
    ...extras,
  };
}

function mkIntake(
  answers: Record<string, IntakeAnswerValue> = {},
): PatientIntakeRecord {
  return {
    userId: 'test-user',
    version: 1,
    status: 'complete',
    startedAt: '2026-07-01T00:00:00.000Z',
    completedAt: '2026-07-01T00:30:00.000Z',
    answers,
  };
}

// Full question bank spanning every group + every screener. Kept together so
// the mapping assertions below are anchored to a single source of truth.
function fullQuestionBank(): IntakeQuestion[] {
  return [
    // demographics
    mkQuestion('sex_at_birth', 'body', 'Sex at birth', {
      type: 'single',
      options: [
        { value: 'female', label: 'Female' },
        { value: 'male', label: 'Male' },
      ],
    }),
    mkQuestion('height_in', 'body', 'Height (in)', { type: 'number' }),
    mkQuestion('weight_lb', 'body', 'Weight (lb)', { type: 'number' }),
    // conditions-meds
    mkQuestion('conditions', 'body', 'Conditions', { type: 'add_list' }),
    mkQuestion('medications', 'body', 'Medications', { type: 'add_list' }),
    mkQuestion('allergies', 'body', 'Allergies', { type: 'add_list' }),
    mkQuestion('surgeries', 'body', 'Surgeries', { type: 'add_list' }),
    mkQuestion('family_history', 'body', 'Family history', { type: 'text' }),
    // lifestyle
    mkQuestion('tobacco_use', 'body', 'Tobacco use', {
      type: 'single',
      options: [{ value: 'never', label: 'Never' }],
    }),
    mkQuestion('alcohol_use', 'body', 'Alcohol use', {
      type: 'single',
      options: [{ value: 'never', label: 'Never' }],
    }),
    mkQuestion('sleep_hours', 'body', 'Sleep (hours/night)', { type: 'number' }),
    mkQuestion('exercise_minutes_weekly', 'body', 'Exercise (min/week)', {
      type: 'number',
    }),
    // mental-health data rows
    mkQuestion('mental_health_dx', 'mind', 'Mental health diagnoses', {
      type: 'text',
    }),
    mkQuestion('mental_health_treatment', 'mind', 'Currently in treatment?', {
      type: 'single',
      options: [
        { value: 'yes', label: 'Yes' },
        { value: 'no', label: 'No' },
      ],
    }),
    mkQuestion('coping_strategies', 'mind', 'What helps you cope?', {
      type: 'text',
    }),
    // mental-health screener keys (must NOT surface as rows)
    mkQuestion('phq2_1_interest', 'mind', 'Little interest', {
      type: 'scale',
      screener: 'phq2',
    }),
    mkQuestion('phq2_2_down', 'mind', 'Feeling down', {
      type: 'scale',
      screener: 'phq2',
    }),
    mkQuestion('gad2_1_nervous', 'mind', 'Feeling nervous', {
      type: 'scale',
      screener: 'gad2',
    }),
    mkQuestion('gad2_2_worry', 'mind', "Can't stop worrying", {
      type: 'scale',
      screener: 'gad2',
    }),
    mkQuestion('pss4_1_unable', 'mind', 'Unable to control things', {
      type: 'scale',
      screener: 'pss4',
    }),
    // social-support data rows
    mkQuestion('living_situation', 'life', 'Living situation', { type: 'text' }),
    mkQuestion('caregiver_role', 'life', 'Caregiver role', { type: 'text' }),
    mkQuestion('help_available', 'life', 'Help available', { type: 'text' }),
    mkQuestion('recent_life_events', 'life', 'Recent life events', {
      type: 'text',
    }),
    mkQuestion('cultural_faith_notes', 'life', 'Cultural / faith notes', {
      type: 'text',
    }),
    mkQuestion('advance_directives', 'life', 'Advance directives', {
      type: 'text',
    }),
    // social-support screener keys (must NOT surface as rows)
    mkQuestion('lsns6_family_contact', 'life', 'Family contact frequency', {
      type: 'scale',
      screener: 'lsns6',
    }),
    mkQuestion('lsns6_friend_contact', 'life', 'Friend contact frequency', {
      type: 'scale',
      screener: 'lsns6',
    }),
    // work-finances
    mkQuestion('employment', 'life', 'Employment', { type: 'text' }),
    mkQuestion('financial_comfort', 'life', 'Financial comfort', {
      type: 'scale',
      options: [
        { value: 1, label: 'Very tight' },
        { value: 3, label: 'Getting by' },
        { value: 5, label: 'Very comfortable' },
      ],
    }),
  ];
}

// ── 1. phq2Score ─────────────────────────────────────────────────────────────

test('phq2Score: sum >= 3 ⇒ positive screen', () => {
  const r = phq2Score({ phq2_1_interest: 2, phq2_2_down: 2 });
  assert.ok(r);
  assert.equal(r!.sum, 4);
  assert.equal(r!.max, 6);
  assert.equal(r!.label, 'Positive screen');
  assert.equal(r!.interpretation, 'positive');
});

test('phq2Score: boundary — sum === 3 is positive', () => {
  const r = phq2Score({ phq2_1_interest: 3, phq2_2_down: 0 });
  assert.ok(r);
  assert.equal(r!.sum, 3);
  assert.equal(r!.interpretation, 'positive');
});

test('phq2Score: boundary — sum === 2 is below-threshold', () => {
  const r = phq2Score({ phq2_1_interest: 1, phq2_2_down: 1 });
  assert.ok(r);
  assert.equal(r!.sum, 2);
  assert.equal(r!.interpretation, 'below-threshold');
  assert.equal(r!.label, 'Below threshold');
});

test('phq2Score: either key missing ⇒ null', () => {
  assert.equal(phq2Score({ phq2_1_interest: 2 }), null);
  assert.equal(phq2Score({ phq2_2_down: 1 }), null);
  assert.equal(phq2Score({}), null);
});

test('phq2Score: non-numeric or null value ⇒ null', () => {
  assert.equal(phq2Score({ phq2_1_interest: 'nope', phq2_2_down: 1 }), null);
  assert.equal(phq2Score({ phq2_1_interest: null, phq2_2_down: 1 }), null);
});

// ── 2. gad2Score (mirror) ────────────────────────────────────────────────────

test('gad2Score: sum >= 3 ⇒ positive screen', () => {
  const r = gad2Score({ gad2_1_nervous: 2, gad2_2_worry: 1 });
  assert.ok(r);
  assert.equal(r!.sum, 3);
  assert.equal(r!.max, 6);
  assert.equal(r!.interpretation, 'positive');
  assert.equal(r!.label, 'Positive screen');
});

test('gad2Score: sum < 3 ⇒ below-threshold', () => {
  const r = gad2Score({ gad2_1_nervous: 1, gad2_2_worry: 1 });
  assert.ok(r);
  assert.equal(r!.interpretation, 'below-threshold');
  assert.equal(r!.label, 'Below threshold');
});

test('gad2Score: boundary — sum === 2 is below-threshold', () => {
  const r = gad2Score({ gad2_1_nervous: 2, gad2_2_worry: 0 });
  assert.ok(r);
  assert.equal(r!.interpretation, 'below-threshold');
});

test('gad2Score: either key missing or non-numeric ⇒ null', () => {
  assert.equal(gad2Score({ gad2_1_nervous: 1 }), null);
  assert.equal(gad2Score({ gad2_2_worry: 1 }), null);
  assert.equal(gad2Score({}), null);
  assert.equal(gad2Score({ gad2_1_nervous: 'x', gad2_2_worry: 1 }), null);
  assert.equal(gad2Score({ gad2_1_nervous: null, gad2_2_worry: 1 }), null);
});

// ── 3. pss4Score ─────────────────────────────────────────────────────────────

test('pss4Score: value 0..4 ⇒ correct label, interpretation "info", sum=value, max=4', () => {
  const labels = ['Never', 'Almost never', 'Sometimes', 'Fairly often', 'Very often'];
  for (let v = 0; v <= 4; v++) {
    const r = pss4Score({ pss4_1_unable: v });
    assert.ok(r, `expected non-null block for value ${v}`);
    assert.equal(r!.sum, v);
    assert.equal(r!.max, 4);
    assert.equal(r!.interpretation, 'info');
    assert.equal(r!.label, labels[v]);
  }
});

test('pss4Score: missing or non-numeric ⇒ null', () => {
  assert.equal(pss4Score({}), null);
  assert.equal(pss4Score({ pss4_1_unable: null }), null);
  assert.equal(pss4Score({ pss4_1_unable: 'x' }), null);
});

// ── 4. lsns6AbbrevScore ──────────────────────────────────────────────────────

test('lsns6AbbrevScore: bucket {0,1,2} ⇒ low, footnote required', () => {
  for (const [a, b] of [
    [0, 0],
    [1, 1],
    [2, 0],
  ] as const) {
    const r = lsns6AbbrevScore({
      lsns6_family_contact: a,
      lsns6_friend_contact: b,
    });
    assert.ok(r);
    assert.equal(r!.sum, a + b);
    assert.equal(r!.max, 8);
    assert.equal(r!.interpretation, 'low');
    assert.equal(r!.footnote, 'Abbreviated (2 items) — not the full LSNS-6.');
  }
});

test('lsns6AbbrevScore: bucket {3,4,5} ⇒ moderate, footnote required', () => {
  for (const [a, b] of [
    [3, 0],
    [2, 2],
    [3, 2],
  ] as const) {
    const r = lsns6AbbrevScore({
      lsns6_family_contact: a,
      lsns6_friend_contact: b,
    });
    assert.ok(r);
    assert.equal(r!.interpretation, 'moderate');
    assert.equal(r!.footnote, 'Abbreviated (2 items) — not the full LSNS-6.');
  }
});

test('lsns6AbbrevScore: bucket {6,7,8} ⇒ strong, footnote required', () => {
  for (const [a, b] of [
    [3, 3],
    [4, 3],
    [4, 4],
  ] as const) {
    const r = lsns6AbbrevScore({
      lsns6_family_contact: a,
      lsns6_friend_contact: b,
    });
    assert.ok(r);
    assert.equal(r!.interpretation, 'strong');
    assert.equal(r!.footnote, 'Abbreviated (2 items) — not the full LSNS-6.');
  }
});

test('lsns6AbbrevScore: either key missing ⇒ null', () => {
  assert.equal(lsns6AbbrevScore({ lsns6_family_contact: 2 }), null);
  assert.equal(lsns6AbbrevScore({ lsns6_friend_contact: 2 }), null);
  assert.equal(lsns6AbbrevScore({}), null);
});

// ── 5. buildReport: group ordering ──────────────────────────────────────────

const CANONICAL_ORDER = [
  'demographics',
  'conditions-meds',
  'lifestyle',
  'mental-health',
  'social-support',
  'work-finances',
] as const;

test('buildReport: emits groups in canonical order when every group is populated', () => {
  const intake = mkIntake({
    sex_at_birth: 'female',
    conditions: [{ label: 'Diabetes' }],
    tobacco_use: 'never',
    mental_health_dx: 'None',
    phq2_1_interest: 1,
    phq2_2_down: 1,
    gad2_1_nervous: 0,
    gad2_2_worry: 0,
    pss4_1_unable: 2,
    living_situation: 'Alone',
    lsns6_family_contact: 2,
    lsns6_friend_contact: 2,
    employment: 'Retired',
  });
  const groups = buildReport(intake, fullQuestionBank());
  assert.deepEqual(
    groups.map((g) => g.id),
    [...CANONICAL_ORDER],
  );
});

test('buildReport: drops a group whose rows are all blank AND has no scoreBlocks', () => {
  // Only demographics answered; every other group has empty rows and no scores.
  const intake = mkIntake({ sex_at_birth: 'male' });
  const groups = buildReport(intake, fullQuestionBank());
  assert.deepEqual(
    groups.map((g) => g.id),
    ['demographics'],
  );
});

test('buildReport: mental-health / social-support survive on scoreBlocks alone', () => {
  // Every data-row key blank, but the screeners are complete ⇒ groups keep.
  const intake = mkIntake({
    phq2_1_interest: 3,
    phq2_2_down: 0,
    lsns6_family_contact: 4,
    lsns6_friend_contact: 4,
  });
  const groups = buildReport(intake, fullQuestionBank());
  const ids = groups.map((g) => g.id);
  assert.ok(ids.includes('mental-health'), 'mental-health should survive on scoreBlocks');
  assert.ok(ids.includes('social-support'), 'social-support should survive on scoreBlocks');

  const mh = groups.find((g) => g.id === 'mental-health')!;
  assert.ok(mh.scoreBlocks && mh.scoreBlocks.length > 0);

  const ss = groups.find((g) => g.id === 'social-support')!;
  assert.ok(ss.scoreBlocks && ss.scoreBlocks.length > 0);
});

// ── 6. buildReport: row shaping ─────────────────────────────────────────────

test('buildReport: missing answer ⇒ row.missing===true, row.value==="Not shared"', () => {
  // sex_at_birth answered but height_in + weight_lb missing.
  const intake = mkIntake({ sex_at_birth: 'female' });
  const groups = buildReport(intake, fullQuestionBank());
  const demographics = groups.find((g) => g.id === 'demographics');
  assert.ok(demographics);

  const heightRow = demographics!.rows.find((r) => r.key === 'height_in');
  assert.ok(heightRow, 'height_in row should render even when unanswered');
  assert.equal(heightRow!.missing, true);
  assert.equal(heightRow!.value, 'Not shared');

  const sexRow = demographics!.rows.find((r) => r.key === 'sex_at_birth');
  assert.ok(sexRow);
  assert.equal(sexRow!.missing, false);
});

test('buildReport: present answer ⇒ row.missing===false, row.value===formatAnswer(...)', () => {
  const questions = fullQuestionBank();
  const intake = mkIntake({ sex_at_birth: 'female', height_in: 66 });
  const groups = buildReport(intake, questions);
  const demographics = groups.find((g) => g.id === 'demographics')!;

  const sexQ = questions.find((q) => q.key === 'sex_at_birth')!;
  const heightQ = questions.find((q) => q.key === 'height_in')!;

  const sexRow = demographics.rows.find((r) => r.key === 'sex_at_birth')!;
  const heightRow = demographics.rows.find((r) => r.key === 'height_in')!;

  assert.equal(sexRow.missing, false);
  assert.equal(sexRow.value, formatAnswer(sexQ, 'female'));

  assert.equal(heightRow.missing, false);
  assert.equal(heightRow.value, formatAnswer(heightQ, 66));
});

test('buildReport: row.label is the question prompt', () => {
  const questions = fullQuestionBank();
  const intake = mkIntake({ sex_at_birth: 'female' });
  const groups = buildReport(intake, questions);
  const demographics = groups.find((g) => g.id === 'demographics')!;
  const sexRow = demographics.rows.find((r) => r.key === 'sex_at_birth')!;
  assert.equal(sexRow.label, 'Sex at birth');
});

test('buildReport: screener keys (phq2_*, gad2_*, pss4_*, lsns6_*) never appear as rows', () => {
  const intake = mkIntake({
    phq2_1_interest: 1,
    phq2_2_down: 1,
    gad2_1_nervous: 2,
    gad2_2_worry: 2,
    pss4_1_unable: 3,
    lsns6_family_contact: 3,
    lsns6_friend_contact: 3,
    // Include a plain answer in each affected group so they survive.
    mental_health_dx: 'None',
    living_situation: 'Alone',
  });
  const groups = buildReport(intake, fullQuestionBank());
  const rowKeys = groups.flatMap((g) => g.rows.map((r) => r.key));
  for (const k of rowKeys) {
    assert.ok(
      !/^(phq2_|gad2_|pss4_|lsns6_)/.test(k),
      `screener key leaked into rows: ${k}`,
    );
  }
});

// ── 7. formatAnswer parity (with the retired IntakeReportScreen switch) ─────

test('formatAnswer: single ⇒ the matched option label', () => {
  const q = mkQuestion('sex_at_birth', 'body', 'Sex at birth', {
    type: 'single',
    options: [
      { value: 'female', label: 'Female' },
      { value: 'male', label: 'Male' },
    ],
  });
  assert.equal(formatAnswer(q, 'female'), 'Female');
});

test('formatAnswer: multi ⇒ comma-joined labels for each selected value', () => {
  const q = mkQuestion('conditions', 'body', 'Conditions', {
    type: 'multi',
    options: [
      { value: 'dm', label: 'Diabetes' },
      { value: 'htn', label: 'Hypertension' },
      { value: 'af', label: 'AFib' },
    ],
  });
  assert.equal(formatAnswer(q, ['dm', 'htn']), 'Diabetes, Hypertension');
});

test('formatAnswer: scale ⇒ the matched option label', () => {
  const q = mkQuestion('financial_comfort', 'life', 'Financial comfort', {
    type: 'scale',
    options: [
      { value: 1, label: 'Very tight' },
      { value: 3, label: 'Getting by' },
      { value: 5, label: 'Very comfortable' },
    ],
  });
  assert.equal(formatAnswer(q, 3), 'Getting by');
});

test('formatAnswer: add_list with note ⇒ "label (note)" joined by " · "', () => {
  const q = mkQuestion('medications', 'body', 'Medications', { type: 'add_list' });
  assert.equal(
    formatAnswer(q, [
      { label: 'Metformin', note: '500mg' },
      { label: 'Lisinopril', note: '10mg' },
    ]),
    'Metformin (500mg) · Lisinopril (10mg)',
  );
});

test('formatAnswer: add_list plain strings ⇒ " · " joined', () => {
  const q = mkQuestion('surgeries', 'body', 'Surgeries', { type: 'add_list' });
  assert.equal(
    formatAnswer(q, ['Appendectomy', 'Cholecystectomy']),
    'Appendectomy · Cholecystectomy',
  );
});

test('formatAnswer: missing value ⇒ empty string (so buildReport can flag missing)', () => {
  const q = mkQuestion('height_in', 'body', 'Height (in)', { type: 'number' });
  assert.equal(formatAnswer(q, undefined), '');
  assert.equal(formatAnswer(q, null), '');
  assert.equal(formatAnswer(q, ''), '');
});

// ── 8. Vaccines (COS-480 Phase 1) ───────────────────────────────────────────

test('VACCINES_INTAKE_ENABLED default is true (Phase 1 rollout)', () => {
  assert.equal(VACCINES_INTAKE_ENABLED, true);
});

test('formatAnswer: vaccines with parseable date ⇒ "Name (MMM YYYY)", comma-joined', () => {
  const q = mkQuestion('vaccines', 'body', 'Vaccines', { type: 'add_list' });
  assert.equal(
    formatAnswer(q, [
      { label: 'Flu', note: '2024-03-15' },
      { label: 'COVID booster', note: 'October 2023' },
    ]),
    'Flu (Mar 2024), COVID booster (Oct 2023)',
  );
});

test('formatAnswer: vaccines with bare 4-digit year ⇒ passes year through untouched', () => {
  const q = mkQuestion('vaccines', 'body', 'Vaccines', { type: 'add_list' });
  assert.equal(
    formatAnswer(q, [{ label: 'Tdap', note: '2023' }]),
    'Tdap (2023)',
  );
});

test('formatAnswer: vaccines with no date ⇒ "Name" only', () => {
  const q = mkQuestion('vaccines', 'body', 'Vaccines', { type: 'add_list' });
  assert.equal(
    formatAnswer(q, [{ label: 'MMR' }, { label: 'Shingles' }]),
    'MMR, Shingles',
  );
});

test('formatAnswer: vaccines with unparseable date ⇒ keeps raw text so nothing is lost', () => {
  const q = mkQuestion('vaccines', 'body', 'Vaccines', { type: 'add_list' });
  assert.equal(
    formatAnswer(q, [{ label: 'HPV', note: 'sometime in college' }]),
    'HPV (sometime in college)',
  );
});

test('formatAnswer: vaccines skips rows with blank name (defensive)', () => {
  const q = mkQuestion('vaccines', 'body', 'Vaccines', { type: 'add_list' });
  assert.equal(
    formatAnswer(q, [{ label: '', note: '2024' }, { label: 'Flu', note: '2024' }]),
    'Flu (2024)',
  );
});

test('buildReport: vaccines group appears when answered, in order between conditions-meds and lifestyle', () => {
  const bank = [
    ...fullQuestionBank(),
    mkQuestion('vaccines', 'body', 'Vaccines you have had', { type: 'add_list' }),
  ];
  const intake = mkIntake({
    sex_at_birth: 'female',
    conditions: [{ label: 'Diabetes' }],
    vaccines: [{ label: 'Flu', note: '2024' }],
    tobacco_use: 'never',
    mental_health_dx: 'None',
    living_situation: 'Alone',
    employment: 'Retired',
  });
  const groups = buildReport(intake, bank);
  const ids = groups.map((g) => g.id);
  const cIdx = ids.indexOf('conditions-meds');
  const vIdx = ids.indexOf('vaccines');
  const lIdx = ids.indexOf('lifestyle');
  assert.ok(vIdx !== -1, 'vaccines group should render when answered');
  assert.ok(cIdx < vIdx && vIdx < lIdx, 'order must be conditions-meds < vaccines < lifestyle');

  const vGroup = groups.find((g) => g.id === 'vaccines')!;
  assert.equal(vGroup.title, 'Vaccines');
  assert.equal(vGroup.icon, 'vaccines');
  assert.equal(vGroup.color, '#0F766E');
  assert.equal(vGroup.rows.length, 1);
  assert.equal(vGroup.rows[0].key, 'vaccines');
  assert.equal(vGroup.rows[0].label, 'Your vaccine list');
  assert.equal(vGroup.rows[0].value, 'Flu (2024)');
  assert.equal(vGroup.rows[0].missing, false);
});

test('buildReport: vaccines group is silent-dropped when patient did not answer', () => {
  const bank = [
    ...fullQuestionBank(),
    mkQuestion('vaccines', 'body', 'Vaccines you have had', { type: 'add_list' }),
  ];
  const intake = mkIntake({ sex_at_birth: 'female' });
  const groups = buildReport(intake, bank);
  assert.equal(
    groups.some((g) => g.id === 'vaccines'),
    false,
    'vaccines group should be dropped when no answer given (Family history pattern)',
  );
});

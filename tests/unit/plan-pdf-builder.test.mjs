// tests/unit/plan-pdf-builder.test.mjs
//
// Unit tests for components/health-plan/plan-pdf-builder.ts — the pure
// HTML serializer behind the plan's "Share as PDF" action.
//
// BACKGROUND
//   We already ship a PDF export for the intake report
//   (ShareIntakeReportSection + intake-report-builder). The plan export
//   reuses that exact mechanism (expo-print → expo-sharing → RN Share text
//   fallback, no new npm packages), but its HTML is built by a PURE
//   function so the shaping rules are assertable without an RN runtime.
//
//   This file imports the .ts module directly. Node's built-in type
//   stripping handles it, and the builder's only imports are `import type`
//   (erased at runtime), so nothing pulls in React Native or axios. If a
//   future edit converts any of those to a value import, THIS SUITE FAILS
//   AT IMPORT TIME — that failure is the point, not a bug in the test.
//
// WHAT THIS SUITE DEFENDS
//   1. The non-medical-record disclaimer is present in every document and
//      survives the plain-text degradation path. This is a compliance
//      promise: a patient may hand the PDF to a clinician and it must not
//      present itself as an official record.
//   2. Every user/LLM-provided string is HTML-escaped before interpolation
//      (injection safety — plan text is Bedrock output plus patient input).
//   3. The plan section named `habits` in the data model prints as
//      "Routines" and never leaks the word "Habits" as a heading.
//   4. Discontinued / hidden / EHR-ended medications never print under
//      "Current medications" (clinical-safety, not cosmetic).
//   5. Empty sections are suppressed rather than printed as bare headings.
//   6. Purity: same input → same output, no reliance on wall-clock when
//      `sharedOn` is supplied.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  PLAN_PDF_DISCLAIMER,
  PLAN_PDF_SECTION_ORDER,
  ROUTINES_SECTION_TITLE,
  buildPlanHtml,
  escapeHtml,
  formatHabitCadence,
  formatHabitTarget,
  formatLongDate,
  formatMedicationLine,
  planHtmlToText,
  selectCurrentMedications,
} from '../../components/health-plan/plan-pdf-builder.ts'

// ── Fixtures ──────────────────────────────────────────────────────────
//
// Fixed `sharedOn` so date rendering is deterministic across machines.
// We assert on the YEAR only — `toLocaleDateString(undefined, …)` is
// device-locale-dependent by design (it matches the shipped intake PDF
// header), so asserting an exact month string would make this suite
// fail on a non-en machine for no product reason.
const SHARED_ON = new Date('2026-08-06T12:00:00.000Z')

function section(overrides = {}) {
  return {
    planBullets: ['Walk 20 minutes daily'],
    interventions: [],
    goals: [],
    status: 'on-track',
    trendSummary: 'Steady improvement over the last month.',
    trendDirection: 'improving',
    lastUpdated: '2026-08-01T00:00:00.000Z',
    ...overrides,
  }
}

function fullInput(overrides = {}) {
  return {
    patientName: 'Rosa',
    planGeneratedAt: '2026-08-01T00:00:00.000Z',
    sharedOn: SHARED_ON,
    aiSummary: 'Focus on sleep and social connection this month.',
    sections: {
      biological: section(),
      psychological: section({
        planBullets: ['Practice box breathing before bed'],
        status: 'needs-attention',
        trendDirection: 'declining',
        trendSummary: 'Stress has been elevated.',
        goals: [
          {
            id: 'g1',
            title: 'Sleep 7 hours',
            description: 'Consistent bedtime.',
            priority: 'high',
            target: '7 hours',
            baseline: '5 hours',
            timeframe: '8 weeks',
          },
        ],
      }),
      social: section({
        planBullets: ['Call one friend each week'],
        status: 'just-started',
        trendDirection: 'unknown',
        trendSummary: '',
      }),
    },
    tasksBySection: {
      biological: [
        {
          id: 't1',
          type: 'exercise',
          title: 'Morning walk',
          description: 'Around the block.',
          scheduledTime: '08:00',
          recurrence: 'daily',
          startDate: '2026-08-01',
          source: 'ai',
        },
      ],
    },
    habits: [
      {
        habitId: 'h1',
        label: 'Drink water',
        cadence: 'daily',
        targetValue: 8,
        unit: 'glasses',
        bpsDomain: 'bio',
        rationale: 'Hydration supports energy.',
      },
    ],
    medications: [
      {
        id: 'm1',
        name: 'Metformin',
        dose: '500 mg',
        frequency: 'twice daily',
        times: ['08:00', '20:00'],
        source: 'ehr',
        tracked: true,
        supply: null,
      },
    ],
    ...overrides,
  }
}

// ── 1. Disclaimer (compliance) ────────────────────────────────────────

test('disclaimer says the document is NOT a medical record', () => {
  assert.match(PLAN_PDF_DISCLAIMER, /not a medical record/)
  assert.match(PLAN_PDF_DISCLAIMER, /snapshot of your care plan/)
  // Plan bodies are Bedrock-generated, so the AI disclosure is required too.
  assert.match(PLAN_PDF_DISCLAIMER, /AI-generated/)
})

test('every built document carries the disclaimer — even a fully empty plan', () => {
  assert.ok(buildPlanHtml(fullInput()).includes(escapeHtml(PLAN_PDF_DISCLAIMER)))
  assert.ok(
    buildPlanHtml({ sharedOn: SHARED_ON }).includes(escapeHtml(PLAN_PDF_DISCLAIMER)),
  )
})

test('disclaimer survives the plain-text fallback used by older binaries', () => {
  const text = planHtmlToText(buildPlanHtml(fullInput()))
  assert.match(text, /not a medical record/)
  // The <style> block must be stripped, not shared as noise.
  assert.ok(!text.includes('page-break-inside'))
})

test('an empty plan still produces a valid document with an honest message', () => {
  const html = buildPlanHtml({ sharedOn: SHARED_ON })
  assert.match(html, /<!doctype html>/)
  assert.match(html, /does not have any content yet/)
  assert.match(html, /My care plan/)
})

// ── 2. Escaping (injection safety) ────────────────────────────────────

test('escapeHtml escapes the same five characters the intake PDF escapes', () => {
  assert.equal(escapeHtml('&<>"'), '&amp;&lt;&gt;&quot;')
  assert.equal(escapeHtml('plain'), 'plain')
})

test('patient name, summary, bullets, goals, tasks, habits and meds are all escaped', () => {
  const html = buildPlanHtml(
    fullInput({
      patientName: '<script>x</script>',
      aiSummary: 'a & b <b>',
      sections: {
        biological: section({ planBullets: ['<img onerror=1>'], trendSummary: '<i>t</i>' }),
        psychological: section({
          planBullets: [],
          trendSummary: '',
          goals: [
            { id: 'g', title: '<g>', description: '<d>', priority: 'low', target: '<t>' },
          ],
        }),
        social: section({ planBullets: [], trendSummary: '' }),
      },
      tasksBySection: {
        biological: [
          {
            id: 't',
            type: 'reminder',
            title: '<task>',
            description: '<desc>',
            scheduledTime: '09:00',
            recurrence: 'weekly',
            startDate: '2026-08-01',
            source: 'ai',
          },
        ],
      },
      habits: [
        { habitId: 'h', label: '<habit>', cadence: 'daily', bpsDomain: 'psycho', rationale: '<r>' },
      ],
      medications: [
        {
          id: 'm',
          name: '<med>',
          dose: null,
          frequency: null,
          times: [],
          source: 'patient-reported',
          tracked: false,
          supply: null,
        },
      ],
    }),
  )

  for (const raw of ['<script>', '<img onerror', '<g>', '<task>', '<habit>', '<med>', '<i>t</i>']) {
    assert.ok(!html.includes(raw), `unescaped payload leaked into HTML: ${raw}`)
  }
  // …and the escaped forms ARE present, so we're suppressing markup, not content.
  assert.ok(html.includes('&lt;habit&gt;'))
  assert.ok(html.includes('&lt;med&gt;'))
  assert.ok(html.includes('a &amp; b &lt;b&gt;'))
})

// ── 3. Header / identity ──────────────────────────────────────────────

test('header uses the patient name and both dates', () => {
  const html = buildPlanHtml(fullInput())
  assert.match(html, /Rosa&#39;s care plan|Rosa's care plan/)
  assert.match(html, /Shared .*2026/)
  assert.match(html, /Plan generated .*2026/)
  assert.match(html, /Circle Support Health/)
})

test('missing patient name falls back to a generic title, not "undefined"', () => {
  const html = buildPlanHtml({ sharedOn: SHARED_ON, patientName: '   ' })
  assert.match(html, /<h1>My care plan<\/h1>/)
  assert.ok(!html.includes('undefined'))
})

test('formatLongDate returns empty string for missing / unparseable values', () => {
  assert.equal(formatLongDate(null), '')
  assert.equal(formatLongDate(undefined), '')
  assert.equal(formatLongDate(''), '')
  assert.equal(formatLongDate('not-a-date'), '')
  assert.match(formatLongDate('2026-08-06T00:00:00.000Z'), /2026/)
})

test('an unparseable planGeneratedAt suppresses the clause instead of printing Invalid Date', () => {
  const html = buildPlanHtml(fullInput({ planGeneratedAt: 'garbage' }))
  assert.ok(!html.includes('Invalid Date'))
  assert.ok(!html.includes('Plan generated'))
})

// ── 4. Sections: summaries, goals, tasks ──────────────────────────────

test('all three biopsychosocial sections print with their shipped titles', () => {
  const html = buildPlanHtml(fullInput())
  for (const spec of PLAN_PDF_SECTION_ORDER) {
    // Titles go through escapeHtml too — "Social & Faith" prints as
    // "Social &amp; Faith". Asserting the raw string here would be asserting
    // that we FAILED to escape it.
    assert.ok(html.includes(escapeHtml(spec.title)), `missing section title: ${spec.title}`)
  }
  assert.deepEqual(
    PLAN_PDF_SECTION_ORDER.map((s) => s.key),
    ['biological', 'psychological', 'social'],
  )
})

test('sections render summary bullets, trend summary, goals and tasks', () => {
  const html = buildPlanHtml(fullInput())
  assert.match(html, /Walk 20 minutes daily/)
  assert.match(html, /Steady improvement over the last month\./)
  assert.match(html, /Sleep 7 hours/)
  assert.match(html, /High priority/)
  assert.match(html, /Target: 7 hours/)
  assert.match(html, /Morning walk/)
  assert.match(html, /Every day/)
  assert.match(html, /at 08:00/)
})

test('status and trend are printed as WORDS, never as arrow glyphs alone', () => {
  const html = buildPlanHtml(fullInput())
  assert.match(html, /On track/)
  assert.match(html, /Improving/)
  assert.match(html, /Needs attention/)
  assert.match(html, /Declining/)
  // Colour-only / glyph-only signalling is banned on a printed page.
  for (const glyph of ['↑', '↓', '→']) {
    assert.ok(!html.includes(glyph), `arrow glyph leaked into PDF: ${glyph}`)
  }
})

test('a section with no bullets, goals, tasks or trend is suppressed entirely', () => {
  const empty = section({ planBullets: [], goals: [], trendSummary: '', trendDirection: 'unknown' })
  const html = buildPlanHtml({
    sharedOn: SHARED_ON,
    sections: { biological: section(), psychological: empty, social: empty },
  })
  assert.ok(html.includes('Biological Wellness'))
  assert.ok(!html.includes('Psychological Wellness'))
  assert.ok(!html.includes(escapeHtml('Social & Faith')))
})

test('whitespace-only bullets are dropped rather than printed as empty list items', () => {
  const html = buildPlanHtml({
    sharedOn: SHARED_ON,
    sections: {
      biological: section({ planBullets: ['  ', 'Real bullet', ''] }),
      psychological: section({ planBullets: [], goals: [], trendSummary: '', trendDirection: 'unknown' }),
      social: section({ planBullets: [], goals: [], trendSummary: '', trendDirection: 'unknown' }),
    },
  })
  assert.ok(!html.includes('<li></li>'))
  assert.match(html, /Real bullet/)
})

test('goals and tasks with blank titles are skipped', () => {
  const html = buildPlanHtml({
    sharedOn: SHARED_ON,
    sections: {
      biological: section({
        planBullets: ['keep me'],
        goals: [{ id: 'a', title: '   ', description: 'ghost goal', priority: 'low' }],
      }),
      psychological: section({ planBullets: [], goals: [], trendSummary: '', trendDirection: 'unknown' }),
      social: section({ planBullets: [], goals: [], trendSummary: '', trendDirection: 'unknown' }),
    },
    tasksBySection: {
      biological: [
        {
          id: 'x',
          type: 'reminder',
          title: '',
          description: 'ghost task',
          scheduledTime: '07:00',
          recurrence: 'once',
          startDate: '2026-08-01',
          source: 'ai',
        },
      ],
    },
  })
  assert.ok(!html.includes('ghost goal'))
  assert.ok(!html.includes('ghost task'))
  assert.ok(!html.includes('<h3>Goals</h3>'))
  assert.ok(!html.includes('<h3>Tasks</h3>'))
})

// ── 5. Routines (the data model's `habits`) ───────────────────────────

test('the habits section is displayed as "Routines", never as "Habits"', () => {
  assert.equal(ROUTINES_SECTION_TITLE, 'Routines')
  const html = buildPlanHtml(fullInput())
  assert.match(html, /<h2[^>]*>Routines<\/h2>/)
  assert.ok(!/>Habits</.test(html), 'the word "Habits" must not appear as a heading')
})

test('routine rows carry label, cadence, target and domain', () => {
  const html = buildPlanHtml(fullInput())
  assert.match(html, /Drink water/)
  assert.match(html, /Every day/)
  assert.match(html, /8 glasses/)
  assert.match(html, /Biological/)
  assert.match(html, /Hydration supports energy\./)
})

test('formatHabitCadence handles both literals and the everyNDays object', () => {
  assert.equal(formatHabitCadence('daily'), 'Every day')
  assert.equal(formatHabitCadence('weekly'), 'Every week')
  assert.equal(formatHabitCadence({ everyNDays: 3 }), 'Every 3 days')
  assert.equal(formatHabitCadence({ everyNDays: 1 }), 'Every day')
  // Nonsense cadences degrade to a safe default rather than printing junk.
  assert.equal(formatHabitCadence({ everyNDays: 0 }), 'Every day')
  assert.equal(formatHabitCadence({ everyNDays: Number.NaN }), 'Every day')
  assert.equal(formatHabitCadence(undefined), 'Every day')
})

test('formatHabitTarget collapses missing value or unit without dangling text', () => {
  assert.equal(formatHabitTarget({ targetValue: 8, unit: 'glasses' }), '8 glasses')
  assert.equal(formatHabitTarget({ targetValue: 8 }), '8')
  assert.equal(formatHabitTarget({ unit: 'minutes' }), 'minutes')
  assert.equal(formatHabitTarget({}), '')
})

test('the Routines section is omitted when there are no usable habits', () => {
  const html = buildPlanHtml(fullInput({ habits: [{ habitId: 'h', label: '  ', cadence: 'daily', bpsDomain: 'bio' }] }))
  assert.ok(!html.includes('Routines'))
})

// ── 6. Medications (clinical safety) ─────────────────────────────────

test('formatMedicationLine assembles name, dose, frequency and times', () => {
  assert.equal(
    formatMedicationLine({ name: 'Metformin', dose: '500 mg', frequency: 'twice daily', times: ['08:00', '20:00'] }),
    'Metformin 500 mg — twice daily — 08:00, 20:00',
  )
  // Missing parts collapse — no dangling em dashes on a clinician-facing page.
  assert.equal(formatMedicationLine({ name: 'Aspirin', dose: null, frequency: null, times: [] }), 'Aspirin')
  assert.equal(formatMedicationLine({ name: 'Aspirin', dose: '81 mg', frequency: null, times: [] }), 'Aspirin 81 mg')
})

test('discontinued, hidden and EHR-ended meds never print under "Current medications"', () => {
  const meds = [
    { id: '1', name: 'Active', dose: null, frequency: null, times: [], source: 'ehr', tracked: true, supply: null },
    { id: '2', name: 'Stopped', dose: null, frequency: null, times: [], source: 'ehr', tracked: true, supply: null, discontinuedAt: '2026-07-01T00:00:00.000Z' },
    { id: '3', name: 'Hidden', dose: null, frequency: null, times: [], source: 'ehr', tracked: true, supply: null, hidden: true },
    { id: '4', name: 'EndedInEhr', dose: null, frequency: null, times: [], source: 'ehr', tracked: true, supply: null, endedInEhr: true },
    { id: '5', name: '   ', dose: null, frequency: null, times: [], source: 'ehr', tracked: true, supply: null },
  ]
  assert.deepEqual(selectCurrentMedications(meds).map((m) => m.name), ['Active'])

  const html = buildPlanHtml(fullInput({ medications: meds }))
  assert.match(html, /Current medications/)
  assert.match(html, />Active</)
  for (const gone of ['Stopped', 'Hidden', 'EndedInEhr']) {
    assert.ok(!html.includes(gone), `past medication leaked into the PDF: ${gone}`)
  }
})

test('medication provenance is labelled so a clinician knows the source', () => {
  const html = buildPlanHtml(
    fullInput({
      medications: [
        { id: '1', name: 'FromEhr', dose: null, frequency: null, times: [], source: 'ehr', tracked: true, supply: null },
        { id: '2', name: 'SelfAdded', dose: null, frequency: null, times: [], source: 'patient-reported', tracked: true, supply: null },
      ],
    }),
  )
  assert.match(html, /From your health records/)
  assert.match(html, /You added this/)
  // Tracking-only caveat must ride along with the med list.
  assert.match(html, /does not change any prescription/)
})

test('the medications section is omitted when nothing is current', () => {
  const html = buildPlanHtml(fullInput({ medications: [] }))
  assert.ok(!html.includes('Current medications'))
})

test('selectCurrentMedications tolerates non-array / absent input', () => {
  assert.deepEqual(selectCurrentMedications(undefined), [])
  assert.deepEqual(selectCurrentMedications(null), [])
  assert.deepEqual(selectCurrentMedications('nope'), [])
})

// ── 7. Purity ────────────────────────────────────────────────────────

test('same input produces byte-identical output (pure function)', () => {
  const input = fullInput()
  assert.equal(buildPlanHtml(input), buildPlanHtml(fullInput()))
})

test('buildPlanHtml does not mutate its input', () => {
  const input = fullInput()
  const before = JSON.stringify(input)
  buildPlanHtml(input)
  assert.equal(JSON.stringify(input), before)
})

/**
 * COS-1258 — Galaxy S26 + Ken feedback, 2026-10-07.
 *
 *  1. An octagon behind the Plan tab disc: Android `elevation` ignores
 *     shadowOpacity and, under the translucent unfocused fill, renders as a
 *     polygon. iOS already turned its shadow off when unfocused.
 *  2. A heavy grey frame round the intake card (and the Plan banners): the same
 *     elevation drawn THROUGH a translucent tint.
 *  3. "Health Status" ran under the Critical Health Alerts badge on a narrower
 *     phone.
 *  4. Today's Schedule said "Patient" — Ken: "It has to be user only."
 *  5. Ken: "drop down and spell out assessments" on Health Trends.
 *
 * Contract tests over source read as text (no `@/` alias under node --test).
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')

test('THE POINT: the Plan tab disc casts an Android shadow only when focused', () => {
  const bar = strip(read('components/custom-scrollable-tab-bar.tsx'))
  assert.match(bar, /elevation: isFocused \? 4 : 0/)
  const style = bar.slice(bar.indexOf('healthPlanHighlight: {'))
  assert.doesNotMatch(style.slice(0, style.indexOf('}')), /elevation/, 'no unconditional elevation left in the style')
})

test('translucent-tint banners have no Android elevation', () => {
  const intake = strip(read('components/health-plan/patient-intake/IntakeCtaCard.tsx'))
  const banner = intake.slice(intake.indexOf('banner: {'))
  assert.doesNotMatch(banner.slice(0, banner.indexOf('}')), /elevation/)
  for (const f of ['BpsWelcomeBanner', 'TryNewPlanCta', 'ViewBioInsightsLink']) {
    const s = strip(read(`components/health-plan/${f}.tsx`))
    assert.match(s, /android: \{\}/, `${f}: no Android elevation under the tint`)
    assert.doesNotMatch(s, /android: \{ elevation/)
  }
})

test('the Health Status title reserves the alert badge width on both sides', () => {
  const s = strip(read('app/Home/plan.tsx'))
  assert.match(s, /paddingHorizontal: healthAlertsEnabled \? alertBadgeWidth : 0/)
  assert.match(s, /onLayout=\{\(e\) => setAlertBadgeWidth\(Math\.ceil\(e\.nativeEvent\.layout\.width\)\)\}/)
})

test("Today's Schedule names the user, never \"Patient\"", () => {
  const s = strip(read('app/Home/today-schedule.tsx'))
  assert.match(s, /patientName \|\| \[me\?\.firstName, me\?\.lastName\]\.filter\(Boolean\)\.join\(' '\) \|\| 'User'/)
  assert.doesNotMatch(s, /'Patient'|>\s*Patient\s*</)
})

test('Health Trends: assessments drop down and are spelled out', () => {
  assert.match(strip(read('app/Home/health-trends.tsx')), /<SelfAssessmentTrends fromScreen="health-trends" collapsible \/>/)
  const labels = read('lib/instrument-labels.ts')
  for (const id of ['dsq-nci', 'ris', 'fas', 'gad-2', 'dabbs', 'brief-cope', 'lsns-6', 'pcl-5', 'ace']) {
    assert.match(labels, new RegExp(`'${id}':\\s+'[A-Z]`), `${id} must have a spelled-out label`)
  }
  const cards = strip(read('components/health-plan/SelfAssessmentTrends.tsx'))
  assert.match(cards, /numberOfLines=\{3\}/, 'titles get 3 lines')
})

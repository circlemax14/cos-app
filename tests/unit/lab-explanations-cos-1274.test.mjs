/**
 * COS-1274 / SCRUM-815 — "About this test ✨" on lab results.
 *
 * Contract tests over source read as text (no `@/` alias under node --test).
 * What matters: the flag fails CLOSED, nothing is fetched until a row is
 * opened, Ken's exact copy, our typical range never sits beside the lab's own,
 * Apple Health metrics never get one, and the detail sheet stops calling clinic
 * labs "Apple Health".
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')
const strip = (s) =>
  s.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const C = strip(read('components/labs/AboutThisTest.tsx'))
const API = strip(read('services/api/lab-explanation.ts'))
const TRENDS = strip(read('app/Home/health-trends.tsx'))

test('the flag fails CLOSED — strict === true, never useIsFeatureFlagEnabled', () => {
  assert.match(C, /const \{ data: flags \} = useFeatureFlags\(\)/)
  assert.match(C, /flags\?\.lab_explanations_enabled === true/)
  assert.doesNotMatch(C, /useIsFeatureFlagEnabled/)
  assert.match(C, /if \(!on\) return null/)
})

test("Ken's exact label, headings and closing line", () => {
  assert.match(C, /About this test ✨/)
  assert.match(C, />Written with AI</)
  for (const h of [
    "'What it measures'",
    `"Why it's done"`,
    `"If it's higher than your lab's range"`,
    `"If it's lower than your lab's range"`,
    "'Good to know'",
  ]) assert.ok(C.includes(`heading(${h})`), h)
  assert.match(C, /ex\.goodToKnow \?/, 'Good to know is omitted when null')
  assert.match(
    C,
    /General information about this test, not about your result\. Talk with your care team about your results\./,
  )
  assert.match(C, /We couldn't load this right now\./)
  assert.match(C, /We don't have an explanation for this test yet\./)
})

test('nothing is fetched while collapsed; lazy, cached, one retry', () => {
  assert.match(C, /enabled: on && expanded,/)
  assert.match(C, /useState\(defaultExpanded\)/)
  assert.match(C, /const testName = \(name \?\? ''\)\.trim\(\)/)
  assert.match(C, /queryKey: \['lab-explanation', testName\.toLowerCase\(\), code \?\? '', unit \?\? ''\]/)
  assert.match(C, /staleTime: 24 \* 60 \* 60 \* 1000/)
  assert.match(C, /retry: 1,/)
  assert.match(C, /accessibilityState=\{\{ expanded \}\}/)
})

test("typical range only when the lab gave none AND the units match", () => {
  assert.match(
    C,
    /const showTypical = !labHasRange && !!typical && normUnit\(unit\) !== '' && normUnit\(typical\.unit\) === normUnit\(unit\)/,
  )
  assert.match(C, /\.replace\(\/\\s\+\/g, ''\)\.toLowerCase\(\)/, 'case-insensitive, spaces ignored')
  assert.match(C, /Typical range: \$\{typical\.text\} \$\{typical\.unit\}/)
  assert.match(C, /Typical range — your lab's may differ\./)
})

test('Apple Health metrics (hk-*) never get an explanation', () => {
  assert.match(C, /!\(code \?\? ''\)\.startsWith\('hk-'\)/)
  assert.match(
    TRENDS,
    /activeTrend\.source !== 'apple-health' && !activeTrend\.metricCode\.startsWith\('hk-'\) && \(\s*<AboutThisTest\s+defaultExpanded/,
  )
})

test('API: the contracted route, errors NOT swallowed', () => {
  assert.match(API, /'\/v1\/labs\/explanation', \{ params: \{ name: name\.trim\(\), code, unit \} \}/)
  assert.match(API, /return res\.data\.data\.explanation \?\? null/)
  assert.doesNotMatch(API, /catch/)
})

test('Health Trends: open block AFTER TrendCard, not behind its chart entitlement', () => {
  const card = TRENDS.indexOf('<TrendCard\n')
  const about = TRENDS.indexOf('<AboutThisTest')
  assert.ok(card > 0 && about > card, 'after TrendCard')
  const between = TRENDS.slice(card, about)
  assert.ok(between.includes(')}'), 'outside the canViewTrendChart gate')
  assert.match(TRENDS, /labHasRange=\{!!activeTrend\.dataPoints\[0\]\?\.referenceRange\}/)
})

test('Health Trends sheet subtitle no longer says "Apple Health" for clinic labs', () => {
  assert.doesNotMatch(TRENDS, /^\s*Apple Health · \{activeTrend/m)
  assert.match(TRENDS, /\{activeTrend\.source === 'apple-health' \? 'Apple Health' : 'Clinic'\} · \{activeTrend\.dataPoints\.length\}/)
})

test('Reports and Health Status rows: collapsed block, lab range passed through', () => {
  const table = strip(read('components/reports/lab-results-table.tsx'))
  assert.match(table, /<AboutThisTest name=\{r\.name\} unit=\{r\.unit\} labHasRange=\{!!r\.referenceRange\} \/>/)
  const labs = strip(read('components/health-summary/LabsByConditionSection.tsx'))
  assert.match(labs, /<AboutThisTest name=\{row\.name\} unit=\{row\.unit\} labHasRange=\{!!row\.referenceRange\} \/>/)
  for (const s of [table, labs]) assert.doesNotMatch(s, /<AboutThisTest[^>]*defaultExpanded/)
})

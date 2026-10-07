/**
 * COS-1261 — "What your <Domain> check-ins show" on Health Trends.
 *
 * Contract tests over source read as text (no `@/` alias under node --test).
 * The ones that matter most: the flag fails CLOSED, the block never appears on
 * the Care Plan, nothing is fetched until a domain is opened, and loading
 * stays inside the iOS 26 rendering envelope.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')
const strip = (s) =>
  s.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const TRENDS = strip(read('components/health-plan/SelfAssessmentTrends.tsx'))
const API = strip(read('services/api/assessments.ts'))

test('THE POINT: the block renders at the top of an OPENED domain card, above the carousel', () => {
  const open = TRENDS.slice(TRENDS.indexOf('{isOpen ? ('))
  const block = open.indexOf('renderDomainSummary(group.label, summaryQueries[i])')
  assert.ok(block > 0, 'rendered inside the open branch')
  assert.ok(block < open.indexOf('renderCarousel(group, true)'), 'above the check-in cards')
  assert.match(TRENDS, /\{`What your \$\{label\} check-ins show`\}/)
  assert.match(TRENDS, /Written by AI · not a diagnosis/)
})

test('the flag fails CLOSED — never useIsFeatureFlagEnabled, which defaults to ON', () => {
  assert.match(TRENDS, /flags\?\.assessment_ai_summaries_enabled === true/)
  assert.doesNotMatch(TRENDS, /useIsFeatureFlagEnabled/)
})

test('Health Trends only in v1 — never on the Care Plan', () => {
  assert.match(TRENDS, /&& collapsible && fromScreen === 'health-trends'/)
  assert.match(TRENDS, /\{aiSummaries && group\.domain \? renderDomainSummary/)
  // The Care Plan mount does not claim to be Health Trends.
  const plan = strip(read('components/health-plan/BiopsychosocialPlanScreen.tsx'))
  assert.match(plan, /<SelfAssessmentTrends collapsible \/>/)
  assert.doesNotMatch(plan, /fromScreen="health-trends"/)
  assert.match(strip(read('app/Home/health-trends.tsx')), /<SelfAssessmentTrends fromScreen="health-trends" collapsible \/>/)
})

test('fetched only when the domain is opened, for the cards that domain shows', () => {
  assert.match(TRENDS, /enabled: aiSummaries && g\.domain !== null && openDomains\.includes\(g\.label\)/)
  assert.match(TRENDS, /g\.records\.map\(\(r\) => String\(r\.instrumentId\)\)/)
  assert.match(TRENDS, /'assessment-domain-summary',\s*g\.domain,/)
})

test('loading is ONE line of text — no spinner, no new react-native primitives', () => {
  assert.match(TRENDS, /Putting your summary together…/)
  assert.doesNotMatch(TRENDS, /ActivityIndicator/)
  assert.match(
    read('components/health-plan/SelfAssessmentTrends.tsx'),
    /^import \{ Pressable, ScrollView, StyleSheet, Text, View \} from 'react-native'$/m,
  )
})

test('failure is an apology with Retry, and a failed generation looks the same', () => {
  assert.match(TRENDS, /const failed = q\.isError \|\| q\.data\?\.available === false/)
  assert.match(TRENDS, /We couldn't put your summary together just now\./)
  assert.match(TRENDS, /onPress=\{\(\) => void q\.refetch\(\)\}/)
  assert.match(TRENDS, />\s*Retry\s*</)
})

test('accessibility: header, a labelled summary that includes the caption, a labelled Retry', () => {
  assert.match(TRENDS, /accessibilityRole="header"/)
  assert.match(TRENDS, /accessibilityLabel=\{`\$\{q\.data\.summary\} Written by AI, not a diagnosis\.`\}/)
  assert.match(TRENDS, /accessibilityLabel=\{`Retry your \$\{label\} summary`\}/)
  assert.match(TRENDS, /accessibilityLabel="Putting your summary together"/)
})

test('API: calls the domain-summary route and does NOT swallow errors', () => {
  const fn = API.slice(API.indexOf('export async function fetchAssessmentDomainSummary'))
  assert.match(fn, /'\/v1\/patients\/me\/assessments\/domain-summary'/)
  assert.match(fn, /params: \{ domain, ids: ids\.slice\(0, 25\)\.join\(','\) \}/)
  assert.doesNotMatch(fn.slice(0, fn.indexOf('\n}\n')), /catch/)
})

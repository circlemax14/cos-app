/**
 * AICS-3 — AI-generated health text must say it is AI and point to a doctor
 * (Apple 1.4.1: "remind users to check with a doctor"; 5.1.2(i) disclosure).
 *
 *  - assessment-detail "What this means" is a Bedrock reading of PHQ-9 / GAD-7 /
 *    PCL-5 / ACE results and carried no AI label or disclaimer at all.
 *  - HealthTrendSummaryCard said "Written from your own records" — true, but
 *    it never said a model wrote it.
 *
 * Source assertions: the defect is ABSENT copy.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { isModelWritten, FIXED_SUMMARY_TEXTS } from '../../lib/ai-summary-label.ts'

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')
const code = (s) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

test('assessment "What this means" carries an AI + see-your-doctor line', () => {
  const src = code(read('app/Home/assessment-detail.tsx'))
  const i = src.indexOf("sectionLabel('What this means')")
  assert.ok(i > -1)
  const block = src.slice(i, src.indexOf('summaryQ.isLoading', i))
  assert.match(block, /AI-generated/)
  assert.match(block, /doctor/)
  // Not `available`: the self-harm and no-range texts arrive with available: true.
  assert.match(block, /\{isModelWritten\(summaryQ\.data\) && \(/, 'only under model prose')
  assert.ok(!/summaryQ\.data\.available &&/.test(block))
})

const [RISK_ITEM, NO_RANGE, TREND_APOLOGY] = FIXED_SUMMARY_TEXTS

test('PHQ-9 item 9 endorsed: the fixed safety text is NOT captioned as AI', () => {
  // exactly what cos-backend riskItemSummary() returns
  assert.equal(isModelWritten({ summary: RISK_ITEM, generatedAt: 'x', available: true }), false)
  assert.match(RISK_ITEM, /worth talking through with a person/)
})

test('no-range check-ins and the trend apology are not AI either; model prose is', () => {
  assert.equal(isModelWritten({ summary: NO_RANGE, available: true }), false)
  assert.equal(isModelWritten({ summary: TREND_APOLOGY }), false)
  assert.equal(isModelWritten({ summary: `  ${RISK_ITEM.replace(/ /g, '\n')} `, available: true }), false, 'whitespace-insensitive')
  assert.equal(isModelWritten({ summary: 'Your PHQ-9 scores have eased from moderate to mild.', available: true }), true)
  assert.equal(isModelWritten({ summary: 'Sorry, no summary.', available: false }), false)
  for (const bad of [null, undefined, {}, { summary: '' }, { summary: 42 }]) assert.equal(isModelWritten(bad), false)
})

test('a backend aiGenerated flag, once sent, wins over the mirror', () => {
  assert.equal(isModelWritten({ summary: 'prose', available: true, aiGenerated: false }), false)
  assert.equal(isModelWritten({ summary: RISK_ITEM, available: true, aiGenerated: true }), true)
})

test('every AI caption is gated on isModelWritten', () => {
  const trend = code(read('components/health/HealthTrendSummaryCard.tsx'))
  assert.match(trend, /if \(state\.error \|\| !isModelWritten\(\{ summary: state\.summary \}\)\)/, 'apology renders as the failure state')
  const sat = code(read('components/health-plan/SelfAssessmentTrends.tsx'))
  const fixedBranch = sat.indexOf('q.data && !isModelWritten(q.data) ?')
  assert.ok(fixedBranch > -1 && fixedBranch < sat.indexOf('Written by AI · not a diagnosis'), 'domain summary: fixed text gets no AI caption')
})

test('Health Trends AI card says it is AI-generated', () => {
  const src = code(read('components/health/HealthTrendSummaryCard.tsx'))
  assert.match(src, /AI-generated from your own records/)
  assert.ok(!/>\s*Written from your own records/.test(src))
})

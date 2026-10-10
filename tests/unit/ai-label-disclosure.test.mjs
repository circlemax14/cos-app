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

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')
const code = (s) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

test('assessment "What this means" carries an AI + see-your-doctor line', () => {
  const src = code(read('app/Home/assessment-detail.tsx'))
  const i = src.indexOf("sectionLabel('What this means')")
  assert.ok(i > -1)
  const block = src.slice(i, src.indexOf('summaryQ.isLoading', i))
  assert.match(block, /AI-generated/)
  assert.match(block, /doctor/)
  assert.match(block, /summaryQ\.data\.available &&/, 'only under a real AI reading, not the apology')
})

test('Health Trends AI card says it is AI-generated', () => {
  const src = code(read('components/health/HealthTrendSummaryCard.tsx'))
  assert.match(src, /AI-generated from your own records/)
  assert.ok(!/>\s*Written from your own records/.test(src))
})

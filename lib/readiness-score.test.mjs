// SCRUM-638 — unit tests for lib/readiness-score.ts
//
// Node test runner (matches lib/wellbeing-score.test.mjs pattern):
//   node --test lib/readiness-score.test.mjs
//
// Mirror-only: this file re-implements the pure formula against the same
// contract so tests pin the behaviour without needing a TS transpiler.
// Keep in sync with lib/readiness-score.ts — new metric / weight tweaks
// touch both files together.

import { test } from 'node:test'
import assert from 'node:assert/strict'

const WEIGHTS = { hrv: 0.35, sleep: 0.3, restingHr: 0.25, respRate: 0.1 }
const MIN_BASELINE_DAYS = 7
const CONFIDENT_BASELINE_DAYS = 14
const Z_CLAMP = 2

function computeStats(values) {
  const finite = values.filter((v) => typeof v === 'number' && Number.isFinite(v))
  if (finite.length === 0) return undefined
  const mean = finite.reduce((a, v) => a + v, 0) / finite.length
  const variance = finite.reduce((a, v) => a + (v - mean) ** 2, 0) / finite.length
  return { mean, stdDev: Math.sqrt(variance), count: finite.length }
}

function zScoreToSubscore(z, higherIsBetter) {
  const clamped = Math.max(-Z_CLAMP, Math.min(Z_CLAMP, z))
  const directional = higherIsBetter ? clamped : -clamped
  return Math.round(50 + (directional / Z_CLAMP) * 50)
}

function optimalRangeSubscore(value, optMin, optMax, hardMin, hardMax) {
  if (value >= optMin && value <= optMax) return 100
  if (value <= hardMin || value >= hardMax) return 0
  const range = value < optMin ? optMin - hardMin : hardMax - optMax
  const distance = value < optMin ? optMin - value : value - optMax
  return Math.round(100 - (distance / range) * 100)
}

function hasAny(m) {
  return !!m && (['hrvMs', 'sleepHours', 'restingHrBpm', 'respRateBpm'].some((k) => typeof m[k] === 'number'))
}

function computeReadinessScore(today, baseline) {
  const baselineDays = baseline.length
  if (baselineDays < MIN_BASELINE_DAYS) {
    return {
      composite: undefined,
      band: undefined,
      baselineDays,
      state: baselineDays === 0 && !hasAny(today) ? 'no-data' : 'pre-baseline',
      drivers: [],
    }
  }
  const hrv = computeStats(baseline.map((d) => d.hrvMs).filter((v) => v !== undefined))
  const sleep = computeStats(baseline.map((d) => d.sleepHours).filter((v) => v !== undefined))
  const hr = computeStats(baseline.map((d) => d.restingHrBpm).filter((v) => v !== undefined))
  const resp = computeStats(baseline.map((d) => d.respRateBpm).filter((v) => v !== undefined))

  if (!hasAny(today)) {
    return { composite: undefined, band: undefined, baselineDays, state: 'no-data', drivers: [] }
  }

  const drivers = []
  let totalWeight = 0
  let weightedSum = 0

  if (typeof today.hrvMs === 'number' && hrv && hrv.stdDev > 0) {
    const z = (today.hrvMs - hrv.mean) / hrv.stdDev
    const sub = zScoreToSubscore(z, true)
    drivers.push({ metric: 'hrv', subscore: sub })
    weightedSum += sub * WEIGHTS.hrv
    totalWeight += WEIGHTS.hrv
  }
  if (typeof today.sleepHours === 'number') {
    const sub = optimalRangeSubscore(today.sleepHours, 7, 9, 3, 12)
    drivers.push({ metric: 'sleep', subscore: sub })
    weightedSum += sub * WEIGHTS.sleep
    totalWeight += WEIGHTS.sleep
  }
  if (typeof today.restingHrBpm === 'number' && hr && hr.stdDev > 0) {
    const z = (today.restingHrBpm - hr.mean) / hr.stdDev
    const sub = zScoreToSubscore(z, false)
    drivers.push({ metric: 'restingHr', subscore: sub })
    weightedSum += sub * WEIGHTS.restingHr
    totalWeight += WEIGHTS.restingHr
  }
  if (typeof today.respRateBpm === 'number') {
    const sub = optimalRangeSubscore(today.respRateBpm, 12, 16, 8, 25)
    drivers.push({ metric: 'respRate', subscore: sub })
    weightedSum += sub * WEIGHTS.respRate
    totalWeight += WEIGHTS.respRate
  }

  if (totalWeight === 0) {
    return { composite: undefined, band: undefined, baselineDays, state: 'pre-baseline', drivers: [] }
  }

  const composite = Math.round(weightedSum / totalWeight)
  const band =
    composite >= 80 ? 'optimal'
    : composite >= 60 ? 'developing'
    : composite >= 40 ? 'foundational'
    : 'initial'
  return {
    composite,
    band,
    baselineDays,
    state: baselineDays >= CONFIDENT_BASELINE_DAYS ? 'ready' : 'warming-up',
    drivers,
  }
}

// ── Fixtures ─────────────────────────────────────────────────────

// 14 stable baseline days — HRV 45ms, sleep 7.5h, resting 62bpm, resp 14/min.
const stableBaseline = Array.from({ length: 14 }, (_, i) => ({
  date: `2026-07-${String(17 + i).padStart(2, '0')}`,
  hrvMs: 45,
  sleepHours: 7.5,
  restingHrBpm: 62,
  respRateBpm: 14,
}))

// 14 baseline days with variance (so stdDev is meaningful for z-scores).
const variableBaseline = Array.from({ length: 14 }, (_, i) => ({
  date: `2026-07-${String(17 + i).padStart(2, '0')}`,
  hrvMs: 40 + (i % 5) * 3, // 40..52
  sleepHours: 6.5 + (i % 5) * 0.5, // 6.5..8.5
  restingHrBpm: 60 + (i % 5) * 2, // 60..68
  respRateBpm: 13 + (i % 4), // 13..16
}))

// ── Tests ─────────────────────────────────────────────────────────

test('empty baseline + no today → no-data', () => {
  const r = computeReadinessScore(undefined, [])
  assert.equal(r.composite, undefined)
  assert.equal(r.state, 'no-data')
  assert.equal(r.baselineDays, 0)
})

test('fewer than 7 baseline days → pre-baseline (even with today)', () => {
  const r = computeReadinessScore({ date: '2026-07-31', hrvMs: 45 }, stableBaseline.slice(0, 3))
  assert.equal(r.composite, undefined)
  assert.equal(r.state, 'pre-baseline')
})

test('7-13 baseline days → warming-up when today has metrics', () => {
  const r = computeReadinessScore(
    { date: '2026-07-31', hrvMs: 45, sleepHours: 7.5 },
    variableBaseline.slice(0, 8),
  )
  assert.equal(r.state, 'warming-up')
  assert.ok(typeof r.composite === 'number')
})

test('14+ baseline days → ready state', () => {
  const r = computeReadinessScore(
    { date: '2026-07-31', hrvMs: 45, sleepHours: 7.5, restingHrBpm: 62, respRateBpm: 14 },
    variableBaseline,
  )
  assert.equal(r.state, 'ready')
})

test('exactly-baseline today with in-range sleep = 100 sleep subscore', () => {
  // Sleep 7.5 is inside optimal 7-9 → sub = 100 regardless of baseline.
  const r = computeReadinessScore(
    { date: '2026-07-31', sleepHours: 7.5 },
    variableBaseline,
  )
  const sleep = r.drivers.find((d) => d.metric === 'sleep')
  assert.equal(sleep?.subscore, 100)
})

test('HRV above baseline scores > 50 (higher = better)', () => {
  const r = computeReadinessScore(
    { date: '2026-07-31', hrvMs: 60 }, // ~1.5 SD above variable baseline
    variableBaseline,
  )
  const hrv = r.drivers.find((d) => d.metric === 'hrv')
  assert.ok(hrv && hrv.subscore > 50, `expected hrv subscore > 50, got ${hrv?.subscore}`)
})

test('HRV below baseline scores < 50 (higher = better)', () => {
  const r = computeReadinessScore(
    { date: '2026-07-31', hrvMs: 30 }, // ~1.5 SD below
    variableBaseline,
  )
  const hrv = r.drivers.find((d) => d.metric === 'hrv')
  assert.ok(hrv && hrv.subscore < 50, `expected hrv subscore < 50, got ${hrv?.subscore}`)
})

test('resting HR above baseline scores < 50 (lower = better)', () => {
  const r = computeReadinessScore(
    { date: '2026-07-31', restingHrBpm: 75 }, // ~2 SD above
    variableBaseline,
  )
  const hr = r.drivers.find((d) => d.metric === 'restingHr')
  assert.ok(hr && hr.subscore <= 50, `expected hr subscore <= 50, got ${hr?.subscore}`)
})

test('undersleeping (5h) drops sleep subscore below 100', () => {
  const r = computeReadinessScore(
    { date: '2026-07-31', sleepHours: 5 },
    variableBaseline,
  )
  const sleep = r.drivers.find((d) => d.metric === 'sleep')
  assert.ok(sleep && sleep.subscore < 100, `expected sleep < 100, got ${sleep?.subscore}`)
})

test('resp rate 20 (above optimal) drops resp subscore', () => {
  const r = computeReadinessScore(
    { date: '2026-07-31', respRateBpm: 20 },
    variableBaseline,
  )
  const resp = r.drivers.find((d) => d.metric === 'respRate')
  assert.ok(resp && resp.subscore < 100)
})

test('missing metric drops its weight — composite renormalizes', () => {
  const withAll = computeReadinessScore(
    { date: '2026-07-31', hrvMs: 45, sleepHours: 7.5, restingHrBpm: 62, respRateBpm: 14 },
    variableBaseline,
  )
  const hrvOnly = computeReadinessScore(
    { date: '2026-07-31', hrvMs: 45 },
    variableBaseline,
  )
  // Both produce a score (HRV-only just weighs HRV at 100%).
  assert.ok(typeof withAll.composite === 'number')
  assert.ok(typeof hrvOnly.composite === 'number')
  assert.equal(hrvOnly.drivers.length, 1)
})

test('z-score clamped at ±2 SD → subscore stays in [0, 100]', () => {
  const r = computeReadinessScore(
    { date: '2026-07-31', hrvMs: 500 }, // absurdly high
    variableBaseline,
  )
  const hrv = r.drivers.find((d) => d.metric === 'hrv')
  assert.ok(hrv && hrv.subscore <= 100 && hrv.subscore >= 0)
})

test('band boundaries: 80/60/40', () => {
  const optimal = { composite: 85 }
  const developing = { composite: 70 }
  const foundational = { composite: 50 }
  const initial = { composite: 30 }
  const bandOf = (s) =>
    s.composite >= 80 ? 'optimal'
    : s.composite >= 60 ? 'developing'
    : s.composite >= 40 ? 'foundational'
    : 'initial'
  assert.equal(bandOf(optimal), 'optimal')
  assert.equal(bandOf(developing), 'developing')
  assert.equal(bandOf(foundational), 'foundational')
  assert.equal(bandOf(initial), 'initial')
})

test('weights sum to 1.0 within float tolerance (regression guard)', () => {
  const sum = WEIGHTS.hrv + WEIGHTS.sleep + WEIGHTS.restingHr + WEIGHTS.respRate
  assert.ok(Math.abs(sum - 1.0) < 1e-9, `weights sum ${sum} not close to 1.0`)
})

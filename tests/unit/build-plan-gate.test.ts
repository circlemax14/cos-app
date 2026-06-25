import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveBuildGate } from '../../lib/build-plan-gate.ts'

const MIN = 2

// ── Backend data available ───────────────────────────────────────────────────

test('backend canGenerate=true → canBuild true, remainingCount 0', () => {
  const result = resolveBuildGate(
    { canGenerate: true, remainingInstrumentIds: [] },
    1, // completedCount (below MIN — should be ignored)
    MIN,
  )
  assert.equal(result.canBuild, true)
  assert.equal(result.remainingCount, 0)
  assert.equal(result.fromBackend, true)
})

test('backend canGenerate=false, 3 remaining → canBuild false, remainingCount 3', () => {
  const result = resolveBuildGate(
    { canGenerate: false, remainingInstrumentIds: ['phq-9', 'gad-7', 'sleep-4'] },
    2,
    MIN,
  )
  assert.equal(result.canBuild, false)
  assert.equal(result.remainingCount, 3)
  assert.equal(result.fromBackend, true)
})

test('basic-tier user: backend canGenerate=true, 0 remaining → never blocked', () => {
  const result = resolveBuildGate(
    { canGenerate: true, remainingInstrumentIds: [] },
    0,
    MIN,
  )
  assert.equal(result.canBuild, true)
  assert.equal(result.fromBackend, true)
})

// ── No backend data (offline / pre-load) ─────────────────────────────────────

test('null assignments, completedCount >= MIN → fallback canBuild true', () => {
  const result = resolveBuildGate(null, 2, MIN)
  assert.equal(result.canBuild, true)
  assert.equal(result.remainingCount, 0)
  assert.equal(result.fromBackend, false)
})

test('undefined assignments, completedCount < MIN → fallback canBuild false', () => {
  const result = resolveBuildGate(undefined, 1, MIN)
  assert.equal(result.canBuild, false)
  assert.equal(result.remainingCount, 1)
  assert.equal(result.fromBackend, false)
})

test('undefined assignments, completedCount 0 → remainingCount capped at MIN', () => {
  const result = resolveBuildGate(undefined, 0, MIN)
  assert.equal(result.canBuild, false)
  assert.equal(result.remainingCount, MIN)
  assert.equal(result.fromBackend, false)
})

test('undefined assignments, completedCount well above MIN → canBuild true', () => {
  const result = resolveBuildGate(undefined, 10, MIN)
  assert.equal(result.canBuild, true)
  assert.equal(result.remainingCount, 0)
  assert.equal(result.fromBackend, false)
})

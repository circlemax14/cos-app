import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  shouldFetchAppleHealthTrends,
  resolveAppleHealthTrendsState,
} from '../../lib/apple-health-gate.ts'

// ── shouldFetchAppleHealthTrends ─────────────────────────────────────────────

test('iOS + preference enabled → fetch', () => {
  assert.equal(shouldFetchAppleHealthTrends(true, true), true)
})

test('iOS + preference DISABLED → do not fetch (the repro: disabled is authoritative)', () => {
  assert.equal(shouldFetchAppleHealthTrends(true, false), false)
})

test('non-iOS is never fetched, regardless of preference', () => {
  assert.equal(shouldFetchAppleHealthTrends(false, true), false)
  assert.equal(shouldFetchAppleHealthTrends(false, false), false)
})

// ── resolveAppleHealthTrendsState ────────────────────────────────────────────

test('iOS + enabled → "enabled"', () => {
  assert.equal(resolveAppleHealthTrendsState(true, true), 'enabled')
})

test('iOS + disabled → "disabled" (shows the turned-off prompt)', () => {
  assert.equal(resolveAppleHealthTrendsState(true, false), 'disabled')
})

test('non-iOS → "unavailable" (no turned-off prompt on Android)', () => {
  assert.equal(resolveAppleHealthTrendsState(false, true), 'unavailable')
  assert.equal(resolveAppleHealthTrendsState(false, false), 'unavailable')
})

/**
 * The error boundary's contract, asserted against its source.
 *
 * There is no React renderer in this repo's `node --test` setup, so this reads
 * the module rather than mounting it. That is enough for the properties that
 * actually matter here, all of which are structural:
 *
 *   - it is a CLASS with the two lifecycle hooks, because a hook-based
 *     "boundary" silently catches nothing
 *   - it reports, because a boundary that swallows errors converts a loud crash
 *     into a silent wrong-looking screen, which is worse to diagnose
 *   - reporting cannot itself throw
 *   - it is applied INSIDE the tab, not around the navigator
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const SRC = readFileSync(join(HERE, '..', 'components', 'ScreenErrorBoundary.tsx'), 'utf8')
const PLAN = readFileSync(join(HERE, '..', 'app', 'Home', 'plan.tsx'), 'utf8')

test('THE POINT: it is a class with both lifecycle hooks', () => {
  // React only treats a component as a boundary if it implements these. A
  // function component with a try/catch catches nothing from its children.
  assert.match(SRC, /class ScreenErrorBoundary extends React\.Component/)
  assert.match(SRC, /static getDerivedStateFromError/)
  assert.match(SRC, /componentDidCatch/)
})

test('it reports — a swallowed error is worse than a crash', () => {
  // A crash at least announces itself. A boundary with no reporting turns a
  // fatal into a screen that quietly looks wrong forever.
  assert.match(SRC, /captureException/)
  assert.match(SRC, /console\.error/)
})

test('reporting can never itself crash the app', () => {
  // The reporter runs inside componentDidCatch. If it throws there is no
  // second boundary above it to catch that.
  const didCatch = SRC.slice(SRC.indexOf('componentDidCatch'))
  assert.match(didCatch, /try \{/)
  assert.match(didCatch, /catch/)
})

test('the report carries a screen name and no screen DATA', () => {
  // Tags and a component stack are safe. Anything from the rendered payload
  // would be PHI arriving in Sentry by accident.
  assert.match(SRC, /tags: \{ screen \}/)
  assert.match(SRC, /componentStack/)
  assert.doesNotMatch(SRC, /props\.children.*JSON\.stringify/)
})

test('it offers a way back, and does not blame the patient', () => {
  assert.match(SRC, /Try again/)
  assert.match(SRC, /Your information is safe/)
})

test('Health Summary is wrapped INSIDE the tab, so the tab bar survives', () => {
  // Wrapped above the navigator, catching would replace the whole shell and
  // strand the patient with no way out.
  assert.match(PLAN, /<ScreenErrorBoundary screen="health-summary">/)
  assert.match(PLAN, /<HealthSummaryScreenInner \/>/)
})

test('the wrapper is the default export, so the route actually gets it', () => {
  // If the inner component stayed the default, the boundary would be dead code.
  assert.match(PLAN, /export default function HealthSummaryScreen\(\)/)
  assert.doesNotMatch(PLAN, /export default function HealthSummaryScreenInner/)
})

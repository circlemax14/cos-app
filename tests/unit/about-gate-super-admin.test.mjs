/**
 * COS-1249 — About is visible to super-admins, and still never to the wildcard.
 *
 * A super-admin resolves to the wildcard before any override is read, and the
 * About gate refuses the wildcard (it is also what every patient gets while
 * plan_tier_enabled is off). So About could never appear for a super-admin.
 * Source read as text (no `@/` alias under node --test).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

test('THE POINT: About opens for a super-admin by role, or for an explicit grant', () => {
  const src = strip(read('components/profile-content.tsx'))
  assert.match(src, /const canSeeAbout = useHasExplicitGrant\('about\.view'\) \|\| me\?\.role === 'SUPER_ADMIN';/)
  assert.match(src, /\{canSeeAbout && \(/)
})

test('the wildcard alone still never opens About', () => {
  const src = strip(read('components/profile-content.tsx'))
  assert.doesNotMatch(src, /canSeeAbout = useCanRender\(/, 'useCanRender treats the wildcard as a grant — every patient would see About')
})

/**
 * The medications screen's structure, as a source-read contract.
 *
 * Three corrections from Vishal on 2026-08-18, each of which had shipped
 * looking finished:
 *
 *   1. the medical/psychiatric split was TWO HEADED SECTIONS, not icons
 *   2. expanding a medication showed NO loader while it fetched drug facts
 *   3. "cephalexin 500mg capsule" returned nothing where "metformin" worked
 *
 * (3) is a backend fix and is tested in cos-backend/src/services/__tests__.
 * These cover the two client-side ones, which are otherwise only visible by
 * opening the app.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const MEDS = readFileSync(join(HERE, '..', 'components', 'health-plan', 'MedicationsSection.tsx'), 'utf8')
const FACTS = readFileSync(join(HERE, '..', 'components', 'health-plan', 'DrugLabelFacts.tsx'), 'utf8')

test('THE CORRECTION: the class is an ICON on the row, not a section heading', () => {
  // Two headings split the list in two, so a patient's medications stopped
  // appearing in one place and the order they were added in was lost.
  assert.match(MEDS, /classifyMedication\(med\)/, 'each row must classify itself')
  assert.match(MEDS, /medical-services/, 'medical glyph')
  assert.match(MEDS, /psychology/, 'psychiatric glyph')
})

test('the list renders ONCE, in one order', () => {
  // The tell for the old shape was two separate .map() passes, one per group.
  assert.match(MEDS, /\{active\.map\(renderCard\)\}/)
  assert.doesNotMatch(MEDS, /\{medical\.map\(renderCard\)\}/, 'no per-group list')
  assert.doesNotMatch(MEDS, /\{psychiatric\.map\(renderCard\)\}/, 'no per-group list')
})

test('the old uppercase group headings are gone', () => {
  assert.doesNotMatch(MEDS, /heading\('Medical'/)
  assert.doesNotMatch(MEDS, /heading\('Psychiatric'/)
})

test('the class is not carried by colour alone', () => {
  // A colour-only distinction is invisible to a colour-blind reader. The two
  // glyphs differ in shape, and the legend spells the words out.
  assert.notEqual('medical-services', 'psychology')
  assert.match(MEDS, /Medical · \$\{|Medical' , |'Medical'/)
  assert.match(MEDS, /accessibilityLabel=\{`\$\{medical\.length\} medical and \$\{psychiatric\.length\} psychiatric/)
})

test('the legend only appears when there are both kinds to tell apart', () => {
  // With one kind there is nothing to distinguish, and a key explaining an
  // invisible distinction is furniture.
  assert.match(MEDS, /const showLegend = medical\.length > 0 && psychiatric\.length > 0/)
})

test('THE LOADER: fetching drug facts shows something', () => {
  // `isLoading` was never read, so the early return fired on the first render
  // and expanding a medication rendered nothing at all until the call to
  // api.fda.gov came back — indistinguishable from a drug we have no label
  // for, which is the one thing it must not look like.
  assert.match(FACTS, /const \{ data, isLoading \} = useQuery/)
  assert.match(FACTS, /if \(isLoading\)/)
  // And the loading branch must come BEFORE the not-found early return, or it
  // is unreachable.
  assert.ok(
    FACTS.indexOf('if (isLoading)') < FACTS.indexOf('if (!data?.found) return null'),
    'the loading check must precede the not-found return',
  )
})

test('the loading state is announced, not just drawn', () => {
  assert.match(FACTS, /accessibilityRole="progressbar"/)
  assert.match(FACTS, /accessibilityLabel="Looking up information about this medication"/)
})

test('the skeleton stays inside the iOS 26.5 envelope', () => {
  // ADR-0003 keeps animation off these surfaces. A static skeleton, not a
  // spinner — and specifically not ActivityIndicator, which the envelope bans.
  assert.doesNotMatch(FACTS, /ActivityIndicator/)
  assert.doesNotMatch(FACTS, /Animated/)
  assert.match(FACTS, /skeletonBar/)
})

/**
 * The retake ask is TWO features, and they fail independently.
 *
 * Vishal, 2026-08-15: "if patient go to plan page without clicking
 * notification then there should be message to its time to take your
 * assessment so BOTH ARE DIFFERENT FEATURES".
 *
 *   1. the notification deep-link  — catches the patient who taps it
 *   2. the in-app surface          — catches the patient who does not
 *
 * (2) is the one that matters at scale: a patient who dismissed the
 * notification, missed it, or has notifications switched off has no other way
 * to discover the request. Only (1) existed, so the feature reached almost
 * nobody — and the plan screen, which is where the assessments actually live,
 * had no retake entry point at all.
 *
 * Source-read rather than render: `node --test` here has no React renderer,
 * and what these assertions protect is structural — WHICH screens mount the
 * surface — which is exactly what a source read can prove and a snapshot
 * cannot.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const read = (...p) => readFileSync(join(HERE, '..', ...p), 'utf8')

const HOME = read('app', 'Home', 'index.tsx')
const BPS = read('components', 'health-plan', 'BiopsychosocialPlanScreen.tsx')
const CARD = read('components', 'health-plan', 'retake-request', 'RetakeRequestInboxCard.tsx')

test('THE GAP THAT WAS SHIPPED: the plan screen surfaces a pending retake', () => {
  // This is the assertion that would have failed before 2026-08-16. The card
  // was mounted on Home only, so a patient who opened their plan — where the
  // assessments actually are — saw nothing asking them to retake one.
  assert.match(BPS, /<RetakeRequestInboxCard \/>/)
})

test('Home still surfaces it too — this added a path, it did not move one', () => {
  assert.match(HOME, /<RetakeRequestInboxCard \/>/)
})

test('both screens mount THE SAME component, not two lookalikes', () => {
  // Two differently-worded "time to reassess" surfaces read as two separate
  // requests. A patient answering one would still find the other sitting
  // there unanswered, and we would have manufactured the confusion ourselves.
  const importer = /import (?:\{ )?RetakeRequestInboxCard(?: \})? from '[^']*RetakeRequestInboxCard'/
  assert.match(HOME, importer)
  assert.match(BPS, importer)
})

test('it null-renders when nothing is pending, so it cannot become clutter', () => {
  // A nudge that renders empty chrome on every visit stops being a nudge. The
  // silent-drop is what makes mounting it on a second screen safe.
  assert.match(CARD, /return null/)
})

test('it outranks the generated summary on the plan screen', () => {
  // A request the care team is actively waiting on should not sit below an
  // AI-generated recap. Order is load-bearing, so it is asserted.
  const retake = BPS.indexOf('<RetakeRequestInboxCard />')
  const summary = BPS.indexOf('<BpsAiSummaryBanner')
  assert.ok(retake > 0 && summary > 0, 'both surfaces must be present')
  assert.ok(retake < summary, 'the retake ask must render above the AI summary')
})

test('the card stays inside the iOS 26.5 primitive envelope', () => {
  // The plan surface is the one that crashed on iOS 26.5 when Modal/Animated
  // composed with a tap handler. Mounting a card that reaches for either would
  // reintroduce that, and it would read as a retake bug rather than a
  // rendering one.
  //
  // Asserted against the IMPORT LINES, not the whole file. The card's header
  // explains at length why it avoids gesture-handler-based sheets, and a naive
  // whole-file search flags that explanation as the very thing it warns
  // against — a test that fails on a correct file teaches people to delete
  // tests.
  const imports = CARD.split('\n').filter((l) => l.startsWith('import'))
  const banned = [
    'react-native-reanimated',
    'react-native-gesture-handler',
    'bottom-sheet',
    'react-native-paper',
  ]
  for (const lib of banned) {
    assert.ok(
      !imports.some((l) => l.includes(lib)),
      `card imports ${lib} — outside the iOS 26.5 envelope for this surface`,
    )
  }
  // Modal and Animated come from react-native itself, so check the binding.
  const rn = imports.find((l) => l.includes("from 'react-native'")) ?? ''
  assert.ok(!/\bModal\b/.test(rn), 'card imports Modal')
  assert.ok(!/\bAnimated\b/.test(rn), 'card imports Animated')
})

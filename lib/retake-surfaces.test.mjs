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
const GATE = read('components', 'health-plan', 'retake-request', 'RetakeRequiredGate.tsx')

test('THE GAP THAT WAS SHIPPED: the plan screen surfaces a pending retake', () => {
  // This is the assertion that would have failed before 2026-08-16. The card
  // was mounted on Home only, so a patient who opened their plan — where the
  // assessments actually are — saw nothing asking them to retake one.
  //
  // COS-1166 — the plan screen now BLOCKS on it rather than listing it
  // inline, so the surface is the gate. The card is what the gate renders.
  assert.match(BPS, /<RetakeRequiredGate>/)
  assert.match(GATE, /<RetakeRequestInboxCard \/>/)
})

test('COS-1166: the gate WRAPS the plan, it does not sit inside it', () => {
  // A blocker rendered as one more row in the scroll is just a card again.
  // It must open before the ScrollView and close after the last sibling.
  const open = BPS.indexOf('<RetakeRequiredGate>')
  // The MAIN body scroll view — the file's loading and error returns have
  // their own <ScrollView>s earlier, which are not what the gate wraps.
  const scroll = BPS.indexOf('ref={scrollRef}')
  const close = BPS.indexOf('</RetakeRequiredGate>')
  assert.ok(open > 0 && scroll > 0 && close > 0, 'gate and body must both be present')
  assert.ok(open < scroll, 'the gate must open before the plan body')
  assert.ok(close > scroll, 'the gate must close after the plan body')
})

test('COS-1166: the gate has an escape, so nobody loses their plan', () => {
  // "Not now" is the card's snooze path. A gate with no exit would take a
  // patient's care plan away at the moment they most want to look at it.
  assert.match(CARD, /retake-snooze-sheet/)
})

test('COS-1166: loading renders the plan, NOT the gate', () => {
  // The majority of patients have nothing pending; gating while the query is
  // in flight would flash a blocker at all of them.
  assert.match(GATE, /pendingCount <= 0/)
})

test('Home still surfaces it too — this added a path, it did not move one', () => {
  assert.match(HOME, /<RetakeRequestInboxCard \/>/)
})

test('both screens mount THE SAME component, not two lookalikes', () => {
  // Two differently-worded "time to reassess" surfaces read as two separate
  // requests. A patient answering one would still find the other sitting
  // there unanswered, and we would have manufactured the confusion ourselves.
  //
  // COS-1166 — still one card. Home mounts it directly; the plan reaches it
  // through the gate. What must never appear is a SECOND card component.
  const importer = /import (?:\{ )?RetakeRequestInboxCard(?: \})? from '[^']*RetakeRequestInboxCard'/
  assert.match(HOME, importer)
  assert.match(GATE, importer)
  assert.match(BPS, /import \{ RetakeRequiredGate \} from '[^']*RetakeRequiredGate'/)
})

test('it null-renders when nothing is pending, so it cannot become clutter', () => {
  // A nudge that renders empty chrome on every visit stops being a nudge. The
  // silent-drop is what makes mounting it on a second screen safe.
  assert.match(CARD, /return null/)
})

test('it outranks the generated summary on the plan screen', () => {
  // A request the care team is actively waiting on should not sit below an
  // AI-generated recap. COS-1166 makes this stronger than ordering: while
  // one is pending the summary does not render at all, because the gate
  // replaces the whole body.
  const gate = BPS.indexOf('<RetakeRequiredGate>')
  const summary = BPS.indexOf('<BpsAiSummaryBanner')
  assert.ok(gate > 0 && summary > 0, 'both surfaces must be present')
  assert.ok(gate < summary, 'the gate must enclose the AI summary, not follow it')
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

test('COS-1168: the patient is never told WHICH member of staff asked', () => {
  /*
   * The card printed "Admin BrightFuture" / "Care Manager Sarah" — a staff
   * name and a role, to a patient who may have no relationship with either,
   * which also leaks who is looking at their record.
   *
   * The clause is composed server-side now (retake-request.service
   * composeRequesterPhrase) so the push and the card cannot diverge and the
   * wording can change without an app release. requesterFirstName stays on
   * the wire for older binaries; nothing may render it.
   */
  const code = CARD.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  assert.doesNotMatch(code, /requesterFirstName/, 'the card must not render the requester name')
  assert.doesNotMatch(code, /humanRole/, 'the role mapper is gone — nothing should reintroduce it')
  assert.match(code, /requesterPhrase/, 'the card must use the server-composed clause')
})

test('COS-1168: the local fallback still says something sane, never a role token', () => {
  // Only reached by a binary talking to a backend that predates the field.
  const code = CARD.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const fn = code.slice(code.indexOf('function requesterPhraseFor'))
  assert.match(fn.slice(0, 400), /Your care team/)
  assert.doesNotMatch(fn.slice(0, 400), /requesterRole/)
})

// tests/unit/record-metric-modal-keyboard-contract.test.mjs
//
// Source-drift trip wires for the RecordMetricModal keyboard contract.
//
// BUG (Ken, 2026-08-07): "Couldn't register numbers because keypad blocked
// submit button." Screenshot showed the BP capture modal with the numeric
// keypad covering the lower half of the card — the diastolic helper line was
// clipped and BOTH action buttons ("Skip recording" / "Save & complete") were
// entirely behind the keyboard. The patient could type a number and then had
// no way to submit it.
//
// THREE separate defects produced that dead end, and a fix for only the first
// leaves the feature broken in a way that still reads as "the button doesn't
// work". All three are pinned here:
//
//   1. The card was centred in the FULL screen with no keyboard avoidance, so
//      its bottom sat under the keypad.
//   2. `number-pad` / `decimal-pad` have NO return or Done key on iOS. There
//      is no keyboard-side dismiss, so the actions must be reachable WITH the
//      keyboard up — they cannot rely on the user closing it first.
//   3. Tapping the backdrop was the only escape, and it CANCELLED the modal,
//      discarding the value the patient had just typed.
//
// If any of these fail: do NOT relax the regex. Re-read the modal diff and
// confirm the keyboard behaviour is still correct on a small device with a
// large accessibility font, then update the wire in lockstep.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { stripComments } from './strip-comments.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const REPO_ROOT = join(__dirname, '..', '..')

const MODAL_PATH = join(REPO_ROOT, 'components', 'home', 'record-metric-modal.tsx')
const SRC = stripComments(readFileSync(MODAL_PATH, 'utf8'))

test('(a) the card is wrapped in KeyboardAvoidingView with a per-platform behavior', () => {
  assert.match(
    SRC,
    /<KeyboardAvoidingView\b/,
    'record-metric-modal.tsx must wrap its backdrop in <KeyboardAvoidingView>. Without it the card is centred in the full screen and its lower half — both action buttons — sits behind the numeric keypad. This is the exact defect Ken reported on 2026-08-07.',
  )
  assert.match(
    SRC,
    /behavior=\{Platform\.OS === 'ios' \? 'padding' : 'height'\}/,
    "KeyboardAvoidingView must use behavior={Platform.OS === 'ios' ? 'padding' : 'height'}. A single hardcoded behavior is wrong on one of the two platforms — 'padding' does not lift the view on Android, 'height' fights the iOS keyboard animation.",
  )
})

test('(b) the action row is OUTSIDE the ScrollView so it can never scroll away or be covered', () => {
  assert.match(
    SRC,
    /<ScrollView\b/,
    'record-metric-modal.tsx must render a <ScrollView> around the input fields so they remain reachable on a small device at large accessibility font sizes (the blood-pressure case is two inputs plus two helper lines).',
  )
  const closeScroll = SRC.indexOf('</ScrollView>')
  const buttonRow = SRC.indexOf('styles.buttonRow')
  assert.ok(closeScroll > 0, 'expected a closing </ScrollView> tag')
  assert.ok(buttonRow > 0, 'expected the action row to reference styles.buttonRow')
  assert.ok(
    closeScroll < buttonRow,
    `The action row must be rendered AFTER </ScrollView> — i.e. pinned outside the scrolling region. Moving it inside makes the buttons scrollable content again, which is how they got lost behind the keyboard in the first place. Found </ScrollView> at ${closeScroll} and styles.buttonRow at ${buttonRow}.`,
  )
})

test('(c) taps pass through to the buttons on the FIRST press while the keyboard is up', () => {
  assert.match(
    SRC,
    /keyboardShouldPersistTaps="handled"/,
    'The ScrollView must set keyboardShouldPersistTaps="handled". Without it React Native swallows the first tap to dismiss the keyboard, so "Save & complete" appears to do nothing on the first press — the same "button does not work" symptom Ken reported, just one layer down. The numeric keypad has no Done key, so the keyboard IS up when the user reaches for Save.',
  )
})

test('(d) the card height is bounded so the ScrollView actually scrolls', () => {
  assert.match(
    SRC,
    /maxHeight:\s*'85%'/,
    "styles.card must keep a maxHeight so the inner ScrollView has a bounded height to scroll within. An unbounded card grows to fit its content and the ScrollView never scrolls, re-hiding the fields at large font sizes.",
  )
})

test('(e) a backdrop tap dismisses the keyboard before it cancels — typed values are not discarded', () => {
  assert.match(
    SRC,
    /const handleBackdropPress\s*=/,
    'record-metric-modal.tsx must define handleBackdropPress. The backdrop must NOT be wired straight to handleCancel: with no Done key on the numeric keypad, "tap outside" is the instinctive way to dismiss the keyboard, and cancelling there throws away the number the patient just typed.',
  )
  assert.match(
    SRC,
    /onPress=\{handleBackdropPress\}/,
    'The backdrop Pressable must call handleBackdropPress, not handleCancel directly.',
  )
  assert.doesNotMatch(
    SRC,
    /style=\{styles\.backdrop\}\s+onPress=\{handleCancel\}/,
    'The backdrop must no longer be wired directly to handleCancel — that is the data-loss path this wire exists to prevent.',
  )
  // The guard must dismiss the keyboard and RETURN, so the same tap cannot
  // also fall through to cancelling.
  assert.match(
    SRC,
    /if\s*\(keyboardUp\.current\)\s*\{\s*Keyboard\.dismiss\(\)\s*;?\s*return\s*;?\s*\}/,
    'handleBackdropPress must early-return after Keyboard.dismiss() when the keyboard is up. Falling through would dismiss the keyboard AND cancel in one tap, which is the original data-loss bug with extra steps.',
  )
})

test('(f) keyboard visibility is tracked via listeners that are cleaned up', () => {
  assert.match(
    SRC,
    /Keyboard\.addListener\(/,
    'Keyboard visibility must be tracked with Keyboard.addListener so handleBackdropPress knows whether the keyboard is up.',
  )
  assert.match(
    SRC,
    /onShow\.remove\(\)/,
    'The keyboard show listener must be removed on unmount — a leaked listener fires against an unmounted modal every time any keyboard opens anywhere in the app.',
  )
  assert.match(
    SRC,
    /onHide\.remove\(\)/,
    'The keyboard hide listener must be removed on unmount.',
  )
  // iOS fires will* before the frame animates; using did* there makes the
  // guard lag a frame behind the user's tap.
  assert.match(
    SRC,
    /Platform\.OS === 'ios' \? 'keyboardWillShow' : 'keyboardDidShow'/,
    "Use keyboardWillShow on iOS and keyboardDidShow on Android. iOS fires will* ahead of the animation; using did* on iOS leaves keyboardUp stale for a frame, which is long enough for a backdrop tap to cancel the modal instead of dismissing the keyboard.",
  )
})

test('(g) both numeric inputs still declare a numeric keyboard — the reason this contract exists', () => {
  // If these ever become plain text keyboards the keypad-has-no-Done-key
  // premise changes, and this whole contract should be revisited rather than
  // silently kept.
  assert.match(
    SRC,
    /keyboardType=\{spec\.precision === 0 \? 'number-pad' : \(Platform\.OS === 'ios' \? 'decimal-pad' : 'numeric'\)\}/,
    'The primary input must keep its numeric keyboardType. If this changes to a keyboard that HAS a return key, revisit this whole contract deliberately rather than letting it drift.',
  )
  assert.match(
    SRC,
    /keyboardType="number-pad"/,
    'The diastolic input must keep keyboardType="number-pad".',
  )
})

/**
 * COS-1215 — a scale question in the Health Status intake reads as WORDS.
 *
 * The bug this pins: ScaleQuestion rendered a horizontal row of chips whose
 * body was the RAW NUMBER (`{c.value}`) and printed only the first and last
 * option labels underneath as anchor captions. On the LSNS question "How many
 * family members do you see or hear from at least once a month?" that showed
 * `0 1 2 3 4` over "None … Five or more", so a stakeholder read the scale as
 * having no five-or-more option and asked for a sixth one to be ADDED. Adding
 * it would have changed the screener's score range (0-4 → 0-5) and silently
 * invalidated every LSNS-6 score already on file and every band threshold in
 * intake-report-builder. The option was always there; only its label was
 * hidden.
 *
 * These are source-text assertions in the style of
 * tests/unit/height-question-wiring.test.mjs — this control cannot be mounted
 * under `node --test` (JSX + the `@/` alias), so the contract is pinned against
 * the file as read from disk at runtime.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const SRC = read('components/health-plan/patient-intake/questions/ScaleQuestion.tsx')
const CODE = strip(SRC)
const STEPPER = strip(read('app/Home/assessment-stepper.tsx'))

test('THE POINT: each row shows its own label, never the raw number', () => {
  // A Text body renders the row's label...
  assert.match(CODE, />\s*\{\s*[A-Za-z_$][\w$]*\.label\s*\}\s*</, 'no Text renders the row label')
  // ...and nothing on screen is the bare numeric value. This is the regression:
  // `{c.value}` was the chip's entire visible content.
  assert.doesNotMatch(
    CODE,
    />\s*\{\s*[A-Za-z_$][\w$]*\.value\s*\}\s*</,
    'the raw scale number is being rendered as visible text again',
  )
})

test('the redundant left/right anchor captions are gone', () => {
  /*
   * They duplicated the first and last row labels, and they were the smallest,
   * lightest text on the screen (fontSize 12 in colors.subtext) — exactly what
   * the 60+, partly sighted population could not read.
   */
  assert.doesNotMatch(CODE, /leftAnchor|rightAnchor/)
  assert.doesNotMatch(CODE, /anchorRow/)
})

test('the layout is a vertical list, not a row of square chips', () => {
  // "More than half the days" cannot fit five-across at large font scales.
  assert.doesNotMatch(CODE, /chipRow|styles\.chip\b/)
  assert.doesNotMatch(CODE, /aspectRatio/, 'square chips are back')
  assert.match(CODE, /list: \{ gap: \d+ \}/)
  assert.match(CODE, /row: \{[\s\S]*?flexDirection: 'row'/, 'rows should lay the icon beside the label')
})

test('it matches the assessment stepper rather than inventing a third style', () => {
  // Both questionnaires must look and behave the same: one selectable row per
  // option, radio affordance, label beside it.
  for (const icon of ['radio-button-checked', 'radio-button-unchecked']) {
    assert.ok(CODE.includes(icon), `missing the ${icon} affordance`)
    assert.ok(STEPPER.includes(icon), `the stepper no longer uses ${icon} — re-align the two`)
  }
  assert.match(CODE, /accessibilityRole="radio"/)
  assert.match(CODE, /accessibilityState=\{\{ selected \}\}/)
})

test('PRESERVED: the stored answer is still the number', () => {
  // Only the display changed. Existing answers must still render, and
  // intake-report-builder's screener scoring reads numbers.
  assert.match(CODE, /onChange\([A-Za-z_$][\w$]*\.value\)/)
  assert.match(CODE, /value === [A-Za-z_$][\w$]*\.value/, 'selection is matched on the numeric value')
})

test('PRESERVED: the labels/min/max path still builds a row per step', () => {
  // Used whenever a question has no `options` — and, because
  // IntakeQuestionRenderer checks `q.screener` BEFORE `q.type`/`q.options`,
  // every screener goes through it. COS-1221 corrected the component's doc
  // comment, which traced the LSNS fix through the `options` path instead.
  assert.match(
    strip(read('components/health-plan/patient-intake/IntakeQuestionRenderer.tsx')),
    /if \(q\.screener\) \{[\s\S]*?SCREENER_SCALES\[q\.screener\]/,
    'the screener branch no longer precedes the type switch — the doc comment now lies',
  )
  assert.match(CODE, /for \(let i = lo; i <= hi; i\+\+\)/)
  assert.match(CODE, /labels\?\.\[i - lo\] \?\? String\(i\)/)
})

test('PRESERVED: sectionColor theming and dark mode', () => {
  assert.match(CODE, /sectionColor \?\? colors\.tint/)
  /*
   * COS-1216 moved the `Colors[settings.isDarkTheme ? …]` pick and the font
   * scaler behind one hook — useIntakeLegibility — shared by all eight intake
   * controls, so the tablet type step and the AA text colours land in one
   * place instead of eight. The INTENT of these two assertions is unchanged:
   * the palette is still theme-derived, and no size is a bare literal. They
   * now pin the seam that provides both.
   *
   * See tests/unit/intake-legibility.test.ts for the sizing and contrast
   * contracts themselves.
   */
  assert.match(CODE, /useIntakeLegibility\(\)/)
  assert.match(CODE, /\bcolors\b/, 'the theme palette is no longer read')
  assert.match(CODE, /fontSize: fs\(\d+\)/)
  assert.doesNotMatch(CODE, /fontSize: \d+/, 'a hardcoded, unscalable size is back')
})

test('accessibilityLabel no longer reads the number aloud', () => {
  // It was `${c.label}, value ${c.value}`, which announced "0, value 0" on an
  // unlabelled scale. The label is now visible, so the number adds only noise.
  assert.doesNotMatch(CODE, /, value \$\{/)
  assert.match(CODE, /accessibilityLabel=\{[A-Za-z_$][\w$]*\.label\}/)
})

test('NO sixth option was added to any screener scale', () => {
  /*
   * The stakeholder asked for a "5+" option. LSNS-6 scores 0-4 per item; a
   * sixth value would change every band threshold and invalidate stored scores.
   * The fix is rendering, not data.
   */
  assert.match(
    CODE,
    /lsns6: \{\s*min: 0,\s*max: 4,\s*labels: \['None', 'One', 'Two', 'Three or four', 'Five or more'\],\s*\}/,
  )
  for (const [kind, max, count] of [['phq2', 3, 4], ['gad2', 3, 4], ['pss4', 4, 5]]) {
    // COS-1221 — every occurrence, so a duplicated key cannot hide behind the
    // first one that happens to still be correct.
    const blocks = [...CODE.matchAll(new RegExp(`${kind}: \\{[\\s\\S]*?\\}`, 'g'))]
    assert.equal(blocks.length, 1, `expected exactly one ${kind} scale, found ${blocks.length}`)
    const block = blocks[0]
    assert.match(block[0], new RegExp(`max: ${max}`), `${kind} range changed`)
    assert.equal(
      block[0].match(/'/g).length / 2,
      count,
      `${kind} should carry exactly ${count} labels`,
    )
  }
})

test('the control stays inside the iOS 26 rendering envelope', () => {
  // This app has crashed in production from cold-mount rendering. No Animated,
  // no react-native-svg (not linked into the iOS binary), no new primitives.
  //
  // COS-1221: this was `.find(...)` — first match only, so a SECOND
  // react-native import line added below would never have been checked. Every
  // such line is checked now.
  const lines = SRC.split('\n').filter((l) => l.includes("from 'react-native'"))
  assert.ok(lines.length > 0, 'expected a react-native import to check')
  const allowed = new Set(['Pressable', 'ScrollView', 'StyleSheet', 'Text', 'View'])
  for (const line of lines) {
    assert.match(line, /\{[^}]*\}/, 'a multi-line react-native import needs a different check')
    for (const n of line.replace(/.*\{([^}]*)\}.*/, '$1').split(',').map((s) => s.trim()).filter(Boolean)) {
      assert.ok(allowed.has(n), `${n} is outside the iOS 26 envelope for this screen`)
    }
  }
  // Checked against the comment-stripped source: the doc comment above the
  // component legitimately explains why Animated was left behind.
  assert.doesNotMatch(CODE, /react-native-svg/)
  assert.doesNotMatch(CODE, /\bAnimated\b/)
})

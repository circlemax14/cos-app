/**
 * COS-927 — the height question is wired end to end, and stores inches.
 *
 * The conversion maths is covered by tests/unit/height-units.test.ts. This
 * covers the plumbing around it, which is where this change could go wrong
 * silently: a unit toggle that renders but writes centimetres into a field
 * every downstream consumer reads as inches would produce a BMI wrong by a
 * factor of 6.45, with nothing on screen to show for it.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const RENDERER = read('components/health-plan/patient-intake/IntakeQuestionRenderer.tsx')
const QUESTION = read('components/health-plan/patient-intake/questions/HeightQuestion.tsx')
const TYPES = read('types/patient-intake.ts')
const REPORT = read('components/health-plan/patient-intake/intake-report-builder.ts')

test('THE POINT: the height input is a HINT, not a new question type', () => {
  /*
   * The renderer's switch has a `default` arm that returns null, so promoting
   * height to a new `type` would show "How tall are you?" with NO INPUT on
   * every app build that predates HeightQuestion — and one stage serves one
   * question list to every app version pointed at it, while an OTA only
   * reaches its own runtime. An unknown optional FIELD is ignored instead, so
   * an older build keeps the plain number box.
   */
  const code = strip(RENDERER)
  assert.match(code, /q\.inputHint === 'height' && q\.type === 'number'/)
  assert.match(code, /<HeightQuestion value=\{typeof v === 'number' \? v : null\}/)
  // It must be checked BEFORE the switch, or `case 'number'` claims it first.
  assert.ok(
    code.indexOf("inputHint === 'height'") < code.indexOf('switch (q.type)'),
    'the hint must be handled before the type switch',
  )
  // And 'height' must NOT have become a question type.
  assert.doesNotMatch(strip(TYPES), /\| 'height'/)
})

test('the hint is a declared, optional field', () => {
  assert.match(strip(TYPES), /inputHint\?: 'height';/)
})

test('THE POINT: what is stored is INCHES, whichever unit was typed', () => {
  /*
   * The whole risk of this change. `height_in` is read as inches by
   * lifestyle-questionnaire.ts (BMI = 703 * lb / in²), by the health-age model,
   * and by every patient answer already on file. The toggle changes the input,
   * never the storage.
   *
   * So the component must convert on the way OUT — it may only ever call
   * onChange with a value that came through one of the two to-inches helpers.
   */
  const code = strip(QUESTION)
  assert.match(code, /onChange\(ftInToInches\(/)
  assert.match(code, /onChange\(cmToInches\(/)
  // ...and never with a raw centimetre reading.
  assert.doesNotMatch(code, /onChange\(Number\(cm\)/)
  assert.doesNotMatch(code, /onChange\(Number\(t\)\)/)
})

test('an empty box is unanswered, not zero', () => {
  // A 0 would pass the server's `typeof value === 'number'` check and be
  // stored as a real height of zero inches.
  const code = strip(QUESTION)
  assert.match(code, /if \(f === '' && i === ''\) \{[\s\S]{0,80}?onChange\(null\)/)
  assert.match(code, /if \(t === ''\) \{[\s\S]{0,80}?onChange\(null\)/)
})

test('the toggle offers exactly the two units Vishal asked for', () => {
  const code = strip(QUESTION)
  assert.match(code, /\['ftin', 'cm'\]/)
  assert.match(code, /Feet & inches/)
  assert.match(code, /Centim/)
})

test('the shared report prints BOTH units', () => {
  // It goes to clinicians, and a bare "71" is ambiguous in a document that
  // also carries centimetre-scaled values.
  const code = strip(REPORT)
  assert.match(code, /q\.inputHint === 'height'/)
  assert.match(code, /formatHeight\(v, 'ftin'\)/)
  assert.match(code, /formatHeight\(v, 'cm'\)/)
})

test('the question is only rendered through components the iOS 26 envelope allows', () => {
  // This app has crashed in production from cold-mount rendering. The sibling
  // question components use View / Text / Pressable / TextInput and so must
  // this one — no new react-native primitives.
  const imports = QUESTION.match(/from 'react-native';/)
  assert.ok(imports, 'expected a react-native import to check')
  const line = QUESTION.split('\n').find((l) => l.includes("from 'react-native'"))
  const allowed = new Set(['Pressable', 'StyleSheet', 'Text', 'TextInput', 'View'])
  const named = line.replace(/.*\{([^}]*)\}.*/, '$1').split(',').map((s) => s.trim()).filter(Boolean)
  for (const n of named) {
    assert.ok(allowed.has(n), `${n} is outside the iOS 26 envelope for this screen`)
  }
})

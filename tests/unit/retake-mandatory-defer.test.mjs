/**
 * COS-763 — the app finally reads the `mandatory` field the BE has been
 * sending all along.
 *
 * The bug this closes is small and entirely one-sided: `POST /:id/snooze` and
 * `POST /:id/dismiss` have refused mandatory rows since #10b, returning
 * `409 REQUEST_MANDATORY`. The app dropped `mandatory` off the row type, so it
 * kept rendering "Not now" and, when the patient tapped through, showed
 * "Couldn't save — try again." That is a lie in the one way that matters:
 * trying again can never work, so the patient retries, fails, and concludes
 * the app is broken.
 *
 * Source-read rather than render: `node --test` cannot resolve the `@/` alias
 * these modules import through, and what is worth protecting here is which
 * decision lives where — one place decides deferability, and every surface
 * asks it — which is exactly what a source read can prove.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')
const api = read('services/api/retake-requests.ts')
const sheet = read('app/Home/retake-snooze-sheet.tsx')

test('THE POINT: `mandatory` survives the wire into the row type', () => {
  // fromRow on the BE coerces it to a real boolean on every row, legacy
  // included, so it is always present — the app was simply discarding it.
  assert.match(api, /mandatory\?: boolean/)
})

test('`mandatory` is optional, so an older BE degrades to deferrable', () => {
  // undefined must read as "the patient may defer". Guessing the other way
  // removes a control someone is entitled to.
  assert.match(api, /export function canDeferRetakeRequest\(/)
  assert.match(api, /return row\.mandatory !== true/)
})

test('THE POINT: a refused defer is not described as retryable', () => {
  // 409 REQUEST_MANDATORY is permanent and explainable. Everything else keeps
  // the retry copy, because everything else genuinely is worth retrying.
  assert.match(api, /export function retakeDeferErrorMessage\(/)
  assert.match(api, /REQUEST_MANDATORY/)
  assert.match(api, /Couldn't save — try again\./)
})

test('the BE `code` is matched before the bare status', () => {
  // The code is the contract; the 409 is the fallback for a BE that shipped
  // the refusal before the code. Reading the status first would misclassify
  // any future 409 on these routes as "mandatory".
  const iCode = api.indexOf("code === MANDATORY_CODE")
  const iStatus = api.indexOf("status === 409")
  assert.ok(iCode > -1 && iStatus > -1)
  assert.ok(iCode < iStatus, 'the code check must come first')
})

test('the snooze sheet uses the shared message, not its own string', () => {
  assert.match(sheet, /retakeDeferErrorMessage/)
  // Both paths — a snooze preset and the dismiss — can hit the refusal.
  const hits = sheet.match(/retakeDeferErrorMessage\(err\)/g) ?? []
  assert.equal(hits.length, 2, 'both snooze and dismiss must use it')
})

test('the sheet no longer hard-codes the retry copy at either call site', () => {
  assert.ok(
    !/setErrorMsg\("Couldn't save/.test(sheet),
    'a hard-coded retry message would bypass the mandatory case',
  )
})

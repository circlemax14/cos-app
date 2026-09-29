/**
 * COS-1162 — the "Flagged Lab Results" card decided "flagged" from EHR free
 * text, and ignored the one structured signal it had.
 *
 * Two defects, one card:
 *
 *  (a) `isFlagged` matched `interpretation` — the lab's printed free text —
 *      against a fixed set. Measured over 2,717 laboratory Observations in the
 *      shared datastore: 298 carry an interpretation, of which 211 are coded
 *      abnormal by HL7 code but only 162 matched the string set. 49 (23%) were
 *      missed. The largest group is 47 rows whose text is "above high normal",
 *      which is simply the HL7 print-name for code H — among them a serum
 *      glucose of 256 mg/dL, coded H by the lab, rendering unflagged.
 *
 *  (b) `alertLevel`, the server's panic-value verdict (COS-1120), has been on
 *      the wire since 2026-09-25 and was read by NOTHING — it was not even
 *      declared on the client type. 7 observations qualify, all potassium at
 *      6.2-6.9 mmol/L, and all 7 carry NO interpretation element, so the string
 *      match returned false and they rendered as ordinary grey rows.
 *
 * And the two halves of the card disagreed with each other: `flagStyle`
 * handled 'a'/'aa'/'hh'/'ll' while `isFlagged` did not, so a result coded 'A'
 * painted a visible "Abnormal" badge AND was excluded from the count.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyFlag } from '../../lib/lab-flagging.ts';
import type { LabResultValue } from '../../services/api/types.ts';

const row = (v: Partial<LabResultValue>): LabResultValue => ({ name: 'Analyte', ...v });

test('THE PANIC VALUE: alertLevel wins over everything, including silence', () => {
  // The real shape: potassium 6.9 mmol/L, no interpretation element at all.
  assert.equal(
    classifyFlag(row({ name: 'Potassium', value: '6.9', unit: 'mmol/L', alertLevel: 'critical' })),
    'critical',
  );
  // Even when the source says it is fine.
  assert.equal(
    classifyFlag(row({ alertLevel: 'critical', interpretationCode: 'N', interpretation: 'Normal' })),
    'critical',
  );
});

test('THE 47 MISSED ROWS: "above high normal" is code H and must flag', () => {
  // Verbatim from the datastore: text "above high normal", coding H/"High",
  // glucose 256 mg/dL.
  const glucose = row({
    name: 'glucose, serum',
    value: '256',
    unit: 'mg/dL',
    interpretation: 'above high normal',
    interpretationCode: 'H',
  });
  assert.equal(classifyFlag(glucose), 'high');
});

test('the HL7 code is read, not the free text around it', () => {
  for (const [code, kind] of [
    ['H', 'high'], ['HH', 'high'], ['L', 'low'], ['LL', 'low'],
    ['A', 'abnormal'], ['AA', 'abnormal'],
  ] as const) {
    assert.equal(
      classifyFlag(row({ interpretationCode: code, interpretation: 'whatever the lab printed' })),
      kind,
      `code ${code}`,
    );
  }
});

test('a code that says NORMAL is believed — it does not fall through to the text', () => {
  // Falling through is what let one row match on two different tiers.
  assert.equal(classifyFlag(row({ interpretationCode: 'N', interpretation: 'high' })), null);
});

test('the display string is still read when the source sent no code', () => {
  // 89% of the record has no interpretation element; of those that do, older
  // sources may carry text only. This tier must not regress.
  assert.equal(classifyFlag(row({ interpretation: 'High' })), 'high');
  assert.equal(classifyFlag(row({ interpretation: 'low' })), 'low');
  assert.equal(classifyFlag(row({ interpretation: 'Abnormal' })), 'abnormal');
  assert.equal(classifyFlag(row({ interpretation: 'above high normal' })), 'high');
});

test('the aliases the badge already handled now count too', () => {
  // 'a'/'aa'/'hh'/'ll' painted a badge but were excluded from the count.
  for (const t of ['a', 'aa', 'hh', 'll']) {
    assert.notEqual(classifyFlag(row({ interpretation: t })), null, t);
  }
});

test('silence and non-answers are NOT flagged, and are not reassurance either', () => {
  for (const t of [undefined, '', '   ', 'normal', 'N', 'pending', 'n/a', 'see comment', 'unknown']) {
    assert.equal(classifyFlag(row({ interpretation: t })), null, JSON.stringify(t));
  }
  // A bare row: nothing marked it. That is "unknown", not "fine".
  assert.equal(classifyFlag(row({})), null);
});

test('THE CONTRADICTION IS STRUCTURAL NOW: one classifier drives badge and count', () => {
  /*
   * The badge and the count previously came from two different sets. Anything
   * classifyFlag returns is both counted and painted; anything it rejects is
   * neither. This asserts the shapes stay in lockstep for every kind.
   */
  const kinds = ['critical', 'high', 'low', 'abnormal'];
  const seen = new Set<string>();
  for (const code of ['H', 'HH', 'L', 'LL', 'A', 'AA']) {
    const k = classifyFlag(row({ interpretationCode: code }));
    if (k) seen.add(k);
  }
  seen.add(classifyFlag(row({ alertLevel: 'critical' })) ?? '');
  assert.deepEqual([...seen].sort(), kinds.sort());
});

/**
 * COS-1141 — a provider's narrative can only render on that provider's page.
 *
 * Ken, 2026-09-26: "This summary came in under notes for Rebecca. This should
 * have come in under conditions for Christina the PT."
 *
 * The placement half is COS-1140. This is the other half, and it is the
 * serious one: Christina's summary was rendering on Rebecca's page.
 *
 * Expo Router reuses this screen when only `params.id` changes. The narrative
 * lived in a bare `useState`, and its loader guards with
 * `if (aiProgressNotes) return` — so provider -> provider navigation kept the
 * previous narrative in state, the guard refused to refetch, and the old
 * summary stayed on screen under the new provider's name.
 *
 * On a screen that shows one clinician's account of a patient's care, the
 * wrong clinician against the wrong summary is a clinical-safety bug, not a
 * cosmetic one. These tests pin the shape that makes it impossible rather than
 * merely unlikely.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SCREEN = readFileSync(new URL('../../app/Home/doctor-detail.tsx', import.meta.url), 'utf8');

// The screen's comments quote the bug and Ken's words, so match on code only.
const CODE = SCREEN.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('the narrative is stored WITH the provider it describes', () => {
  assert.match(CODE, /useState<\s*\{ providerId: string; data: ProviderProgressNotes \} \| null\s*>/);
});

test('ownership is enforced in the READ, not at each render site', () => {
  /*
   * The check has to sit where the value is produced. Enforced per render
   * site, it is one forgotten `&&` away from returning — and the failure is
   * silent and plausible-looking, which is the worst kind on this screen.
   */
  assert.match(
    CODE,
    /const aiProgressNotes =\s*\n?\s*aiProgress && aiProgress\.providerId === providerId \? aiProgress\.data : null;/,
  );
});

test('nothing writes the narrative without naming its provider', () => {
  // A bare setter would reintroduce the bug in one line.
  assert.ok(!CODE.includes('setAiProgressNotes('), 'no unowned setter remains');
  assert.match(CODE, /setAiProgress\(\{ providerId, data \}\)/);
});

test('a failed load does not suppress the retry for a DIFFERENT provider', () => {
  /*
   * The error is also stamped with its provider. Without that, one provider
   * failing would leave `aiProgressError` set and block the fetch for every
   * provider visited afterwards.
   */
  assert.match(CODE, /if \(aiProgressFor === providerId && aiProgressError\) return;/);
  const errBlock = CODE.slice(CODE.indexOf('setAiProgressError('));
  assert.ok(errBlock.includes('setAiProgressFor(providerId)'), 'error records its provider');
});

test('the loader re-runs when the provider changes', () => {
  const i = CODE.indexOf("activeTab !== 'treatment'");
  assert.ok(i > -1);
  const deps = CODE.slice(i, CODE.indexOf('];', i));
  assert.ok(deps.includes('providerId'), 'providerId is a dependency');
});

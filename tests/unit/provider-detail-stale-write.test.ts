/**
 * COS-1161 — provider A's clinical data could land on provider B's page.
 *
 * Expo Router REUSES this screen when only `params.id` changes (one route
 * entry per name; every entry point is a router.push from a list). So two runs
 * of the provider-data effect can be in flight at once. It was always keyed on
 * `providerId`, so it re-ran correctly — what it lacked was CANCELLATION, and
 * without that the slower run wins: A's diagnoses, medications, appointments
 * and care plans are written onto B's page, with `isLoadingData` already
 * flipped to false so the page looks settled.
 *
 * The sibling visit-cards effect in the same file has had the guard all along,
 * which is why that one section showed the right provider while the rest of
 * the page did not.
 *
 * Same class as COS-1141, different mechanism: that was a stale-state
 * short-circuit refusing to refetch, fixed by pairing state with its owner.
 * This one refetches and then writes the loser's answer.
 *
 * No renderer in this repo, so these are structural — but they check the
 * INVARIANT (no state write after an await without a guard), not a substring.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const strip = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const SCREEN = strip(readFileSync(new URL('../../app/Home/doctor-detail.tsx', import.meta.url), 'utf8'));
const HOOK = strip(readFileSync(new URL('../../hooks/use-doctor.ts', import.meta.url), 'utf8'));

/** The body of the provider-data effect, from its declaration to its dep array. */
function providerDataEffect(): string {
  const start = SCREEN.indexOf('const loadProviderData = async () => {');
  assert.ok(start > 0, 'loadProviderData effect not found — was it renamed?');
  const end = SCREEN.indexOf('}, [providerId, providerName', start);
  assert.ok(end > start, 'effect dependency array not found');
  return SCREEN.slice(start, end);
}

test('the effect declares a cancellation flag and clears it on cleanup', () => {
  const start = SCREEN.indexOf('const loadProviderData = async () => {');
  // The flag must be declared in the EFFECT, above the async body.
  const preamble = SCREEN.slice(SCREEN.lastIndexOf('useEffect(() => {', start), start);
  assert.match(preamble, /let cancelled = false;/);

  const body = providerDataEffect();
  assert.match(body, /return \(\) => \{\s*cancelled = true;\s*\};/);
});

test('THE INVARIANT: no state is written after an await without a guard', () => {
  /*
   * Split the effect on `await`. Every segment after the first is code that
   * runs once the screen may already belong to a different provider, so it
   * must re-check `cancelled` before the first setter it reaches.
   */
  const segments = providerDataEffect().split(/\bawait\b/);
  segments.slice(1).forEach((seg, i) => {
    const firstSetter = seg.search(/\bset[A-Z]\w*\(/);
    if (firstSetter === -1) return; // nothing written in this segment
    const beforeSetter = seg.slice(0, firstSetter);
    assert.match(
      beforeSetter,
      /cancelled/,
      `segment ${String(i + 1)} after an await writes state before re-checking cancelled`,
    );
  });
});

test('the loading flags are guarded too — an abandoned run must not clear the spinner', () => {
  // Otherwise B renders empty-but-finished while its own fetch is still going.
  assert.match(
    providerDataEffect(),
    /if \(!cancelled\) \{\s*setIsLoadingProvider\(false\);\s*setIsLoadingData\(false\);\s*\}/,
  );
});

test('the sibling visit-cards effect still has its guard', () => {
  // It is the precedent this fix follows; losing it would reopen the same hole.
  const i = SCREEN.indexOf('fetchProviderDetail(providerId)');
  assert.ok(i > 0);
  const around = SCREEN.slice(SCREEN.lastIndexOf('useEffect', i), i + 600);
  assert.match(around, /if \(cancelled\) return;/);
  assert.match(around, /cancelled = true;/);
});

test('COS-1161: an absent stored row CLEARS the doctor, it does not keep the last one', () => {
  /*
   * `doctor` outlives a providerId change because the screen is reused. Gating
   * the write on `if (stored)` meant switching from a provider with a saved
   * row to one without kept the previous provider's name, phone, email and
   * photo — and doctor-detail reads `doctorData?.name` FIRST, so that stale
   * name became the header. Deterministic; no race required.
   */
  const writes = [...HOOK.matchAll(/setDoctor\(([^;]*?)\);/g)].map((m) => m[1]);
  assert.ok(writes.length >= 2, `expected the loader and refresh writes, saw ${String(writes.length)}`);

  // Neither read site may be gated on `stored` being present any more.
  assert.doesNotMatch(HOOK, /if \(stored[^)]*\) \{\s*setDoctor/);
  // Both must pass null through explicitly.
  const nullable = writes.filter((w) => /stored \?.*: null/.test(w));
  assert.equal(nullable.length, 2, `both setDoctor reads must clear on absent, saw ${String(nullable.length)}`);
});

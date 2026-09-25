/**
 * COS-1093 — the recency filter must never claim a patient has no providers.
 *
 * Mirrors filterProvidersByRecency in app/modal.tsx. Kept as a pure function
 * here because that file is a 1,200-line screen and `node --test` cannot mount
 * it; the logic under test is the branch order, which is copied verbatim.
 */
const { test } = require('node:test');
const assert = require('node:assert');

type P = {
  recencyBand?: 'current-acute' | 'recent-stable' | 'stable-resolved' | null;
  isManual?: boolean;
  category?: string;
};

function filterByRecency(providers: P[], recencyFilter: string | null): P[] {
  if (!recencyFilter || recencyFilter === 'all') return providers;
  const anyBanded = providers.some((p) => p.recencyBand != null);
  if (!anyBanded) return providers;
  return providers.filter((p) => {
    if (p.isManual) return true;
    if (p.category && p.category.toLowerCase() !== 'medical') return true;
    return p.recencyBand === recencyFilter;
  });
}

const med = (band: P['recencyBand']): P => ({ recencyBand: band, category: 'medical' });

test('shows everyone when NOTHING can be banded', () => {
  // The dev account's fhirPatientId is cos-mock-*, so it has no HealthLake
  // records and every provider comes back with recencyBand null. Filtering on
  // that hid all 59 and showed an empty Medical tab — the screen claiming the
  // patient has no providers when we simply could not date the ones they have.
  const all = [med(null), med(null), med(undefined)];
  assert.strictEqual(filterByRecency(all, 'current-acute').length, 3);
});

test('DOES filter when at least one provider is banded', () => {
  const mixed = [med('current-acute'), med('stable-resolved'), med(null)];
  assert.strictEqual(filterByRecency(mixed, 'current-acute').length, 1);
});

test('an empty band is a truthful answer, not a bug', () => {
  // A patient whose providers are all three years old should open on an empty
  // "Current & acute" and switch tabs. The bypass above is only for "no answer
  // exists at all", never for "the answer is none".
  const old = [med('stable-resolved'), med('stable-resolved')];
  assert.strictEqual(filterByRecency(old, 'current-acute').length, 0);
});

test('never hides the care circle or non-medical supports', () => {
  const circle: P[] = [
    med('stable-resolved'),
    { isManual: true },
    { category: 'social', recencyBand: null },
  ];
  const shown = filterByRecency(circle, 'current-acute');
  assert.strictEqual(shown.length, 2);
});

test('"all" and no selection both show everyone', () => {
  const some = [med('current-acute'), med('stable-resolved')];
  assert.strictEqual(filterByRecency(some, 'all').length, 2);
  assert.strictEqual(filterByRecency(some, null).length, 2);
});

// ─── COS-1121 — the filter must not hide data the user never filtered ────
const { readFileSync: readSrc } = require('node:fs');
const { join } = require('node:path');
const MODAL = readSrc(join(__dirname, '..', '..', 'app', 'modal.tsx'), 'utf8');

test('THE POINT: the recency filter opens on EVERYONE, not a pre-applied band', () => {
  // Defaulting to 'current-acute' silently removed anyone last seen over a
  // year ago. On the pilot record that is almost everyone, so every Medical
  // sub-category rendered empty and the founder reported "I can see provider
  // bubbles but no providers under Medical".
  assert.match(
    MODAL,
    /useState<string \| null>\('all'\)/,
    'the filter must default to all — a filter the user did not set must not hide their data',
  );
});

test('the "showing everyone" banner reads the providers the category ACTUALLY holds', () => {
  // category.doctors is hard-coded [] at construction, so anyRecencyData()
  // over it was always false and the banner rendered on every filtered view —
  // asserting "Showing everyone" at the moment the filter was hiding people.
  assert.match(MODAL, /!anyRecencyData\(providersInCategory\(category\)\)/);
  assert.doesNotMatch(MODAL, /!anyRecencyData\(category\.doctors\)/);
});

test('an empty sub-category distinguishes filtered-out from genuinely empty', () => {
  // "You have no providers" is false when the truth is "a control you never
  // touched removed them", and the patient had no way to discover which.
  assert.match(MODAL, /const hiddenByFilter =/);
  assert.match(MODAL, /Show everyone/);
});

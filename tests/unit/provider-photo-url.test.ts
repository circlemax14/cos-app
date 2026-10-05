/**
 * Clinic-crawler photos — the provider list starts carrying `photoUrl`.
 *
 * The backend matches a provider to a staff photo crawled from their clinic's
 * website and sends a presigned https URL that expires in about six hours.
 * Three rules follow from that, and each one is pinned here:
 *
 *   1. A photo the patient chose on this device still wins.
 *   2. The URL expires, so it is never saved anywhere: not into the circle
 *      selection the server stores, and the ring never renders a saved one.
 *   3. When the server sends nothing, every avatar is exactly what it was.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  remotePhotoUrl,
  providerPhotoUrl,
  withFreshPhotos,
  needsPhotoRefetch,
  PHOTO_LIST_MAX_AGE_MS,
} from '../../lib/provider-photo-url.ts';
import { dedupeProviders } from '../../lib/provider-relevance.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const SIGNED = 'https://cos-clinic-crawler-dev-676726973617.s3.us-east-1.amazonaws.com/clinic-images/a.jpg?X-Amz-Signature=abc';

test('remotePhotoUrl takes an https string and nothing else', () => {
  assert.equal(remotePhotoUrl(SIGNED), SIGNED);
  for (const bad of [undefined, null, '', 42, {}, 'http://x/a.jpg', 'clinic-images/a.jpg', 'file:///a.jpg']) {
    assert.equal(remotePhotoUrl(bad), undefined, String(bad));
  }
});

test('remotePhotoUrl keeps only the crawler bucket: any other host would learn who this patient sees', () => {
  for (const ok of [
    SIGNED,
    'https://cos-clinic-crawler-production-676726973617.s3.amazonaws.com/clinic-images/b.png?X-Amz-Signature=x',
  ]) {
    assert.equal(remotePhotoUrl(ok), ok, ok);
  }
  for (const bad of [
    'https://clinic.example/staff.jpg',
    'https://cos-documents-dev-676726973617.s3.us-east-1.amazonaws.com/clinic-images/a.jpg',
    'https://cos-clinic-crawler-dev-111111111111.s3.amazonaws.com/clinic-images/a.jpg',
    'https://cos-clinic-crawler-dev-676726973617.s3.amazonaws.com.evil.example/a.jpg',
    'https://cos-clinic-crawler-dev-676726973617.s3.amazonaws.com@evil.example/a.jpg',
    'https://evil.example/https://cos-clinic-crawler-dev-676726973617.s3.amazonaws.com/a.jpg',
  ]) {
    assert.equal(remotePhotoUrl(bad), undefined, bad);
  }
});

test('THE POINT: a photo chosen on this device beats the clinic photo', () => {
  const local = new Map([['p1', 'file:///mine.jpg']]);
  assert.equal(providerPhotoUrl(local, { id: 'p1', photoUrl: SIGNED }), 'file:///mine.jpg');
  assert.equal(providerPhotoUrl(local, { id: 'p2', photoUrl: SIGNED }), SIGNED);
});

test('no local photo and no clinic photo is null, exactly as before', () => {
  assert.equal(providerPhotoUrl(new Map(), { id: 'p1' }), null);
});

test('the ring never renders a saved photoUrl, only the one just fetched', () => {
  const saved = [
    { id: 'a', name: 'A', photoUrl: 'https://old/expired.jpg' },
    { id: 'b', name: 'B' },
  ];
  const out = withFreshPhotos(saved, [{ id: 'a' }, { id: 'b', photoUrl: SIGNED }]);
  assert.equal(out[0].photoUrl, undefined);
  assert.equal(out[1].photoUrl, SIGNED);
  assert.equal(out[1].name, 'B');
  // nothing fetched yet: the ring looks like it does today
  assert.deepEqual(withFreshPhotos(saved, []).map((p) => p.photoUrl), [undefined, undefined]);
});

test('transformToProvider passes photoUrl through the https gate, omitting it when absent', () => {
  const src = read('services/api/providers.ts');
  assert.match(src, /photoUrl\?: string;/);
  assert.match(src, /remotePhotoUrl\(practitioner\.photoUrl\)/);
  assert.match(src, /\.\.\.\(photoUrl \? \{ photoUrl \} : \{\}\)/);
});

test('every avatar drawn from the on-device photo map falls back to the clinic photo', () => {
  const sites: Record<string, number> = {
    'app/Home/index.tsx': 5,
    'app/Home/doctor-detail.tsx': 1,
    'app/(doctor-detail)/index.tsx': 1,
    'app/modal.tsx': 2,
  };
  for (const [file, n] of Object.entries(sites)) {
    const src = read(file);
    assert.doesNotMatch(src, /doctorPhotos\.get\(/, `${file} still reads the map directly`);
    const uses = src.match(/providerPhotoUrl\(doctorPhotos, \w+\)/g) ?? [];
    assert.equal(uses.length, n, file);
  }
});

test('both doctor headers fall back to the provider photo; an empty saved photo does not block it', () => {
  for (const file of ['app/Home/doctor-detail.tsx', 'app/(doctor-detail)/index.tsx']) {
    assert.match(read(file), /imageUrl=\{doctorData\?\.photoUrl \|\| provider\?\.photoUrl \|\| null\}/, file);
  }
});

test('the ring is fed fresh photos from the provider list', () => {
  const src = read('app/Home/index.tsx');
  // Home used to drop the fetched list on the floor (`const [, setFastenProviders]`).
  assert.doesNotMatch(src, /const \[, setFastenProviders\]/);
  assert.match(src, /withFreshPhotos\(selectedProviders\.slice\(0, MAX_SELECTED_PROVIDERS\), fastenProviders\)/);
});

test('a presigned photoUrl is never saved into the circle selection', () => {
  const src = read('stores/provider-selection-store.tsx');
  assert.match(src, /const next = \[\.\.\.prev, \{ \.\.\.provider, photoUrl: undefined \}\];/);
});

test('a raster photo never reaches an SVG-only iconUrl prop', () => {
  for (const file of ['app/Home/index.tsx', 'app/Home/doctor-detail.tsx', 'app/(doctor-detail)/index.tsx', 'app/modal.tsx']) {
    assert.doesNotMatch(read(file), /iconUrl=\{[^}]*photoUrl/, file);
  }
});

test('collapsing a duplicate keeps the photo even when it was on the row that lost', () => {
  // Same clinician under two connections: only one clinic's site was crawled.
  for (const rows of [
    [{ name: 'Lisa B, PT', recordCount: 0, photoUrl: SIGNED }, { name: 'Lisa B, PT', recordCount: 12 }],
    [{ name: 'Lisa B, PT', recordCount: 12 }, { name: 'Lisa B, PT', recordCount: 0, photoUrl: SIGNED }],
  ]) {
    const [kept] = dedupeProviders(rows);
    assert.equal(kept.recordCount, 12);
    assert.equal(kept.photoUrl, SIGNED);
  }
  // No photo anywhere: the survivor is the very same object, as before.
  const plain = [{ name: 'Lisa B, PT', recordCount: 0 }, { name: 'Lisa B, PT', recordCount: 12 }];
  assert.equal(dedupeProviders(plain)[0], plain[1]);
});

test('the Epic-id/NPI pair collapse keeps the photo too', () => {
  assert.match(read('services/api/providers.ts'), /out\.push\(withPhotoFrom\(withData\[0\], group\.find\(\(p\) => p !== withData\[0\]\)\)\)/);
});

test('a photo list is refetched before its 6h presign runs out, and only if it holds a photo', () => {
  const HOUR = 60 * 60 * 1000;
  assert.ok(PHOTO_LIST_MAX_AGE_MS < 6 * HOUR, 'must refetch while the URLs still work');
  const t0 = 1_000_000;
  const withPhoto = [{ id: 'a' }, { id: 'b', photoUrl: SIGNED }];
  assert.equal(needsPhotoRefetch(withPhoto, t0, t0 + PHOTO_LIST_MAX_AGE_MS - 1), false);
  assert.equal(needsPhotoRefetch(withPhoto, t0, t0 + PHOTO_LIST_MAX_AGE_MS), true);
  // No photos (backend flag off): never refetches, so nothing changes from today.
  assert.equal(needsPhotoRefetch([{ id: 'a' }], t0, t0 + 48 * HOUR), false);
  assert.equal(needsPhotoRefetch([], t0, t0 + 48 * HOUR), false);
});

test('every Home provider list re-signs its photos on foreground, keeping its rows', () => {
  const src = read('app/Home/index.tsx');
  // Home is the root tab and outlives the 6h presign by days: the ring's list,
  // ListView's categorised copy and ProviderDetailsList's copy each refresh.
  const uses = src.match(/useRefreshExpiringPhotos\(/g) ?? [];
  assert.equal(uses.length, 3);
  assert.match(src, /useRefreshExpiringPhotos\(fastenProviders, \(fresh\) => setFastenProviders\(\(prev\) => withFreshPhotos\(prev, fresh\)\)\)/);
  assert.match(src, /useRefreshExpiringPhotos\(listedProviders, \(fresh\) =>\s+setProvidersBySubCategory\(\(prev\) => new Map\(\[\.\.\.prev\]\.map\(\(\[k, list\]\) => \[k, withFreshPhotos\(list, fresh\)\]\)\)\)/);
  const hook = read('hooks/use-refresh-expiring-photos.ts');
  assert.match(hook, /AppState\.addEventListener\('change'/);
  assert.match(hook, /needsPhotoRefetch\(/);
  // fetchProviders answers [] on failure: that must not wipe the photos held.
  assert.match(hook, /if \(fresh\.length\) apply\(fresh\)/);
});

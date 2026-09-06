/**
 * COS-891 — name, email and photo are kept on the device, and kept CURRENT.
 *
 * Vishal: "make sure the username, email and the photo is stored in the
 * device. Even when they try to update it, we will update the local storage
 * of the device so that we don't have to call it every time from our server."
 *
 * The cache existed (SCRUM-265 #16) but only the drawer's own profile fetch
 * ever wrote it, and the photo field it wrote was a PRESIGNED URL with no
 * record of when it was signed — so nothing could safely reuse it, and
 * nothing did. Uploading a photo updated memory and left the device holding
 * the previous one.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const code = (p) =>
  readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

const cache = code('lib/cached-user-summary.ts')
const store = code('stores/user-photo-store.tsx')
const drawer = code('components/profile-content.tsx')
const photoSvc = code('services/user-photo.ts')

test('THE POINT: a partial update keeps the fields it was not given', () => {
  // Callers know one field. Forcing them to supply name+email to save a photo
  // is why only the fetch-everything path ever wrote the cache.
  assert.match(cache, /export async function updateCachedUserSummary/)
  assert.match(cache, /\{ \.\.\.current, \.\.\.patch \}/)
})

test('THE POINT: the photo is stored WITH the time it was signed', () => {
  // A presigned URL without its signing time is unusable: a reader cannot
  // tell one signed a minute ago from one signed last week.
  assert.match(cache, /photoSignedAt\?: number/)
})

test('every commit of the photo writes through to the device', () => {
  const commit = store.match(/const commitUrl = useCallback[\s\S]*?\n  \}, \[\]\);/)
  assert.ok(commit, 'commitUrl must exist')
  assert.match(commit[0], /updateCachedUserSummary\(/)
  assert.match(commit[0], /photoSignedAt/)
})

test('the upload path writes through too', () => {
  const setter = store.match(/const setPhotoUrl = useCallback[\s\S]*?\n  \);/)
  assert.ok(setter, 'setPhotoUrl must exist')
  assert.match(setter[0], /updateCachedUserSummary\(/)
})

test('an UNSIGNED url is cached without a timestamp, so it is never reused', () => {
  const setter = store.match(/const setPhotoUrl = useCallback[\s\S]*?\n  \);/)
  assert.match(setter[0], /isSignedPhotoUrl\(url\) \? Date\.now\(\) : undefined/)
})

test('THE POINT: a still-valid cached photo costs ZERO requests on cold start', () => {
  assert.match(store, /const cached = await getCachedUserSummary\(\)/)
  assert.match(store, /Date\.now\(\) - signedAt < PHOTO_URL_CLIENT_TTL_MS/)
})

test('and a stale or unsigned one still falls through to the network', () => {
  const hydrate = store.match(/const cached = await getCachedUserSummary\(\)[\s\S]*?\n  \}, \[refresh\]\);/)
  assert.ok(hydrate, 'the hydrate effect must exist')
  assert.match(hydrate[0], /await refresh\(\)/)
})

test('the reuse window stays inside the signature lifetime', () => {
  // Reusing a URL past its signature would serve a guaranteed 403.
  assert.match(photoSvc, /PHOTO_URL_CLIENT_TTL_MS = 45 \* 60 \* 1000/)
  assert.match(photoSvc, /PHOTO_URL_CLIENT_TTL_MS >= PHOTO_SIGNATURE_TTL_MS/)
})

test('the drawer no longer clobbers the photo it does not own', () => {
  // It called setCachedUserSummary (whole-record replace) with a presigned URL
  // and no timestamp, wiping what the photo store had just written.
  assert.doesNotMatch(drawer, /setCachedUserSummary\(/)
  assert.match(drawer, /updateCachedUserSummary\(\{ name: freshName, email: freshEmail \}\)/)
})

test('signing out still clears it', () => {
  assert.match(code('services/auth.ts'), /clearCachedUserSummary\(\)/)
})

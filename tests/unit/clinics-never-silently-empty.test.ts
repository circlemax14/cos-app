/**
 * COS-1066 — a failed clinics load must never look like "you have none".
 *
 * Ken connected a clinic, saw "No connected clinics yet", was told to wait,
 * checked again, and reported it still broken. Two days of that, and the app
 * could not have told him anything else: there were TWO silent catches on one
 * path.
 *
 * COS-1059 gave `use-connected-ehrs` a `loadFailed` state so a broken load
 * would stop claiming the patient has no clinics. That fix could never fire —
 * `fetchConnectedClinics` sat underneath it ending in `catch { return [] }`, so
 * every timeout, 500, 403 and expired token reached the hook as a SUCCESSFUL
 * response containing nothing. Which is precisely what an empty array is.
 *
 * The lesson is the one the repo keeps relearning: an empty result is a claim
 * about the patient. Only make it when it is true.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const api = readFileSync(new URL('../../services/api/clinics.ts', import.meta.url), 'utf8');
const hook = readFileSync(new URL('../../hooks/use-connected-ehrs.ts', import.meta.url), 'utf8');
const screen = readFileSync(new URL('../../app/Home/connected-ehrs.tsx', import.meta.url), 'utf8');

const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const apiCode = strip(api);
/*
 * Stripped, because the banner's own comment QUOTES the old wording in order to
 * explain why it changed. Asserting against the raw file makes the guard trip on
 * the documentation of the rule it enforces — the same mistake this repo made in
 * social-tab-entry.test.ts the same day.
 */
const screenCode = strip(screen);
const hookCode = strip(hook);

describe('COS-1066 — the API layer does not swallow', () => {
  test('THE POINT: fetchConnectedClinics has no catch-to-empty', () => {
    const fn = apiCode.slice(apiCode.indexOf('export async function fetchConnectedClinics'));
    const body = fn.slice(0, fn.indexOf('\n}') + 2);
    assert.ok(
      !/catch[\s\S]{0,40}return\s*\[\]/.test(body),
      'fetchConnectedClinics must let failures propagate — returning [] makes an error ' +
        'indistinguishable from "this patient has no clinics", which is what hid Ken\'s problem',
    );
  });

  test('it still tolerates a missing data array without inventing an error', () => {
    // A 200 with no `data` is a different thing from a failed request: it is a
    // real answer that happens to be empty, and mapping over undefined would
    // turn it into a crash.
    assert.match(apiCode, /res\.data\.data \?\? \[\]/);
  });

  test('the hook still owns what a failure MEANS', () => {
    /*
     * The point is not "throw"; it is that one layer decides. The hook has the
     * failure state and the copy, so it must be the one that sees the error.
     */
    assert.match(hookCode, /loadFailed/);
    assert.match(hookCode, /catch/);
  });
});

describe('COS-1066 — the importing copy tells the truth about the wait', () => {
  test('THE POINT: it no longer promises "a few minutes"', () => {
    /*
     * Ken's export took nineteen hours — he connected 2026-09-18 and the first
     * Fasten webhook landed 2026-09-19T11:08Z. An Epic EHI export is a bulk job
     * queued on their side; we do not request it and cannot hurry it.
     *
     * Under-promising the wait does not reassure anyone. It produces a second
     * complaint from someone who did exactly what the screen told them.
     */
    assert.ok(
      !/takes a few minutes/.test(screenCode),
      'the importing banner must not promise minutes — the real wait is hours to a day',
    );
    assert.match(screenCode, /several\s*\n?\s*hours/);
  });

  test('it still says not to connect again', () => {
    // The instruction that would have saved him two retries.
    assert.match(screenCode, /do not need to connect\s*\n?\s*again/);
  });
});

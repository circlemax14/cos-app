/**
 * COS-1023 — the Reports screen was reading the wrong payload.
 *
 * Ken: our reports are "not meaningful" and look "way too old-fashioned"
 * next to MyChart. The cause was not styling.
 *
 *  1. The detail endpoint was never called. fetchReportById() sat in the API
 *     layer imported by NOTHING, so results[], findings, impression, exam,
 *     clinicalHistory, technique and presentedForms never reached the screen.
 *     LabResultsTable — 192 lines with abnormal-first sorting and reference
 *     ranges — is imported by this screen and could never render a row.
 *
 *  2. The AI summary was generated from a title, a date and a provider name.
 *     The screen passed the clinical fields off a LIST row, where every one of
 *     them is undefined and is dropped from the JSON. report-summary.routes.ts
 *     has accepted `{ reportId }` all along; its own comment claims "The
 *     frontend sends { reportId }". It did not.
 *
 *  3. Dates printed as raw ISO timestamps — beside a "Generated" date that was
 *     formatted, in the same sentence.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const SCREEN = stripComments(read('app/Home/reports.tsx'));
const API = read('services/api/report-summary.ts');

test('THE POINT: opening a report fetches the detail that carries the clinical content', () => {
  assert.match(SCREEN, /import \{ fetchReports, fetchReportById \}/);
  assert.match(SCREEN, /await fetchReportById\(report\.id\)/);
});

test('the hydrate cannot attach one report\'s detail to another', () => {
  // The patient can go back and open a different report while the request is
  // in flight. Merging blind would show report A's labs under report B.
  assert.match(SCREEN, /current && current\.id === full\.id/);
});

test('the summary is requested BY ID, not by a payload of undefineds', () => {
  assert.match(SCREEN, /fetchReportSummary\(\{ reportId: selectedReport\.id \}\)/);
  // The legacy field-by-field call must be gone from this screen.
  assert.doesNotMatch(SCREEN, /clinicalHistory: selectedReport\.clinicalHistory/);
  assert.doesNotMatch(SCREEN, /findings: selectedReport\.findings/);
});

test('the client type can express the shape the server prefers', () => {
  assert.match(API, /ReportSummaryByIdRequest/);
  assert.match(API, /reportId: string/);
  // The legacy shape stays — admin tools and scripts still pre-fetch.
  assert.match(API, /ReportSummaryLegacyRequest/);
});

test('no report date reaches the patient as a raw ISO timestamp', () => {
  assert.doesNotMatch(SCREEN, /\{report\.date\}/);
  assert.doesNotMatch(SCREEN, /\{selectedReport\.date\}/);
  assert.match(SCREEN, /function formatReportDate/);
});

test('an unparseable date degrades to the stored value, not "Invalid Date"', () => {
  assert.match(SCREEN, /Number\.isNaN\(d\.getTime\(\)\)\) return value/);
});

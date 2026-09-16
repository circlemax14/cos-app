/**
 * COS-1024 — the History tab did the exact thing its endpoint was built to stop.
 *
 * cos-backend/src/services/history-overview.service.ts says, in its own header:
 *
 *   "users stare at a blank screen until the LLM call finishes. This endpoint
 *    gives the UI something to render immediately: record counts and top-N
 *    recent items across the same categories the AI summary covers."
 *
 * GET /v1/patients/me/history-overview is live and registered. cos-app had no
 * client for it, so the History tab showed a full-screen blocking overlay for
 * up to 90 seconds whose payoff is one undifferentiated paragraph.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
const SCREEN = stripComments(read('app/Home/reports.tsx'));
const CLIENT = read('services/api/history-overview.ts');

test('THE POINT: the fast endpoint is called, and NOT awaited with the slow one', () => {
  assert.match(SCREEN, /void fetchHistoryOverview\(\)/);
  // Awaiting them together would spend the 1-2s win inside the 90s wait.
  assert.doesNotMatch(SCREEN, /await fetchHistoryOverview/);
});

test('the blocking overlay clears once there is something real to read', () => {
  assert.match(SCREEN, /isRefreshingHistory\) && mainTab === 'history' && !historyOverview/);
});

test('"No history data available" cannot render over real counts', () => {
  // Same false-absence bug as COS-1020: asserting emptiness while holding data.
  const empty = SCREEN.slice(SCREEN.indexOf('if (!historySummary) {'));
  assert.ok(empty.indexOf('historyOverview') < empty.indexOf('No history data available'),
    'the overview branch must be checked BEFORE claiming no history');
});

test('the client degrades to null rather than taking down the tab', () => {
  // Advisory content shown while the real summary loads. A failure here must
  // not replace the summary's own error handling.
  assert.match(CLIENT, /catch \{\s*return null;/);
  assert.match(CLIENT, /Promise<HistoryOverview \| null>/);
});

test('the client bounds its wait — it exists to be fast', () => {
  assert.match(CLIENT, /timeout: \d+/);
});

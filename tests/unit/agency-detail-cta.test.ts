/**
 * COS-996 — the agency screen must not tell the patient something it has not
 * checked yet, and must not confuse "has an agencyId" with "is a member".
 *
 * Source-level assertions on purpose. `node --test` cannot resolve the `@/`
 * alias, and rendering this screen would need expo-router, paper, the
 * accessibility store and a live API client mocked — at which point the test
 * pins the mocks rather than the screen. The two defects here are both
 * statically visible, so check them statically.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(join(process.cwd(), 'app/agency-detail.tsx'), 'utf8');

test('the CTA starts in an unknown state, not a claim', () => {
  assert.match(
    SRC,
    /useState<AgencyCta>\('unknown'\)/,
    "requestStatus must initialise to 'unknown'. It used to start at 'none', so the " +
      'screen rendered "Request Care Manager" to everyone — including patients already ' +
      'with the agency — and flipped a second later once two awaited calls landed.',
  );
});

test("'unknown' is handled before the request button, so nothing renders early", () => {
  /*
   * Slice to the render block first. "Request Care Manager" also appears as the
   * handler name and in a comment ABOVE the JSX, and matching either of those
   * made this assertion compare the wrong two positions — it failed against
   * correct code, which is the most expensive kind of wrong test.
   */
  const blockStart = SRC.indexOf('{/* Request Care Manager Button / Status */}');
  const blockEnd = SRC.indexOf('{/* Consent Modal */}');
  assert.ok(blockStart > 0 && blockEnd > blockStart, 'could not locate the CTA render block');
  const block = SRC.slice(blockStart, blockEnd);

  const unknownBranch = block.indexOf("requestStatus === 'unknown'");
  const buttonLabel = block.indexOf('Request Care Manager</Button>') >= 0
    ? block.indexOf('Request Care Manager</Button>')
    : block.lastIndexOf('Request Care Manager');

  assert.ok(unknownBranch >= 0, "no branch renders the 'unknown' state");
  assert.ok(buttonLabel >= 0, 'could not locate the request button inside the render block');
  assert.ok(
    unknownBranch < buttonLabel,
    "the 'unknown' branch must come BEFORE the request button in the conditional chain, " +
      'or the button is what renders while the status is still loading.',
  );
});

test('membership is decided by hasElectedAgency, never by agencyId alone', () => {
  assert.match(
    SRC,
    /hasElectedAgency/,
    'membership must consult hasElectedAgency from /v1/auth/me (COS-887).',
  );
  // The exact defect: treating a bare agencyId match as membership. Every
  // patient carries the isDefault agency stamp, so this is always wrong.
  assert.doesNotMatch(
    SRC,
    /if\s*\(\s*userAgencyId\s*===\s*agencyId\s*\)/,
    'agencyId alone never means membership — every patient is stamped with the ' +
      'isDefault agency by ensureUserProfile.',
  );
  assert.match(
    SRC,
    /const belongsHere = elected && myAgencyId === agencyId/,
    'membership must require BOTH an elected agency and an id match.',
  );
});

test('a patient already with another agency is blocked, not offered a second', () => {
  assert.match(SRC, /requestStatus === 'blocked'/, "no 'blocked' branch is rendered");
  assert.match(
    SRC,
    /const belongsElsewhere = elected && Boolean\(myAgencyId\) && myAgencyId !== agencyId/,
    'the blocked state must be derived from belonging to a DIFFERENT elected agency.',
  );
  // Naming the agency is the actionable part; "you already have an agency" is not.
  assert.match(SRC, /otherAgency\?\.name/, 'the blocking message must name the current agency');
});

test('the approved state splits into a team tab and a scheduling tab', () => {
  assert.match(SRC, /'team' \| 'scheduling'/, 'the two-tab state is missing');
  assert.match(SRC, /detailTab === 'team'/, 'the team tab is not selected anywhere');
  for (const section of ['AgencyTeamSection', 'AgencyVisitsSection']) {
    assert.ok(SRC.includes(section), `${section} must still be rendered after the tab split`);
  }
});

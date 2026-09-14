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
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(join(process.cwd(), 'app/Home/agency-detail.tsx'), 'utf8');

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

test('nothing pushes to the retired root route', () => {
  /*
   * COS-1003 — the screen moved to app/Home/agency-detail.tsx (COS-999) and the
   * root route was deleted. I rewrote four of the five call sites: my sweep
   * matched the template-literal form `/agency-detail?...` and missed the
   * object form { pathname: '/agency-detail' } inside this very file — the
   * "Open <other agency>" button. Tapping it gave Vishal a black "Unmatched
   * Route" screen.
   *
   * Scanning the whole app rather than this one file, because the next one
   * added will not be here either.
   */
  const offenders: string[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name.startsWith('.')) continue;
      const full = join(dir, name);
      if (statSync(full).isDirectory()) { walk(full); continue; }
      if (!/\.(ts|tsx)$/.test(name)) continue;
      const body = readFileSync(full, 'utf8');
      // The retired path, NOT preceded by /Home. Quote or backtick delimited.
      if (/["'`]\/agency-detail(?![a-zA-Z-])/.test(body)) offenders.push(full);
    }
  };
  for (const root of ['app', 'components', 'hooks', 'lib', 'services']) {
    try { walk(join(process.cwd(), root)); } catch { /* optional dir */ }
  }

  assert.deepEqual(
    offenders.map((f) => f.replace(process.cwd() + '/', '')),
    [],
    'these push to the deleted root route and will render "Unmatched Route"',
  );
});

test('per-agency state resets when the agency changes', () => {
  // The screen is kept mounted by the Tabs navigator, so moving between two
  // agencies reuses it. Without this reset the previous agency's verdict shows
  // for as long as the next load takes.
  assert.match(
    SRC,
    /setRequestStatus\('unknown'\);[\s\S]{0,220}\}, \[agencyId\]\)/,
    'an effect keyed on agencyId must clear the previous agency answer',
  );
});

test('the X goes back to Supports only when Supports sent you', () => {
  /*
   * COS-1004 — this cannot be read off the navigation state. The Supports sheet
   * is dismissed BEFORE it pushes here, so nothing in the stack records that it
   * was open; and router.back() from any Home screen lands on Home anyway
   * (TabRouter firstRoute). So the caller declares it.
   */
  assert.match(SRC, /function closeModal\(from\?: string\)/, 'closeModal must take an origin');
  assert.match(
    SRC,
    /if \(from === 'supports'\)[\s\S]{0,1400}router\.replace\('\/Home'[\s\S]{0,200}router\.push\('\/modal'/,
    "a 'supports' origin must land on Home and present the sheet OVER it",
  );
  // Replacing this screen WITH the sheet leaves it with no chrome and no way
  // back — the sheet's own close button has nothing to return to.
  assert.doesNotMatch(
    SRC,
    /router\.replace\('\/modal'/,
    'the sheet must never replace this screen; it must sit over Home',
  );
  // Every X must pass the origin, or the one that does not silently goes Home.
  const bare = SRC.match(/onPress=\{closeModal\}/g) ?? [];
  assert.equal(bare.length, 0, 'every close button must pass the origin through');
});

test('the Supports sheet stamps the origin it is the only one to claim', () => {
  const MODAL = readFileSync(join(process.cwd(), 'app/modal.tsx'), 'utf8');
  assert.match(MODAL, /from=supports/, 'the Supports agency row must declare where it came from');
});

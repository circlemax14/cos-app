/**
 * One day-key convention across the app — the regression guard.
 *
 * Before 2026-08-12 there was NO test covering any of the 15 sites that
 * derived "today" in UTC. All 1036 tests passed while the app believed today
 * was tomorrow for seven hours of every day in Los Angeles. Someone could
 * reintroduce `new Date().toISOString().slice(0, 10)` tomorrow and nothing
 * would notice.
 *
 * This file is that notice. It sweeps the source tree rather than testing one
 * module, because the defect was never in a module — it was in the fact that
 * twenty files each answered the same question their own way.
 *
 * The behaviour of the helper itself is tested in lib/day-key.test.mjs, which
 * simulates real UTC offsets arithmetically. This file only polices adoption.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIRS = ['app', 'hooks', 'services', 'components', 'lib'];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

const FILES = DIRS.flatMap((d) => walk(join(ROOT, d))).map((f) => ({
  path: relative(ROOT, f),
  src: readFileSync(f, 'utf8'),
}));

const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/**
 * Deliberate exceptions, each with a reason. Anything not on this list that
 * derives "today" in UTC is a bug — that is the whole point of the file.
 */
const ALLOWED_UTC_NOW = [
  // Named `todayIsoUtc`, deliberately UTC, and paired with a local value in
  // the same object. It is a DIAGNOSTIC that exists precisely to show the two
  // side by side while root-causing "no samples today" on some devices.
  'hooks/use-readiness-derivation.ts',
];

test('no file derives TODAY in UTC any more', () => {
  // `new Date().toISOString().slice(0, 10)` is the exact shape of the bug:
  // convert now to UTC, then take the date part. For everyone west of UTC
  // that is tomorrow after ~17:00 local; east of UTC it is yesterday until
  // the offset elapses.
  const offenders = FILES.filter(
    (f) =>
      !ALLOWED_UTC_NOW.includes(f.path) &&
      /new Date\(\)\.toISOString\(\)\.slice\(0,\s*10\)/.test(stripComments(f.src)),
  ).map((f) => f.path);

  assert.deepEqual(
    offenders,
    [],
    `use todayLocalIso() from @/lib/day-key instead:\n  ${offenders.join('\n  ')}`,
  );
});

test('the deliberate UTC diagnostic is still deliberate', () => {
  // If someone "fixes" the allow-listed file by making it local, this test
  // fails and forces them to remove it from the list rather than leaving a
  // stale exemption that silently permits a future regression.
  const diag = FILES.find((f) => f.path === 'hooks/use-readiness-derivation.ts');
  assert.ok(diag, 'allow-listed file must exist');
  assert.match(
    diag.src,
    /todayIsoUtc/,
    'the exemption is only justified while the value is named …Utc and used as a diagnostic',
  );
});

test('the load-bearing screens use the shared helper', () => {
  // These are the ones where a wrong day had real consequences: the task list
  // the patient works from, the routine ticks that get persisted, and the
  // adherence denominator.
  for (const path of [
    'app/Home/today-schedule.tsx',
    'app/Home/health-plan.tsx',
    'app/Home/bps-progress.tsx',
    'app/Home/appointments.tsx',
    'services/auth-prefetch.ts',
    'components/health-plan/BiopsychosocialPlanScreen.tsx',
  ]) {
    const f = FILES.find((x) => x.path === path);
    assert.ok(f, `${path} must exist`);
    assert.match(f.src, /from '@\/lib\/day-key'/, `${path} must use the shared day-key helper`);
  }
});

test('the plan-tasks cache key is derived the SAME way by every producer and consumer', () => {
  // ['plan-tasks', <day>] is written by auth-prefetch and read by
  // use-notification-categories, bps-progress and the BPS screen. If one of
  // them derived the day differently the warm-cache read would silently miss
  // — a performance regression that looks like a slow screen, not a bug.
  const users = FILES.filter((f) => /\['plan-tasks',/.test(stripComments(f.src)));
  assert.ok(users.length >= 3, 'expected several plan-tasks cache-key users');
  for (const f of users) {
    assert.match(
      f.src,
      /from '@\/lib\/day-key'|todayLocalIso|localDayIso/,
      `${f.path} builds a plan-tasks key but does not use the shared day helper`,
    );
  }
});

test('a task created today is dated today', () => {
  // NutritionPlanSection sent a UTC startDate, so a task created after
  // ~17:00 local was filed on tomorrow and did not appear in the list the
  // patient was looking at when they created it.
  const f = FILES.find((x) => x.path === 'components/health-plan/NutritionPlanSection.tsx');
  assert.ok(f);
  assert.match(f.src, /startDate: todayLocalIso\(\)/);
});

// ── The patient's local frame reaches the backend (2026-08-12) ────────

test('completeTask sends patientLocalDate — the backend fix was dead code without it', () => {
  // cos-backend has accepted patientLocalDate since SCRUM-595, added to fix
  // "the ±14h off-by-one where an Auckland patient completing a today task
  // before the slot had the early claim silently dropped". The app never sent
  // it, so that fix has been unreachable since it shipped.
  const f = FILES.find((x) => x.path === 'services/api/ai-health-plan.ts');
  assert.ok(f);
  assert.match(f.src, /patientLocalDate: todayLocalIso\(now\)/);
});

test('completeTask sends tzOffsetMinutes, so onTime can be computed at all', () => {
  // scheduledTime is the patient's LOCAL wall clock; completedAt is a UTC
  // instant. Compared directly, onTime is false for everyone more than 2h from
  // UTC — making "On-Time Master" (60% over 30 days) arithmetically impossible
  // rather than merely hard.
  const f = FILES.find((x) => x.path === 'services/api/ai-health-plan.ts');
  assert.match(f.src, /tzOffsetMinutes: tzOffsetMinutes\(now\)/);
});

test('both come from ONE `now`, not two clock reads', () => {
  // Two separate new Date() calls can straddle midnight, sending a date and an
  // offset from different days. Rare, and exactly the kind of thing that is
  // impossible to reproduce.
  const f = FILES.find((x) => x.path === 'services/api/ai-health-plan.ts');
  const fn = f.src.slice(f.src.indexOf('export async function completeTask'));
  const body = fn.slice(0, fn.indexOf('describeError'));
  assert.match(body, /const now = new Date\(\)/);
  assert.equal((body.match(/new Date\(\)/g) ?? []).length, 1, 'exactly one clock read');
});

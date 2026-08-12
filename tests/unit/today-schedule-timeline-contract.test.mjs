/**
 * Today's Schedule — timeline surface contract.
 *
 * Ken 2026-08-11 asked for one chronological spine where "appts / routines and
 * tasks come together". The merge rules themselves are unit-tested in
 * lib/today-timeline.test.mjs; these pin the SURFACE decisions, which are the
 * ones that regress when someone touches this screen in isolation.
 *
 * Every negative assertion runs through codeOnly() — a comment explaining why
 * something is absent will otherwise match the assertion forbidding it. That
 * trap has fired six times across these contract files.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCREEN = readFileSync(join(ROOT, 'app/Home/today-schedule.tsx'), 'utf8');
const TIMELINE = readFileSync(join(ROOT, 'components/today/TodayTimeline.tsx'), 'utf8');
const SCORE = readFileSync(join(ROOT, 'components/today/AdherenceScore.tsx'), 'utf8');

const codeOnly = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('the four groups are gone, replaced by one timeline', () => {
  const code = codeOnly(SCREEN);
  assert.doesNotMatch(code, /<ScheduleSection/, 'grouped sections must be removed');
  assert.match(code, /<TodayTimeline/);
  assert.match(code, /<TodayLegend/);
});

test('all four streams still reach the timeline', () => {
  // The grouped layout existed because streams were vanishing. Losing one in
  // the merge would reintroduce exactly that, silently.
  const fn = SCREEN.slice(SCREEN.indexOf('const timelineItems'));
  for (const kind of ["'appointment'", "'task'", "'routine'", "'reminder'"]) {
    assert.ok(fn.includes(kind), `${kind} must be merged in`);
  }
});

test('routines use their scheduledTime when they have one', () => {
  // be #380 added the field. Without it every routine falls to "Anytime
  // today" — 14 of ~22 items on Ken's own day.
  assert.match(SCREEN, /time: r\.scheduledTime \|\| null/);
});

test('loading and permission state is surfaced ABOVE the timeline', () => {
  // A spine has no per-group headers to hang "No appointments today" on, so
  // an empty day and a denied calendar look identical. This is the one
  // regression a timeline can cause versus the grouped layout.
  assert.match(SCREEN, /timelineNotices/);
  assert.match(SCREEN, /Calendar access is off/);
  assert.match(SCREEN, /Reminders access is off/);
  assert.match(SCREEN, /Loading your day…/);
});

test('tapping a row reuses the EXISTING completion path', () => {
  // A second "done" path would be a second source of truth, which is how two
  // surfaces start disagreeing about whether a task is complete.
  assert.match(SCREEN, /handleTaskComplete\(task\)/);
  assert.doesNotMatch(
    codeOnly(SCREEN.slice(SCREEN.indexOf('const onPressTimelineItem'), SCREEN.indexOf('const toggleCalendarItem'))),
    /completeTask\(/,
    'must not re-implement completion inline',
  );
});

test('a completed task is not silently un-completed by a tap', () => {
  assert.match(SCREEN, /task\.status !== 'completed'/);
});

test('the score sits in the top-right corner, tappable', () => {
  // Ken: "adherence score up in right corner as well?"
  assert.match(SCREEN, /<AdherenceScore/);
  const header = SCREEN.slice(SCREEN.indexOf('{/* Header */}'), SCREEN.indexOf('{/* Profile summary */}'));
  assert.match(header, /<AdherenceScore/, 'must be in the header row');
  assert.match(SCORE, /onPress=\{\(\) => setExplaining\(true\)\}/);
  assert.match(SCORE, /<Modal/, 'tapping must explain what it counts');
});

test('treatment B — the percentage leads', () => {
  // Vishal chose B over the fraction-led A.
  assert.match(SCORE, /\{percent\}/);
  assert.match(SCORE, /\{done\}\/\{due\} done/);
});

test('the score explainer answers the two questions it provokes', () => {
  assert.match(SCORE, /tasks only/i);
  assert.match(SCORE, /due so far/i);
});

test('the score is never red', () => {
  // "83%" is a mark out of a hundred, and this cohort includes people for
  // whom a prominent compliance figure is a mood input.
  const code = codeOnly(SCORE);
  assert.doesNotMatch(code, /#DC2626|#E53E3E|'red'|colors\.error/);
  assert.match(code, /color: colors\.tint/);
});

test('nothing due yet gets its own words', () => {
  // "0 of 0" and "100%" both read oddly at 6am.
  assert.match(SCORE, /Nothing due yet/);
});

test('colour is never the only signal', () => {
  // The plan screen's rule is colour + icon + word. Three dots differing only
  // by hue fail for a colour-blind patient.
  assert.match(TIMELINE, /icon: '/);
  const kinds = TIMELINE.match(/icon: '[a-z-]+'/g) ?? [];
  assert.ok(kinds.length >= 4, 'every kind needs its own glyph');
  assert.match(TIMELINE, /label: '/);
});

test('the NOW marker exists and only hours with content render', () => {
  // Ken's mock draws every hour 6am–10pm; on a phone that is a column of
  // blank rows. buildTimeline emits only populated hours — assert the screen
  // does not reintroduce a fixed 6..22 range.
  assert.match(TIMELINE, /function NowMarker/);
  assert.doesNotMatch(codeOnly(TIMELINE), /for \(let h = 6/);
});

test('anytime bucket renders when it has anything', () => {
  assert.match(TIMELINE, /ANYTIME TODAY/);
  assert.match(TIMELINE, /anytime\.length > 0/);
});

test('stays inside the iOS 26.5 primitive envelope', () => {
  for (const [name, src] of [['timeline', TIMELINE], ['score', SCORE]]) {
    const rn = /import \{([^}]+)\} from 'react-native'/.exec(src);
    assert.ok(rn, `${name}: expected a react-native import`);
    const allowed = new Set(['View', 'Text', 'Pressable', 'Modal', 'StyleSheet']);
    for (const n of rn[1].split(',').map((x) => x.trim()).filter(Boolean)) {
      assert.ok(allowed.has(n), `${name}: ${n} is outside the envelope`);
    }
    assert.doesNotMatch(codeOnly(src), /ActivityIndicator|Animated|LayoutAnimation/);
  }
});


// ── Layout regressions from the first cut (Vishal: "looks very bad") ──

test('the timeline block is inset like every other section', () => {
  // scrollContent carries only paddingBottom. The four groups this replaced
  // each supplied their own `section` inset of 16 — without it the timeline
  // rendered flush to both screen edges while the profile card and
  // medications stayed inset.
  assert.match(SCREEN, /timelineBlock: \{ marginHorizontal: 16/);
  assert.match(SCREEN, /<View style=\{styles\.timelineBlock\}>/);
});

test('the title is left-aligned now that the score shares its row', () => {
  // textAlign:'center' inside flex:1 leaves the text visibly off-axis
  // against a dead gap once something occupies the right corner.
  assert.match(SCREEN, /headerTitle: \{[^}]*textAlign: 'left'/);
});

test('hour rules use a hairline, not borderStyle dashed', () => {
  // RN only honours a dashed border when EVERY side has a width. With just
  // borderTopWidth it falls back to solid on iOS and can draw artifacts on
  // Android — so the dashed rule was never going to render as designed.
  assert.match(TIMELINE, /borderTopWidth: StyleSheet\.hairlineWidth/);
  assert.doesNotMatch(codeOnly(TIMELINE), /borderStyle: 'dashed'/);
});


// ── Ken 2026-08-11, second round ─────────────────────────────────────

test('the legend covers ALL FOUR kinds, including reminders', () => {
  // "we don't have reminders and we aren't showing them". Reminders were
  // merged into the timeline but omitted from the legend, so an amber row had
  // nothing explaining it. A legend covering three of four is worse than
  // none — it implies the fourth colour means something else.
  assert.match(TIMELINE, /'appointment', 'routine', 'task', 'reminder'/);
});

test('a routine can be given a time from the routines screen', () => {
  // Ken: "we have to be able to place a time on each routine so that it
  // integrates into the schedule flow and is not separate." be #380 accepted
  // the field; nothing could SET it.
  const HABITS = readFileSync(join(ROOT, 'app/Home/habits.tsx'), 'utf8');
  assert.match(HABITS, /Time of day/);
  assert.match(HABITS, /scheduledTime: v\.trim\(\)/);
  assert.match(HABITS, /payload\.scheduledTime = time/);
});

test('an existing time is prefilled when editing', () => {
  const HABITS = readFileSync(join(ROOT, 'app/Home/habits.tsx'), 'utf8');
  assert.match(HABITS, /scheduledTime: h\.scheduledTime \?\? ''/);
});

test('clearing the time is possible — PATCH merges, so omission preserves', () => {
  // Without an explicit clear a patient could set a time and never remove it;
  // "anytime today" would be unreachable once chosen.
  const HABITS = readFileSync(join(ROOT, 'app/Home/habits.tsx'), 'utf8');
  assert.match(HABITS, /payload\.scheduledTime = ''/);
  assert.match(HABITS, /editing\.habitId && !time/, 'only clears when editing');
});

test('a half-typed time is never persisted', () => {
  // "7:" must not reach the backend, and blank is a legitimate answer rather
  // than an error.
  const HABITS = readFileSync(join(ROOT, 'app/Home/habits.tsx'), 'utf8');
  assert.match(HABITS, /\^\(\[01\]\\d\|2\[0-3\]\):\[0-5\]\\d\$/);
});

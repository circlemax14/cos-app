/**
 * The medication schedule maths.
 *
 * Two of these tests exist because a 13-agent design review found the bugs by
 * reading the code, not by running it:
 *
 *   F3 — a weekly injectable has `times: []`, which is CORRECT, so any
 *        times-only implementation makes every injectable invisible.
 *   F12 — `null <= 2` is `true` in JavaScript, so an unguarded comparison
 *        renders "About null days left" on a row with no supply.
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  cadenceLabel,
  canDrawSupplyBar,
  minutesOfDay,
  nextDose,
  passedTodayTimes,
  signedDaysUntil,
  supplyStatus,
  upcomingTodayTimes,
} from './medication-schedule.ts'

const at = (h, m = 0) => new Date(2026, 7, 18, h, m, 0)
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const TODAY = iso(new Date())
const inDays = (n) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return iso(d)
}

test('minutesOfDay parses, and refuses nonsense rather than guessing', () => {
  assert.equal(minutesOfDay('08:00'), 480)
  assert.equal(minutesOfDay('00:00'), 0)
  assert.equal(minutesOfDay('23:59'), 1439)
  assert.equal(minutesOfDay('bedtime'), null)
  assert.equal(minutesOfDay('25:00'), null)
  assert.equal(minutesOfDay('08:75'), null)
  assert.equal(minutesOfDay(''), null)
  assert.equal(minutesOfDay(null), null)
})

test('today splits into passed and upcoming at the current minute', () => {
  const times = ['08:00', '14:00', '20:00', '02:00']
  // 10am: 2am and 8am have gone; 2pm and 8pm are still to come.
  assert.deepEqual(passedTodayTimes(times, at(10)), ['02:00', '08:00'])
  assert.deepEqual(upcomingTodayTimes(times, at(10)), ['14:00', '20:00'])
})

test('a time exactly now counts as upcoming, not passed', () => {
  // Off-by-one at the boundary would tell a patient a dose is behind them the
  // very minute it comes due.
  assert.deepEqual(passedTodayTimes(['14:00'], at(14, 0)), [])
  assert.deepEqual(upcomingTodayTimes(['14:00'], at(14, 0)), ['14:00'])
})

test('the split is named for what it KNOWS — scheduled, not taken', () => {
  // There is no dose-taken event in the API. passedTodayTimes reports the
  // schedule only; nothing here may imply adherence in either direction.
  assert.deepEqual(passedTodayTimes([], at(10)), [])
  assert.deepEqual(passedTodayTimes(null, at(10)), [])
  assert.deepEqual(passedTodayTimes(undefined, at(10)), [])
})

test('nextDose finds the next time today', () => {
  const d = nextDose({ times: ['08:00', '14:00', '20:00'] }, at(10))
  assert.deepEqual(d, { kind: 'time', time: '14:00', tomorrow: false })
})

test("once today's times have all gone, the next dose is tomorrow's first", () => {
  const d = nextDose({ times: ['08:00', '14:00'] }, at(22))
  assert.deepEqual(d, { kind: 'time', time: '08:00', tomorrow: true })
})

test('F3: a weekly injectable with NO times is still schedulable', () => {
  // times: [] is correct for an injectable. A times-only implementation
  // returns null here and the medication vanishes from the screen's schedule.
  const d = nextDose(
    { times: [], form: 'injectable', supply: { cadence: 'weekly', startDate: '2026-08-03' } },
    at(10),
  )
  assert.equal(d && d.kind, 'cadence')
  assert.equal(d.cadence, 'weekly')
  assert.equal(d.label, 'Weekly')
  // 3 Aug + 3 weeks = 24 Aug, the first occurrence on or after 18 Aug.
  assert.equal(d.nextDate, '2026-08-24')
})

test('a cadence with no start date is NOT schedulable', () => {
  // Projecting from "today" would put a fabricated date on screen.
  assert.equal(nextDose({ times: [], supply: { cadence: 'weekly' } }, at(10)), null)
})

test('a dose falling exactly on today is today, not next period', () => {
  const d = nextDose({ times: [], supply: { cadence: 'weekly', startDate: '2026-08-11' } }, at(10))
  assert.equal(d.nextDate, '2026-08-18')
})

test('no times and no cadence means NULL — the caller renders nothing', () => {
  assert.equal(nextDose({ times: [] }, at(10)), null)
  assert.equal(nextDose({ times: null }, at(10)), null)
  assert.equal(nextDose(null, at(10)), null)
  assert.equal(nextDose({ times: ['bedtime'] }, at(10)), null)
})

test('cadenceLabel speaks plainly, and refuses unknown values', () => {
  assert.equal(cadenceLabel('weekly'), 'Weekly')
  assert.equal(cadenceLabel('biweekly'), 'Every 2 weeks')
  assert.equal(cadenceLabel(null), null)
  assert.equal(cadenceLabel('fortnightly'), null)
})

test('F12: signedDaysUntil goes NEGATIVE and returns null for junk', () => {
  // The clamped variant returns 0 for anything overdue, which makes
  // "overdue by 3 days" unsayable.
  assert.equal(signedDaysUntil(inDays(5)), 5)
  assert.equal(signedDaysUntil(inDays(-3)), -3)
  assert.equal(signedDaysUntil(TODAY), 0)
  assert.equal(signedDaysUntil(null), null)
  assert.equal(signedDaysUntil('not-a-date'), null)
})

test('THE DEFAULT: no supply renders NOTHING', () => {
  // supply is null on every row of every account until a patient types it.
  // This branch is the common case, not the edge case.
  assert.deepEqual(supplyStatus(null, TODAY), { kind: 'none' })
  assert.deepEqual(supplyStatus(undefined, TODAY), { kind: 'none' })
  assert.deepEqual(
    supplyStatus({ remainingQuantity: null, dosesPerDay: null, runOutDate: null }, TODAY),
    { kind: 'none' },
  )
})

test('F12 again: a null run-out date never becomes "null days left"', () => {
  // needsRefill true with no date is a real state — it must say something
  // true without a number, not print the null.
  const s = supplyStatus({ needsRefill: true, runOutDate: null }, TODAY)
  assert.deepEqual(s, { kind: 'reorder', days: null, urgent: true })
})

test('overdue is reported as overdue, with a positive magnitude', () => {
  const s = supplyStatus({ needsRefill: true, runOutDate: inDays(-3) }, TODAY)
  assert.deepEqual(s, { kind: 'overdue', days: 3 })
})

test('urgency is a threshold, not a vibe', () => {
  assert.equal(supplyStatus({ needsRefill: true, runOutDate: inDays(2) }, TODAY).urgent, true)
  assert.equal(supplyStatus({ needsRefill: true, runOutDate: inDays(3) }, TODAY).urgent, false)
})

test('a snoozed reminder shows no amber at all', () => {
  const s = supplyStatus(
    { needsRefill: true, runOutDate: inDays(1), snoozedUntil: inDays(6) },
    TODAY,
  )
  assert.equal(s.kind, 'snoozed')
  // Snooze wins over needsRefill — otherwise snoozing does nothing visible.
})

test('a snooze that has expired stops suppressing', () => {
  const s = supplyStatus(
    { needsRefill: true, runOutDate: inDays(1), snoozedUntil: inDays(-1) },
    TODAY,
  )
  assert.equal(s.kind, 'reorder')
})

test('healthy supply states its days without alarm', () => {
  assert.deepEqual(supplyStatus({ needsRefill: false, runOutDate: inDays(24) }, TODAY), {
    kind: 'ok',
    days: 24,
  })
})

test('quantity with no derivable day count says the quantity only', () => {
  assert.deepEqual(
    supplyStatus({ needsRefill: false, runOutDate: null, remainingQuantity: 24 }, TODAY),
    { kind: 'quantityOnly', remaining: 24 },
  )
})

test('A BAR NEEDS A DENOMINATOR', () => {
  // Length without a denominator is an invented fraction.
  assert.equal(canDrawSupplyBar(null), false)
  assert.equal(canDrawSupplyBar({ runOutDate: inDays(12), remainingQuantity: null }), false)
  assert.equal(canDrawSupplyBar({ runOutDate: null, remainingQuantity: 24 }), false)
  assert.equal(canDrawSupplyBar({ runOutDate: inDays(12), remainingQuantity: 24 }), true)
})

// ─── The band ───────────────────────────────────────────────────────

import { nextScheduled, relativeToDose } from './medication-schedule.ts'

const med = (name, times, extra = {}) => ({ name, times, ...extra })

test('THE SUPPRESSION RULE: nothing computable means NO BAND', () => {
  // An EHR-only account has no dose times and no cadence start dates. The
  // band must vanish entirely rather than become a permanent "add times" nag
  // on a screen the patient did not come here to configure.
  assert.equal(nextScheduled([med('Metformin', []), med('Lisinopril', null)], at(10)), null)
  assert.equal(nextScheduled([], at(10)), null)
  assert.equal(nextScheduled(null, at(10)), null)
})

test('the band names the medication due next', () => {
  const b = nextScheduled([med('Metformin', ['08:00', '19:30']), med('Cephalexin', ['14:00'])], at(10))
  assert.deepEqual(b.names, ['Cephalexin'])
  assert.equal(b.time, '14:00')
  assert.equal(b.tomorrow, false)
  assert.ok(b.single, 'one medication due means the dose line may show')
})

test('medications sharing a time are grouped, not listed four times', () => {
  const b = nextScheduled(
    [med('Metformin', ['14:00']), med('Cephalexin', ['14:00']), med('Sertraline', ['20:00'])],
    at(10),
  )
  assert.deepEqual(b.names.sort(), ['Cephalexin', 'Metformin'])
  assert.equal(b.single, null, 'no dose line when more than one is due')
})

test('more than three sharing a time overflow rather than wrapping forever', () => {
  const b = nextScheduled(
    ['A', 'B', 'C', 'D', 'E'].map((n) => med(n, ['14:00'])),
    at(10),
  )
  assert.equal(b.names.length, 3)
  assert.equal(b.overflow, 2)
})

test("today's dose outranks tomorrow's, which outranks a cadence date", () => {
  const b = nextScheduled(
    [
      med('Semaglutide', [], { supply: { cadence: 'weekly', startDate: '2026-08-03' } }),
      med('Metformin', ['08:00']), // already passed at 22:00 -> tomorrow
      med('Cephalexin', ['23:00']), // still today
    ],
    at(22),
  )
  assert.deepEqual(b.names, ['Cephalexin'])
  assert.equal(b.tomorrow, false)
})

test('an injectable can carry the band when nothing else can', () => {
  const b = nextScheduled(
    [med('Semaglutide', [], { supply: { cadence: 'weekly', startDate: '2026-08-03' } })],
    at(10),
  )
  assert.equal(b.cadence, 'Weekly')
  assert.equal(b.cadenceDate, '2026-08-24')
  assert.equal(b.time, null)
})

test('earlier-today is SCOPED to the medication the band names', () => {
  // Aggregating across the list produced "2am, 8am, 9am" — three times from
  // three different drugs, which reads like a summary but is not actionable.
  // Cephalexin is next at 2pm; only ITS earlier dose belongs in the band.
  const b = nextScheduled(
    [med('Cephalexin', ['08:00', '14:00']), med('Sertraline', ['09:00']), med('Metformin', ['02:00', '19:30'])],
    at(10),
  )
  assert.deepEqual(b.names, ['Cephalexin'])
  assert.deepEqual(b.earlierToday, ['08:00'], 'not 09:00 or 02:00 — those belong to other rows')
})

test('relative time is vague on purpose and never counts down', () => {
  // Recomputed on focus, not on a timer — a minute count would be wrong within
  // a minute of backgrounding.
  assert.equal(relativeToDose('14:00', at(10), false), 'in about 4 hours')
  assert.equal(relativeToDose('11:00', at(10), false), 'in about 1 hour')
  assert.equal(relativeToDose('10:30', at(10), false), 'soon')
  assert.equal(relativeToDose('10:00', at(10), false), 'soon')
  assert.equal(relativeToDose('09:00', at(10), false), null, 'a passed time has no relative phrase')
})

// ─── Estimated vs typed supply ──────────────────────────────────────

import { supplyProvenance } from './medication-schedule.ts'

test('a DERIVED count is marked, so the row can qualify it', () => {
  // The backend estimates from the dispense quantity when nobody typed one.
  // It rests on the fill date and on full adherence, neither observable — so
  // "4 left" would be a claim and the screen must not make it.
  const p = supplyProvenance({ remainingQuantity: 4, estimated: true, estimatedFrom: '2026-08-17' })
  assert.equal(p.estimated, true)
  assert.equal(p.basedOn, '2026-08-17')
})

test('a TYPED count carries no estimate marking', () => {
  const p = supplyProvenance({ remainingQuantity: 7 })
  assert.equal(p.estimated, false)
  assert.equal(p.basedOn, null)
})

test('an older backend that never sends the flag is treated as typed', () => {
  // Back-compat: before the estimate existed every supply row WAS hand-typed,
  // so absent must not read as estimated.
  assert.equal(supplyProvenance({ remainingQuantity: 7, estimated: undefined }).estimated, false)
  assert.equal(supplyProvenance(null).estimated, false)
  assert.equal(supplyProvenance(undefined).estimated, false)
})

test('AN EXHAUSTED SUPPLY STILL DRAWS A BAR — an empty one', () => {
  // Requiring days >= 0 meant a medication that had run out showed no bar,
  // which is the worst moment to go quiet. A four-capsule antibiotic is
  // exhausted the day after it is filled.
  assert.equal(canDrawSupplyBar({ runOutDate: inDays(-2), remainingQuantity: 0 }), true)
  assert.equal(canDrawSupplyBar({ runOutDate: inDays(0), remainingQuantity: 0 }), true)
  // Still refuses without a denominator.
  assert.equal(canDrawSupplyBar({ runOutDate: inDays(-2), remainingQuantity: null }), false)
})

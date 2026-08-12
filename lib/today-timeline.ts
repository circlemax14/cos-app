/**
 * Today's Schedule — merge four streams into one chronological spine.
 *
 * Ken 2026-08-11: "This is where appts / routines and tasks come together to
 * build our daily schedule", with a reference mock showing one time-ordered
 * column colour-coded by type instead of four stacked groups.
 *
 * The four-group layout it replaces was itself a fix (2026-08-06, "we are
 * showing tasks only") and its good idea — never silently drop a stream — is
 * preserved here: everything that cannot be placed on the clock lands in an
 * explicit "Anytime today" bucket rather than disappearing.
 *
 * Pure module: no React, no react-native, no network. Everything here is a
 * function of its inputs, so the merge rules are testable without a device —
 * which matters because the ordering bugs in a merge like this are invisible
 * until a specific combination of items lines up.
 */

export type TimelineKind = 'appointment' | 'routine' | 'task' | 'reminder';

export interface TimelineItem {
  id: string;
  kind: TimelineKind;
  title: string;
  /** HH:MM 24h, or null when the item has no time (→ "Anytime today"). */
  time: string | null;
  done: boolean;
  /** Sub-line: location, metric, cadence — whatever the source offers. */
  detail?: string;
  /**
   * True when this row will actually produce a push notification.
   *
   * Ken 2026-08-11: "we don't have reminders and we aren't showing them." The
   * second half was the visible one — the legend listed a Reminders colour no
   * row ever used. The first half was worse: "Routine reminders" shipped
   * default-ON, described what it would do, and was read by nothing.
   *
   * Both are now real (cos-backend SCRUM-666), and this flag is how the
   * schedule says so. It is deliberately NOT a separate timeline row: drawing
   * a reminder beside the routine it reminds you of would double every timed
   * item on the screen. The reminder is an ATTRIBUTE of the thing, in the same
   * way its time is.
   *
   * Only ever true when the backend flag says dispatch is live AND the
   * patient's category toggle is on — a bell that lies is the failure this
   * whole change exists to remove.
   */
  willRemind?: boolean;
}

export interface TimelineHour {
  /** 0-23. */
  hour: number;
  /** "6 am", "12 pm", "10 pm". */
  label: string;
  items: TimelineItem[];
}

export interface Timeline {
  hours: TimelineHour[];
  anytime: TimelineItem[];
}

/** Adherence, per Ken's decisions: tasks only, and only what is due so far. */
export interface Adherence {
  /** Tasks due at or before `now` that are done. */
  done: number;
  /** Tasks due at or before `now`. */
  due: number;
  /** 0-100, rounded. 100 when nothing is due yet — see below. */
  percent: number;
  /** Total tasks today, due or not. Powers "3 still to come". */
  total: number;
}

/** `HH:MM` → minutes since midnight. Returns null for anything unparseable. */
export function minutesOf(time: string | null | undefined): number | null {
  if (!time) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

/** 13 → "1 pm", 0 → "12 am", 12 → "12 pm". */
export function hourLabel(hour: number): string {
  const suffix = hour < 12 ? 'am' : 'pm';
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${h} ${suffix}`;
}

/**
 * Ordering WITHIN an hour.
 *
 * Appointments first: they are the fixed points of the day — you can move a
 * stretch, you cannot move a therapy slot — so they should anchor the hour
 * they sit in. Then routines (the structure), then tasks (the asks), then
 * reminders. Ties break on time, then title, so the list is stable across
 * renders rather than reshuffling when a fetch returns in a different order.
 */
const KIND_RANK: Record<TimelineKind, number> = {
  appointment: 0,
  routine: 1,
  task: 2,
  reminder: 3,
};

function compareItems(a: TimelineItem, b: TimelineItem): number {
  const am = minutesOf(a.time) ?? 0;
  const bm = minutesOf(b.time) ?? 0;
  if (am !== bm) return am - bm;
  if (KIND_RANK[a.kind] !== KIND_RANK[b.kind]) return KIND_RANK[a.kind] - KIND_RANK[b.kind];
  return a.title.localeCompare(b.title);
}

/**
 * Group items into hours, dropping empty ones.
 *
 * Ken's mock draws every hour from 6am to 10pm with a divider between each.
 * On a phone that is a column of blank rows — his was a full page of paper.
 * Only hours with something in them are emitted; the dashed rule between them
 * carries the same rhythm at a third of the scroll.
 */
export function buildTimeline(items: TimelineItem[]): Timeline {
  const byHour = new Map<number, TimelineItem[]>();
  const anytime: TimelineItem[] = [];

  for (const item of items) {
    const mins = minutesOf(item.time);
    if (mins === null) {
      anytime.push(item);
      continue;
    }
    const hour = Math.floor(mins / 60);
    const bucket = byHour.get(hour);
    if (bucket) bucket.push(item);
    else byHour.set(hour, [item]);
  }

  const hours: TimelineHour[] = [...byHour.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([hour, list]) => ({
      hour,
      label: hourLabel(hour),
      items: [...list].sort(compareItems),
    }));

  // Anytime keeps a stable order too — undone first, so the things still
  // worth doing are not buried under this morning's completed ones.
  anytime.sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    return a.title.localeCompare(b.title);
  });

  return { hours, anytime };
}

/**
 * Adherence over TASKS ONLY, counting only what is due by `nowMinutes`.
 *
 * Two decisions, both Ken's, both load-bearing:
 *
 * ROUTINES AND APPOINTMENTS DO NOT COUNT. You cannot complete an appointment
 * from the app, so including them makes the number unactionable; and missing
 * a doctor is not the same failure as skipping a stretch, so averaging them
 * together says nothing true. Routines are structure, not asks.
 *
 * ONLY WHAT IS DUE SO FAR. Against a whole-day denominator the patient opens
 * the app at 7am and sees 12%, and the figure reads as failure for most of
 * the day, every day. "Due by now" keeps 100% honestly reachable at any hour.
 *
 * An untimed task counts as due — it was for "anytime today", and today has
 * started.
 *
 * Nothing due yet ⇒ 100%, not 0%. A patient who has been awake ten minutes
 * has not failed at anything, and 0% is the wrong thing to greet them with.
 */
export function computeAdherence(items: TimelineItem[], nowMinutes: number): Adherence {
  const tasks = items.filter((i) => i.kind === 'task');
  const due = tasks.filter((t) => {
    const mins = minutesOf(t.time);
    return mins === null || mins <= nowMinutes;
  });
  const done = due.filter((t) => t.done).length;
  return {
    done,
    due: due.length,
    percent: due.length === 0 ? 100 : Math.round((done / due.length) * 100),
    total: tasks.length,
  };
}

/** Minutes since midnight for a Date. Split out so tests can pin "now". */
export function minutesSinceMidnight(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

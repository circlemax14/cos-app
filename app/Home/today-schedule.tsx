/**
 * Today's Schedule — the screen behind the patient avatar in the centre
 * of the Home circle (app/Home/index.tsx pushes '/Home/today-schedule').
 *
 * ─── WHY THIS SCREEN WAS REWORKED (Ken, 2026-08-06) ──────────────────
 * Ken's report: "when I click on the user profile in the centre of the
 * circle we are showing tasks only. We need to show appointments,
 * reminders, tasks, routines properly."
 *
 * The old layout had exactly two data sections and BOTH were wrapped in
 * `{list.length > 0 && (...)}`:
 *   • "Today's Calendar" — device events AND iOS reminders lumped into
 *     one undifferentiated list, hidden entirely when empty.
 *   • "Today's Tasks"    — plan tasks, hidden entirely when empty.
 * So on a typical day (no device calendar entries, no reminders) the
 * whole screen collapsed to just the task list — hence "tasks only".
 * Worse, the sections appearing/disappearing day to day made the screen
 * feel broken.
 *
 * The screen is now ONE day view with FOUR always-rendered groups, in
 * the order Ken asked for:
 *     1. Appointments   2. Tasks   3. Routines   4. Reminders
 * Each group carries a count in its header and renders an honest empty
 * line ("No appointments today") rather than vanishing.
 *
 * ─── DATA SOURCES (and why) ──────────────────────────────────────────
 * Appointments  — `useAppointments()` (backend FHIR appointments, same
 *                 react-query cache key the Appointments screen uses so
 *                 the two screens share one fetch) mapped through
 *                 `virtualEventFromAppEntity`, merged via `useCalendar`
 *                 together with device calendar events + care-manager
 *                 server events. Merging through useCalendar is
 *                 deliberate: mergeEvents() already carries the
 *                 content-based dedupe that fixed Ken's "same event 5
 *                 times" bug, so a device-mirrored appointment does not
 *                 show twice here.
 * Tasks         — `fetchTasksForDate` (AI health plan). Unchanged.
 * Routines      — `usePlanHabits()` (SCRUM-659 plan habits). Ken is
 *                 renaming this concept to "Routines" in the UI, so the
 *                 LABEL here says Routines while the identifiers stay
 *                 `habit*` (another workstream owns the rename).
 * Reminders     — the `origin === 'reminder'` slice of the useCalendar
 *                 feed, i.e. iOS Reminders read by services/calendar
 *                 `readReminders` plus cross-device snapshot reminders.
 *                 NOT notification/reminder *settings*
 *                 (services/api/notification-prefs, Home/reminder-
 *                 settings.tsx): those are per-category preferences and
 *                 schedules, not dated items, so they cannot populate a
 *                 "what is on today" list.
 *
 * SCRUM-666 (Ken 2026-08-11, "we don't have reminders and we aren't showing
 * them") adds a SECOND sense of reminder to this screen, and the distinction
 * matters when reading the code below:
 *
 *   - a reminder ROW is still only the iOS Reminders slice described above;
 *   - a reminder BELL marks a row that will itself buzz the phone at its hour.
 *
 * The bell is an attribute rather than a row on purpose. Our own reminders are
 * always about something already on this screen, so emitting them as rows
 * would draw every timed routine twice — the routine, and a reminder for the
 * routine, an hour apart on the same spine. See TimelineItem.willRemind.
 *
 * Health-plan tasks that the backend also publishes onto the calendar
 * feed (`origin:'app'`, `appKind:'task'`) are explicitly EXCLUDED from
 * the Appointments group — otherwise every plan task would appear twice
 * on this screen.
 *
 * ─── PRESERVED BEHAVIOUR (do not regress) ────────────────────────────
 *  • task complete / skip (tap / long-press)
 *  • smart metric capture via detectMetricForTask + RecordMetricModal
 *  • optimistic update + revert on failure, with the same Alert copy
 *  • invalidateWellbeingCaches(queryClient) after a successful
 *    complete AND after a successful skip (Ken 2026-08-06 iter 3 —
 *    adherence feeds the wellbeing sub-score)
 *  • local per-day "done" toggle for calendar items / reminders, stored
 *    in AsyncStorage because there is no backend completion concept for
 *    arbitrary device events, and never counted toward plan progress
 *  • plan-task notification reconciliation on load
 *
 * ─── iOS 26.5 ENVELOPE ───────────────────────────────────────────────
 * Primitive components only — View / Text / Pressable / ScrollView /
 * Modal / MaterialIcons / StyleSheet. The previous version pulled in
 * react-native-paper (Card / List.Icon / IconButton) and
 * ActivityIndicator; both are dropped here to match the envelope used
 * by the other recently-shipped screens (see app/Home/habits.tsx).
 *
 * Accessibility: every text size/weight goes through
 * getScaledFontSize / getScaledFontWeight, tap targets are >= 44pt, and
 * state is never signalled by colour alone — a completed row also
 * carries a literal "Done" / "Skipped" label.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useQueryClient } from '@tanstack/react-query';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppWrapper } from '@/components/app-wrapper';
import { RecordMetricModal } from '@/components/home/record-metric-modal';
import { EntityIcon } from '@/components/icons';
import { Colors } from '@/constants/theme';
import { useAppointments } from '@/hooks/use-appointments';
import {
  buildTimeline,
  computeAdherence,
  minutesSinceMidnight,
  type TimelineItem,
} from '@/lib/today-timeline';
import { TodayTimeline, TodayLegend } from '@/components/today/TodayTimeline';
import { AdherenceScore } from '@/components/today/AdherenceScore';
import { useCalendar } from '@/hooks/use-calendar';
import {
  useHabitRemindersFlag,
  useHabitsInPlanFlag,
  usePlanHabits,
  useRoutineCompletions,
  useToggleRoutineCompletion,
} from '@/hooks/use-plan-habits';
import { useNotificationCategories } from '@/hooks/use-notification-categories';
import { invalidateWellbeingCaches } from '@/lib/invalidate-wellbeing';
import { completeTask, fetchTasksForDate } from '@/services/api/ai-health-plan';
import { fetchMedicationsSummary, fetchPatientInfo } from '@/services/api/patient';
import type { MedicationSummary, TaskOccurrence, } from '@/services/api/types';
import {
  getPermissionStatus,
  getReminderPermissionStatus,
  virtualEventFromAppEntity,
  type CalendarEvent,
} from '@/services/calendar';
import { resolveCategoryGate } from '@/services/notification-category-gate';
import { reconcilePlanTaskNotifications } from '@/services/plan-task-notifications';
import { detectMetricForTask, type MetricInputSpec } from '@/services/smart-task-detection';
import { getPhotoDownloadUrl } from '@/services/user-photo';
import { useAccessibility } from '@/stores/accessibility-store';
import { todayLocalIso, eventDayKey } from '@/lib/day-key';
import { useTodayWindow } from '@/hooks/use-local-day';
import { formatDayLabel } from '@/lib/day-key';

// ─── Small pure helpers ──────────────────────────────────────────────

/**
 * Today's date as YYYY-MM-DD, in the patient's LOCAL timezone.
 *
 * This was UTC-based until 2026-08-12, with a note saying that was deliberate
 * because every other caller derived "today" the same way, and "if we fix it,
 * we fix it everywhere at once."
 *
 * We fixed it everywhere at once. The premise had also been wrong: Home
 * (index.tsx) and the readiness hook were already LOCAL, which is why Home and
 * this screen visibly disagreed about which appointments belonged to today.
 *
 * What UTC cost, for a patient in Los Angeles, every day from 17:00 local:
 *   - fetchTasksForDate() asked for TOMORROW, so this screen showed tomorrow's
 *     task list
 *   - on a Friday evening every `weekdays` task returned zero occurrences and
 *     computeAdherence reported 100% — nothing was due, so nothing was missed
 *   - routine completion ticks were PERSISTED against tomorrow's date
 *   - undated reminders disappeared from this screen entirely
 *
 * See lib/day-key.ts. Keep this a thin alias rather than inlining the helper:
 * the name `todayISO` appears throughout this file and in its contract tests.
 */
function todayISO(): string {
  return todayLocalIso();
}



/**
 * Compose an ISO instant from the backend appointment's separate
 * `date` (YYYY-MM-DD) + `time` (HH:MM) fields. Mirrors the helper in
 * app/Home/appointments.tsx so both screens place an appointment at the
 * same instant.
 */
function toIso(date: string, time?: string): string {
  if (!date) return '';
  const t = (time ?? '00:00').trim();
  const m = /^(\d{1,2}):(\d{2})(:(\d{2}))?$/.exec(t);
  if (!m) {
    const fallback = new Date(`${date}T00:00:00`);
    return Number.isNaN(fallback.getTime()) ? '' : fallback.toISOString();
  }
  const hh = m[1].padStart(2, '0');
  const d = new Date(`${date}T${hh}:${m[2]}:${m[4] ?? '00'}`);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString();
}




// ─── Section shell ───────────────────────────────────────────────────



// ─── Screen ──────────────────────────────────────────────────────────

export default function TodayScheduleScreen(): React.JSX.Element {
  const { getScaledFontSize, settings, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  const queryClient = useQueryClient();

  const [patientName, setPatientName] = useState('');
  const [patientPhotoUrl, setPatientPhotoUrl] = useState<string | null>(null);
  const [isLoadingPatient, setIsLoadingPatient] = useState(true);
  const [medications, setMedications] = useState<MedicationSummary[]>([]);
  const [planTasks, setPlanTasks] = useState<TaskOccurrence[]>([]);
  const [isLoadingTasks, setIsLoadingTasks] = useState(true);
  // Tasks used to fail silently, which made a failed fetch look exactly
  // like "nothing scheduled today". With always-rendered sections that
  // lie is now visible on every load, so surface it.
  const [tasksError, setTasksError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // SCRUM-279 (build 45): Health Metrics section removed from this
  // screen — it lives in Health Trends and was duplicated here.

  const today = todayISO();

  // ── Calendar window: local midnight → local end of day ────────────
  // Refreshed across midnight and on foreground. This used to be
  // useMemo(..., []) — evaluated once on mount — so a screen left open
  // overnight kept YESTERDAY's window with nothing to indicate it was stale.
  // See hooks/use-local-day.ts.
  const todayWindow = useTodayWindow();

  // ── Appointments (backend) → virtual calendar events ──────────────
  // Passing them through useCalendar rather than rendering them from a
  // parallel list is what keeps a device-mirrored appointment from
  // rendering twice: mergeEvents() dedupes on id AND on content
  // (title + start + end + allDay).
  const { data: appointments, isLoading: isLoadingAppointments, isError: appointmentsError } = useAppointments();
  const appEvents = useMemo<CalendarEvent[]>(() => {
    if (!appointments) return [];
    const now = Date.now();
    return appointments
      .map((a) => {
        const startIso = toIso(a.date, a.time);
        const endIso = a.endDate
          ? toIso(a.endDate, a.endTime)
          : a.endTime
            ? toIso(a.date, a.endTime)
            : startIso;
        return virtualEventFromAppEntity({
          id: a.id,
          title: a.doctorName ? `${a.type} — ${a.doctorName}` : a.type,
          startDate: startIso,
          endDate: endIso || startIso,
          location: a.clinicName,
          notes: a.notes,
          // A visit earlier today is a past-visit; later today is an
          // appointment. Both belong in the Appointments group.
          kind: new Date(startIso).getTime() < now ? 'past-visit' : 'appointment',
        });
      })
      .filter((e) => !!e.startDate && !Number.isNaN(new Date(e.startDate).getTime()));
  }, [appointments]);

  const {
    events: calendarEvents,
    isLoading: isLoadingCalendar,
    refresh: refreshCalendar,
  } = useCalendar({
    appEvents,
    windowStart: todayWindow.start,
    windowEnd: todayWindow.end,
    includeReminders: true,
  });

  const todayCalendarItems = useMemo(
    () =>
      calendarEvents
        .filter((e) => eventDayKey(e) === today)
        .sort((a, b) => a.startDate.localeCompare(b.startDate)),
    [calendarEvents, today],
  );

  /**
   * Appointments group = everything on today's calendar feed that is
   * not a reminder and not a health-plan task.
   *
   * The `appKind !== 'task'` filter matters: cos-backend also publishes
   * health-plan tasks onto the calendar feed (see
   * serverEventToCalendarEvent in hooks/use-calendar.ts). Without this
   * filter every plan task would render once here and once in the Tasks
   * group.
   */
  const appointmentItems = useMemo(
    () => todayCalendarItems.filter((e) => e.origin !== 'reminder' && e.appKind !== 'task'),
    [todayCalendarItems],
  );

  /** Reminders group = the iOS Reminders / snapshot-reminder slice. */
  const reminderItems = useMemo(
    () => todayCalendarItems.filter((e) => e.origin === 'reminder'),
    [todayCalendarItems],
  );

  // ── Routines (plan habits, displayed as "Routines") ───────────────
  const routinesEnabled = useHabitsInPlanFlag();
  const { habits: routines, isLoading: isLoadingRoutines, isError: routinesError } = usePlanHabits();

  // SCRUM-666 — whether a timed routine will genuinely buzz the phone. Both
  // halves are required and neither is inferable from the other: the backend
  // dispatch flag rolls out separately from habits_in_plan_enabled (already on
  // in production), and the patient can switch "Routine reminders" off in
  // Profile → Reminders. `prefs` falls back to nothing rather than to a
  // default-ON assumption, so a failed prefs fetch hides the bell instead of
  // promising a push we cannot confirm.
  // SCRUM-666 r2 — per-day routine ticks. Own query key, never folded into the
  // plan cache, so no plan refetch can carry them into a scorer's input.
  const { completedIds: completedRoutineIds } = useRoutineCompletions(today);
  const toggleRoutine = useToggleRoutineCompletion(today);

  const habitRemindersFlag = useHabitRemindersFlag();
  const { data: notificationCategories } = useNotificationCategories();
  const habitRemindersLive =
    habitRemindersFlag && notificationCategories?.preferences?.habits === true;

  // ── Permission state — so empty states can be honest ──────────────
  // "No appointments today" is misleading when the real reason is that
  // calendar access was denied. Surface that as a hint rather than
  // letting the patient assume their day is clear.
  const [calendarAccessDenied, setCalendarAccessDenied] = useState(false);
  const [reminderAccessDenied, setReminderAccessDenied] = useState(false);
  useEffect(() => {
    void (async () => {
      try {
        const [cal, rem] = await Promise.all([getPermissionStatus(), getReminderPermissionStatus()]);
        setCalendarAccessDenied(cal.prompted && !cal.granted);
        setReminderAccessDenied(rem.prompted && !rem.granted);
      } catch {
        // Permission probe is best-effort; never block the screen.
      }
    })();
  }, []);

  // ── Local per-day "done" state for calendar items + reminders ─────
  // SCRUM-279 (build 49): Ken's ask "we need to have these events and
  // calendar in today's task also, so user can complete it in task
  // also. but this won't impact plan progress." There is no backend
  // "completed" concept for arbitrary device events, so completion is
  // stored per-day in AsyncStorage. iOS Reminders keep their own
  // completed flag, which we respect on load. None of this counts
  // toward the AI plan's % done.
  const [completedCalendarIds, setCompletedCalendarIds] = useState<Set<string>>(new Set());
  const CALENDAR_DONE_KEY = `csh-today-cal-done-${today}`;
  useEffect(() => {
    void (async () => {
      try {
        const raw = await AsyncStorage.getItem(CALENDAR_DONE_KEY);
        if (raw) setCompletedCalendarIds(new Set(JSON.parse(raw) as string[]));
      } catch {
        /* ignore */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── The single timeline (Ken 2026-08-11) ──────────────────────────
  //
  // Four streams in, one time-ordered spine out. The mapping is the whole
  // trick, so each source states how it gets a time:
  //
  //   appointments — ISO startDate, already on the clock
  //   tasks        — PlanTask.scheduledTime (HH:MM)
  //   routines     — PlanHabit.scheduledTime, OPTIONAL (be #380). A routine
  //                  had only a cadence, which says how often and never when.
  //                  Without a time it goes to "Anytime today" — honest, and
  //                  true of "stretch sometime today". Existing routines have
  //                  no time until a plan regenerates.
  //   reminders    — ISO startDate when the source gave one, else anytime.
  //
  // Merge logic + ordering live in lib/today-timeline.ts so they are testable
  // without a device; this memo only shapes the inputs.
  const hhmmFromIso = (iso: string): string | null => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const timelineItems = useMemo<TimelineItem[]>(() => {
    const out: TimelineItem[] = [];

    for (const a of appointmentItems) {
      out.push({
        id: `appt:${a.id}`,
        kind: 'appointment',
        title: a.title,
        time: a.allDay ? null : hhmmFromIso(a.startDate),
        done: completedCalendarIds.has(a.id),
        detail: a.location || undefined,
      });
    }

    for (const t of planTasks) {
      out.push({
        id: `task:${t.id}`,
        kind: 'task',
        title: t.title,
        time: t.scheduledTime || null,
        done: t.status === 'completed',
        detail: t.completionStyle === 'measurable' ? t.metric?.name : undefined,
      });
    }

    if (routinesEnabled) {
      for (const r of routines) {
        const time = r.scheduledTime || null;
        out.push({
          id: `routine:${r.habitId}`,
          kind: 'routine',
          title: r.label,
          time,
          done: completedRoutineIds.has(r.habitId),
          detail: typeof r.cadence === 'string' ? undefined : `every ${r.cadence.everyNDays} days`,
          // SCRUM-666. Three conditions, all required, because each one is a
          // way the bell could lie:
          //   • a time — an "anytime today" routine has no hour to fire at
          //   • dispatch live — the backend sweep is dark-launched separately
          //     from habits_in_plan_enabled, which is already on in prod
          //   • the patient's own toggle — "Routine reminders" is finally
          //     load-bearing, so it has to be honoured here too
          //   • SCRUM-666 r2 — this routine's OWN bell. Absent reads as true,
          //     matching the backend, so already-timed routines keep their
          //     reminder; an explicit false places it silently.
          willRemind: !!time && habitRemindersLive && r.remindersEnabled !== false,
        });
      }
    }

    for (const r of reminderItems) {
      out.push({
        id: `rem:${r.id}`,
        kind: 'reminder',
        title: r.title,
        time: r.allDay ? null : hhmmFromIso(r.startDate),
        done: completedCalendarIds.has(r.id),
        // 2026-08-12 — Vishal: "in my app i have 2 reminders without any
        // expiry date but in csh app i don't see them." They were dropped
        // before ever reaching this screen. Now they land in "Anytime today",
        // and the sub-line says why they have no hour rather than leaving the
        // patient to wonder whether we lost their time.
        // "No due date" explains an Anytime row; "Repeats" explains a row
        // the patient never sees in iOS on this specific day, because iOS
        // shows a repeating reminder only on its next due date.
        detail: r.undated ? 'No due date' : r.repeating ? 'Repeats' : undefined,
      });
    }

    return out;
  }, [
    appointmentItems,
    planTasks,
    routines,
    routinesEnabled,
    reminderItems,
    completedCalendarIds,
    // Without this the bells keep their old state after the patient toggles
    // "Routine reminders" off in Profile and comes straight back here — the
    // screen would show reminders for pushes it has just stopped sending.
    habitRemindersLive,
    // The tick itself. Without this the row keeps its old strikethrough after
    // a tap — the write succeeds and the screen silently disagrees with it.
    completedRoutineIds,
  ]);

  // Recomputed on each render rather than ticked on a timer: the NOW marker
  // only has to be right when the patient is looking, and a per-minute
  // interval on this screen would re-render the whole day for a line that
  // moves an hour at a time.
  const nowMinutes = minutesSinceMidnight(new Date());
  const timeline = useMemo(() => buildTimeline(timelineItems), [timelineItems]);
  const adherence = useMemo(
    () => computeAdherence(timelineItems, nowMinutes),
    [timelineItems, nowMinutes],
  );

  const timelineColors = useMemo(
    () => ({
      text: colors.text as string,
      subtext: colors.subtext as string,
      card: (colors.card as string) ?? (colors.background as string),
      border: colors.border as string,
      tint: colors.tint as string,
    }),
    [colors],
  );

  /**
   * Loading / permission / error state, surfaced ABOVE the timeline.
   *
   * A timeline has no per-group headers to hang "No appointments today" on,
   * so an empty day and a denied calendar look identical. That is the one
   * regression a spine can cause versus the grouped layout, and these lines
   * are what prevent it.
   */
  const timelineNotices = useMemo(() => {
    const n: string[] = [];
    if (isLoadingAppointments || isLoadingCalendar || isLoadingTasks || isLoadingRoutines) {
      n.push('Loading your day…');
    }
    if (calendarAccessDenied) {
      n.push('Calendar access is off, so events saved on this device are not shown.');
    }
    if (reminderAccessDenied) {
      n.push('Reminders access is off, so your Reminders list is not shown.');
    }
    if (appointmentsError) n.push("Couldn't load appointments. Pull down to try again.");
    if (tasksError) n.push("Couldn't load tasks. Pull down to try again.");
    if (routinesError) n.push("Couldn't load routines. Pull down to try again.");
    return n;
  }, [
    isLoadingAppointments, isLoadingCalendar, isLoadingTasks, isLoadingRoutines,
    calendarAccessDenied, reminderAccessDenied, appointmentsError, tasksError, routinesError,
  ]);

  /**
   * Tapping a timeline row routes back to the SAME handlers the grouped rows
   * used, keyed by the id prefix the merge stamped on.
   *
   * Deliberately no new completion path: the task flow already carries
   * optimistic update, rollback on failure, and the measurable-task capture
   * modal. Re-implementing any of that here would be a second source of
   * truth for "done", which is how the two surfaces start disagreeing.
   */
  const onPressTimelineItem = (item: TimelineItem) => {
    if (item.id.startsWith('task:')) {
      const id = item.id.slice('task:'.length);
      const task = planTasks.find((t) => t.id === id);
      // Completed tasks are not un-completed from the timeline — the
      // grouped rows had an explicit control for that and this is a
      // one-tap surface. Tapping a done row is a no-op, not a silent undo.
      if (task && task.status !== 'completed') void handleTaskComplete(task);
      return;
    }
    if (item.id.startsWith('appt:') || item.id.startsWith('rem:')) {
      const id = item.id.slice(item.id.indexOf(':') + 1);
      const ev = todayCalendarItems.find((e) => e.id === id);
      if (ev) toggleCalendarItem(ev);
      return;
    }
    if (item.id.startsWith('routine:')) {
      // SCRUM-666 r2 — Vishal 2026-08-12: "user should be able to complete
      // them similar to task but they won't impact any score."
      //
      // Unlike a task, a routine CAN be un-ticked here. A task completion is a
      // clinical event that feeds adherence, so undo lives behind a deliberate
      // control; a routine tick is per-day UI state that counts toward
      // nothing, so a mistaken tap should cost exactly one more tap.
      //
      // Note what is absent: no invalidateWellbeingCaches, no adherence
      // recompute. computeAdherence filters to kind === 'task', so routines
      // are excluded structurally rather than by remembering not to add them.
      const habitId = item.id.slice('routine:'.length);
      toggleRoutine.mutate({ habitId, done: !item.done });
      return;
    }
  };

  const toggleCalendarItem = (item: CalendarEvent) => {
    setCompletedCalendarIds((prev) => {
      const next = new Set(prev);
      if (next.has(item.id)) next.delete(item.id);
      else next.add(item.id);
      AsyncStorage.setItem(CALENDAR_DONE_KEY, JSON.stringify([...next])).catch(() => {});
      return next;
    });
  };

  /**
   * Open the right detail screen for a calendar item.
   *
   * Mirrors openDetail() in app/Home/appointments.tsx — including the
   * `app:<kind>:<uuid>` prefix strip that fixed Ken's "Could not load
   * appointment" (build 40). Server-stored and device/reminder items go
   * to the unified /calendar-event-detail popover instead, which knows
   * how to look them up.
   */

  // ── Initial load ──────────────────────────────────────────────────
  useEffect(() => {
    const loadPatientData = async () => {
      try {
        const patient = await fetchPatientInfo();
        if (patient) {
          setPatientName(patient.name || '');
          if (patient.photoUrl) {
            try {
              // #16: signed URL only. `patient.photoUrl` is the canonical,
              // UNSIGNED S3 key on a private bucket — it can only ever 403,
              // so using it as a fallback turns one transient signing failure
              // into a permanently broken image indistinguishable from
              // "no photo set". Leaving it null renders initials honestly.
              const downloadUrl = await getPhotoDownloadUrl();
              setPatientPhotoUrl(downloadUrl ?? null);
            } catch {
              setPatientPhotoUrl(null);
            }
          }
        }
      } catch {
        // Patient data failed to load
      } finally {
        setIsLoadingPatient(false);
      }
    };

    const loadMedications = async () => {
      try {
        const meds = await fetchMedicationsSummary();
        if (meds && meds.length > 0) {
          setMedications(meds);
        }
      } catch {
        // Medications failed to load
      }
    };

    const loadPlanTasks = async () => {
      try {
        const t = await fetchTasksForDate(todayISO());
        setPlanTasks(t);
        setTasksError(false);
        // SCRUM-279 (build 51): schedule local notifications for
        // today's pending plan tasks — 15 min before + at-time pair
        // per Ken's spec. Idempotent; runs whenever plan tasks
        // refresh (mount, focus, pull-to-refresh).
        //
        // COS-373: when the categories feature is ON, fetch the patient's
        // per-category prefs and gate the scheduler with them (medication
        // tasks → medicationTask, others → otherTask). When OFF we pass no
        // gate, so the scheduler schedules exactly as before. Resolving the
        // gate is best-effort — any failure falls back to no gate.
        const gate = await resolveCategoryGate();
        void reconcilePlanTaskNotifications(t, gate).catch(() => {
          /* non-fatal */
        });
      } catch {
        setTasksError(true);
      } finally {
        setIsLoadingTasks(false);
      }
    };

    loadPatientData();
    loadMedications();
    loadPlanTasks();
  }, []);

  // ── Smart metric capture ──────────────────────────────────────────
  // SCRUM-279 (build 45): some tasks (blood glucose / weight / BP /
  // ...) deserve to also RECORD a value alongside marking complete.
  // When the user taps such a task, open a modal asking for the value.
  // The task isn't marked completed until either the value is saved OR
  // the user chooses "Skip recording".
  const [metricModalTask, setMetricModalTask] = useState<TaskOccurrence | null>(null);
  const [metricModalSpec, setMetricModalSpec] = useState<MetricInputSpec | null>(null);

  // Core completion path — extracted so the smart-task capture flow can
  // call it after a value is saved.
  const persistTaskCompletion = async (task: TaskOccurrence) => {
    setPlanTasks((prev) =>
      prev.map((t) =>
        t.id === task.id && t.scheduledFor === task.scheduledFor
          ? { ...t, status: 'completed', completedAt: new Date().toISOString() }
          : t,
      ),
    );
    const result = await completeTask(task.id, task.scheduledFor);
    if (!result.ok) {
      setPlanTasks((prev) =>
        prev.map((t) =>
          t.id === task.id && t.scheduledFor === task.scheduledFor
            ? { ...t, status: 'pending', completedAt: undefined }
            : t,
        ),
      );
      const reason = result.code === 'NETWORK_ERROR'
        ? 'No internet connection. Try again when you’re back online.'
        : result.status === 401 || result.status === 403
          ? 'Your session expired. Please sign in again to mark tasks complete.'
          : (result.message ?? 'Could not save task completion.');
      Alert.alert("Couldn't complete task", reason);
      return;
    }
    // Ken 2026-08-06 iter 3 — adherence sub-score changed. Invalidate
    // wellbeing caches so the Home tile arrow/sparkline refresh
    // without a cold-launch. BE already dropped its own cache row
    // on the POST /tasks/:id/complete handler.
    invalidateWellbeingCaches(queryClient);
  };

  const handleTaskComplete = async (task: TaskOccurrence) => {
    if (task.status === 'completed') return;
    // Smart detection: if this task is asking the patient to measure
    // something, open the capture modal instead of completing right
    // away. Persisting completion is deferred until the modal confirms.
    const spec = detectMetricForTask(task);
    if (spec) {
      setMetricModalTask(task);
      setMetricModalSpec(spec);
      return;
    }
    // Non-trackable task — original behaviour.
    await persistTaskCompletion(task);
  };

  // NOTE: `handleTaskSkip` lived here for the grouped rows' explicit Skip
  // control. The timeline is a one-tap surface and has no room for a second
  // per-row action, so it was removed rather than left as dead code that
  // looks live. Skipping a task is still reachable from the Plan screen
  // (app/Home/health-plan.tsx) — the capability moved surface, it was not
  // lost. If Skip is wanted back here it belongs on a long-press or in a
  // row detail sheet, not as a second inline button.


  // ── Pull to refresh — every group, not just tasks ─────────────────
  const onRefresh = async () => {
    setRefreshing(true);
    try {
      const [meds, t] = await Promise.all([
        fetchMedicationsSummary().catch(() => null),
        fetchTasksForDate(todayISO()).catch(() => null),
        // Calendar + appointments + routines refresh in parallel; each
        // is best-effort so one failure can't block the others.
        refreshCalendar().catch(() => null),
        queryClient.invalidateQueries({ queryKey: ['appointments'] }).catch(() => null),
        queryClient.invalidateQueries({ queryKey: ['ai-health-plan'] }).catch(() => null),
      ]);
      if (meds) setMedications(meds);
      if (t) {
        setPlanTasks(t);
        setTasksError(false);
      }
    } finally {
      setRefreshing(false);
    }
  };

  //
  return (
    <AppWrapper>
      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.text}
            colors={[colors.text]}
          />
        }
        style={styles.scrollContainer}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerTitleBlock}>
            <Text
              numberOfLines={2}
              style={[
                styles.headerTitle,
                {
                  fontSize: getScaledFontSize(24),
                  fontWeight: getScaledFontWeight(700) as any,
                  color: colors.text,
                },
              ]}>
              Today&apos;s Schedule
            </Text>
            {/* Ken 2026-08-14: "Possible to put today's date on schedule?"
                Derived from the same day key the screen is built from, not
                from a fresh clock read — so the label and the schedule roll
                over together at midnight instead of drifting apart, which is
                the bug class this whole area has been about. */}
            <Text
              numberOfLines={1}
              accessibilityLabel={`Today is ${formatDayLabel(todayWindow.dayKey)}`}
              style={{
                color: colors.subtext,
                fontSize: getScaledFontSize(14),
                fontWeight: getScaledFontWeight(600) as any,
                marginTop: 2,
              }}>
              {formatDayLabel(todayWindow.dayKey)}
            </Text>
          </View>

          {/* Ken 2026-08-11: "adherence score up in right corner as well?".
              Treatment B (percentage leads) per Vishal, and tappable — a
              number nobody can interrogate gets mistrusted the first time it
              looks wrong, and this one WILL look wrong to anyone expecting
              their 8pm task in the denominator at lunchtime. */}
          <AdherenceScore
            adherence={adherence}
            colors={timelineColors}
            getScaledFontSize={getScaledFontSize}
            getScaledFontWeight={getScaledFontWeight}
          />
        </View>

        {/* Profile summary */}
        <View style={[styles.profileCard, { backgroundColor: colors.card }]}>
          {isLoadingPatient ? (
            <Text style={{ fontSize: getScaledFontSize(14), color: colors.text + '80' }}>Loading…</Text>
          ) : (
            <View style={styles.profileContent}>
              <EntityIcon
                type="patient"
                imageUrl={patientPhotoUrl ?? null}
                name={patientName || 'Patient'}
                size={getScaledFontSize(44)}
              />
              <View style={styles.profileInfo}>
                <Text
                  style={{
                    fontSize: getScaledFontSize(20),
                    fontWeight: getScaledFontWeight(600) as any,
                    color: colors.text,
                    marginBottom: 4,
                  }}>
                  {patientName}
                </Text>
                <Text
                  style={{
                    fontSize: getScaledFontSize(14),
                    fontWeight: getScaledFontWeight(400) as any,
                    color: colors.text + '80',
                  }}>
                  Patient
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* ── One chronological spine (Ken 2026-08-11) ─────────────
            "This is where appts / routines and tasks come together to build
            our daily schedule." The four groups this replaces meant 9am was
            described in three places and the patient merged the lists
            themselves to answer "what's next?".

            The good idea from those groups is kept: nothing is silently
            dropped. Anything without a time lands in "Anytime today" rather
            than vanishing — the exact failure the groups were built to fix
            in August. Loading and permission states are surfaced above the
            timeline for the same reason: "nothing scheduled" must never be
            the way a patient learns calendar access is off. */}
        <View style={styles.timelineBlock}>
        <TodayLegend
          colors={timelineColors}
          getScaledFontSize={getScaledFontSize}
          getScaledFontWeight={getScaledFontWeight}
          // Only on days something actually carries a bell — a key for a
          // symbol that is nowhere on the screen is noise.
          showReminderKey={timelineItems.some((i) => i.willRemind)}
        />

        {timelineNotices.length > 0 && (
          <View style={styles.noticeStack}>
            {timelineNotices.map((n) => (
              <Text
                key={n}
                style={[styles.noticeText, { color: colors.subtext, fontSize: getScaledFontSize(12) }]}>
                {n}
              </Text>
            ))}
          </View>
        )}

        <TodayTimeline
          timeline={timeline}
          nowMinutes={nowMinutes}
          colors={timelineColors}
          getScaledFontSize={getScaledFontSize}
          getScaledFontWeight={getScaledFontWeight}
          onPressItem={onPressTimelineItem}
        />
        </View>

        {/* Current medications — kept from the previous version. Not one
            of the four day groups, so it sits below them and, unlike the
            groups, stays hidden when the patient has no active meds. */}
        {medications.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionHeaderLeft}>
                <Text
                  style={{
                    fontSize: getScaledFontSize(18),
                    fontWeight: getScaledFontWeight(700) as any,
                    color: colors.text,
                  }}>
                  Current Medications
                </Text>
                <View style={[styles.countBadge, { backgroundColor: colors.primary + '18' }]}>
                  <Text
                    style={{
                      fontSize: getScaledFontSize(12),
                      fontWeight: getScaledFontWeight(700) as any,
                      color: colors.primary,
                    }}>
                    {medications.length}
                  </Text>
                </View>
              </View>
            </View>

            {medications.map((med) => {
              let dateLabel = '';
              if (med.authoredOn) {
                const d = new Date(med.authoredOn);
                dateLabel = Number.isNaN(d.getTime())
                  ? ''
                  : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
              }
              const doseDisplay = med.dosage || med.rawDosageText || '';
              const freqDisplay = med.frequency || '';
              const detailParts = [doseDisplay, freqDisplay].filter(Boolean);

              return (
                <View
                  key={med.id}
                  style={[
                    styles.medCard,
                    {
                      backgroundColor: colors.background,
                      borderColor: colors.primary + '20',
                      borderLeftColor: colors.primary,
                    },
                  ]}>
                  <View style={styles.medCardHeader}>
                    <View style={[styles.rowIcon, { backgroundColor: colors.primary + '12' }]}>
                      <MaterialIcons name="medication" size={18} color={colors.primary} />
                    </View>
                    <View style={styles.rowBody}>
                      <Text
                        style={{
                          fontSize: getScaledFontSize(15),
                          fontWeight: getScaledFontWeight(600) as any,
                          color: colors.text,
                        }}
                        numberOfLines={2}>
                        {med.name}
                      </Text>
                      {detailParts.length > 0 && (
                        <Text
                          style={{
                            fontSize: getScaledFontSize(13),
                            fontWeight: getScaledFontWeight(400) as any,
                            color: colors.text + '80',
                            marginTop: 2,
                          }}
                          numberOfLines={1}>
                          {detailParts.join(' · ')}
                        </Text>
                      )}
                    </View>
                  </View>

                  {dateLabel ? (
                    <View style={styles.medDateRow}>
                      <MaterialIcons name="event" size={14} color={colors.text + '50'} />
                      <Text style={{ fontSize: getScaledFontSize(12), color: colors.text + '50' }}>
                        Prescribed {dateLabel}
                      </Text>
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* SCRUM-279 (build 45): smart-task value capture. Modal opens
          when the user taps a recordable task (blood glucose / weight /
          etc.) and POSTs the captured value before marking complete. */}
      <RecordMetricModal
        visible={!!metricModalTask && !!metricModalSpec}
        spec={metricModalSpec}
        taskTitle={metricModalTask?.title ?? ''}
        sourceTaskId={metricModalTask?.id}
        onClose={() => {
          setMetricModalTask(null);
          setMetricModalSpec(null);
        }}
        onConfirmComplete={async () => {
          const task = metricModalTask;
          setMetricModalTask(null);
          setMetricModalSpec(null);
          if (task) await persistTaskCompletion(task);
        }}
      />
    </AppWrapper>
  );
}

const styles = StyleSheet.create({
  scrollContainer: { flex: 1 },
  scrollContent: { paddingBottom: 32 },

  header: {
    flexDirection: 'row',
    // Was `center`: the title sat alone. The score now takes the right
    // corner Ken asked for, so the two ends of the row anchor.
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  // Was centred, from when the title was alone in the row. With the
  // adherence score occupying the right corner, centring inside flex:1
  // leaves the text visibly off-axis against a dead gap.
  // The flex/shrink moved to headerTitleBlock when the date line was added
  // (Ken 2026-08-14) — the title and date share a column, and the block is
  // what has to yield width to the adherence score, not the title alone.
  headerTitleBlock: { flex: 1, flexShrink: 1, marginRight: 12 },
  headerTitle: { textAlign: 'left' },

  // Was margin 16 / padding 20 around an 80pt avatar — a large block between
  // the header and the actual day, on the screen you reach BY TAPPING that
  // same avatar on the Home circle. Ken 2026-08-11: "too crowded". Trimmed to
  // a identification strip; the day starts higher.
  profileCard: { marginHorizontal: 16, marginBottom: 12, padding: 12, borderRadius: 14 },
  profileContent: { flexDirection: 'row', alignItems: 'center' },
  profileInfo: { marginLeft: 12, flex: 1 },

  // Day groups
  section: { marginHorizontal: 16, marginBottom: 20 },
  // The four groups this replaced each carried `section`'s 16pt inset.
  // Without it the timeline rendered flush to both screen edges while the
  // profile card and medications stayed inset — which is what "looks very
  // bad" was.
  timelineBlock: { marginHorizontal: 16, marginBottom: 20 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  countBadge: { minWidth: 24, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, alignItems: 'center' },
  emptyLine: { paddingVertical: 4 },
  emptyHint: { paddingBottom: 4 },

  // Rows
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 8,
    minHeight: 60,
  },
  // 44pt minimum tap target for the done toggle (our patients skew
  // older — a 22pt circle is not reliably tappable).
  checkHit: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: -8 },
  checkCircle: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  // Row-body press area for calendar rows (opens detail). Fills the
  // remaining width so the whole row minus the checkbox is tappable.
  rowBodyHit: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  rowIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowBody: { flex: 1 },
  rowSub: { marginTop: 2 },
  recordPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, borderWidth: 1, marginRight: 4 },

  // Medications
  medCard: { borderWidth: 1, borderLeftWidth: 3, borderRadius: 14, padding: 14, marginBottom: 8 },
  medCardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  noticeStack: { marginBottom: 12, gap: 4 },
  noticeText: { lineHeight: 17 },
  medDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
  },
});

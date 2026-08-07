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
import { router } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppWrapper } from '@/components/app-wrapper';
import { RecordMetricModal } from '@/components/home/record-metric-modal';
import { EntityIcon } from '@/components/icons';
import { Colors } from '@/constants/theme';
import { useAppointments } from '@/hooks/use-appointments';
import { useCalendar } from '@/hooks/use-calendar';
import { useHabitsInPlanFlag, usePlanHabits } from '@/hooks/use-plan-habits';
import { invalidateWellbeingCaches } from '@/lib/invalidate-wellbeing';
import { completeTask, fetchTasksForDate, skipTask } from '@/services/api/ai-health-plan';
import { fetchMedicationsSummary, fetchPatientInfo } from '@/services/api/patient';
import type { MedicationSummary, PlanHabit, TaskOccurrence, TaskType } from '@/services/api/types';
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

// ─── Small pure helpers ──────────────────────────────────────────────

/**
 * Today's date as YYYY-MM-DD.
 *
 * NOTE: intentionally UTC-based (`toISOString`) because every other
 * caller in the app derives "today" the same way — app/Home/
 * appointments.tsx, health-plan.tsx, bps-progress.tsx, auth-prefetch.ts.
 * Switching only this screen to a local-timezone day would make it
 * disagree with the task list the plan screen shows late in the evening
 * for US timezones. If we fix it, we fix it everywhere at once.
 */
function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** "14:30" → "2:30 PM". Plan tasks store a wall-clock HH:MM string. */
function formatTaskTime(hhmm: string): string {
  const [hStr, m] = hhmm.split(':');
  const h = parseInt(hStr, 10);
  const meridiem = h >= 12 ? 'PM' : 'AM';
  const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${display}:${m} ${meridiem}`;
}

/** Calendar items carry a full ISO instant; all-day items have no time. */
function formatEventTime(item: CalendarEvent): string {
  if (item.allDay) return 'All day';
  const d = new Date(item.startDate);
  if (Number.isNaN(d.getTime())) return '';
  const hh = d.getHours();
  const mm = d.getMinutes().toString().padStart(2, '0');
  const meridiem = hh >= 12 ? 'PM' : 'AM';
  const display = hh === 0 ? 12 : hh > 12 ? hh - 12 : hh;
  return `${display}:${mm} ${meridiem}`;
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

/** Human label for a routine's cadence. */
function formatCadence(cadence: PlanHabit['cadence']): string {
  if (cadence === 'daily') return 'Daily';
  if (cadence === 'weekly') return 'Weekly';
  if (cadence && typeof cadence === 'object' && typeof cadence.everyNDays === 'number') {
    return `Every ${cadence.everyNDays} days`;
  }
  return '';
}

const TASK_ICON_CONFIG: Record<TaskType, { name: keyof typeof MaterialIcons.glyphMap; color: string; bg: string }> = {
  medication: { name: 'medication', color: '#8B5CF6', bg: 'rgba(139,92,246,0.12)' },
  exercise: { name: 'directions-walk', color: '#10B981', bg: 'rgba(16,185,129,0.12)' },
  appointment: { name: 'local-hospital', color: '#3B82F6', bg: 'rgba(59,130,246,0.12)' },
  reminder: { name: 'notifications', color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
};

const DONE_TEAL = '#008080';

// ─── Section shell ───────────────────────────────────────────────────

interface ScheduleSectionProps {
  title: string;
  /** Rendered next to the title, e.g. "3". Always shown, even at zero. */
  count: number;
  /** Shown instead of children when `count === 0` and not loading. */
  emptyLabel: string;
  /** Extra honest context under the empty line (permission off, error). */
  emptyHint?: string;
  isLoading?: boolean;
  /** Set when the underlying fetch failed — replaces the empty line. */
  errorLabel?: string;
  /** Optional trailing summary text in the header (e.g. "2 / 5 done"). */
  headerNote?: string;
  children?: React.ReactNode;
}

/**
 * One labelled group of the day view.
 *
 * Deliberately renders even at zero items: a section that disappears on
 * a quiet day is what made this screen read as "tasks only". An honest
 * "No appointments today" is more trustworthy than a missing heading.
 */
function ScheduleSection({
  title,
  count,
  emptyLabel,
  emptyHint,
  isLoading,
  errorLabel,
  headerNote,
  children,
}: ScheduleSectionProps): React.JSX.Element {
  const { getScaledFontSize, getScaledFontWeight, settings } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionHeaderLeft}>
          <Text
            style={[
              {
                fontSize: getScaledFontSize(18),
                fontWeight: getScaledFontWeight(700) as any,
                color: colors.text,
              },
            ]}>
            {title}
          </Text>
          {/* Count badge. Paired with the number as text (not a dot) so
              it is readable by screen readers and at large font sizes. */}
          <View style={[styles.countBadge, { backgroundColor: colors.primary + '18' }]}>
            <Text
              style={{
                fontSize: getScaledFontSize(12),
                fontWeight: getScaledFontWeight(700) as any,
                color: colors.primary,
              }}
              accessibilityLabel={`${count} ${title.toLowerCase()}`}>
              {count}
            </Text>
          </View>
        </View>
        {!!headerNote && (
          <Text
            style={{
              fontSize: getScaledFontSize(12),
              fontWeight: getScaledFontWeight(600) as any,
              color: DONE_TEAL,
            }}>
            {headerNote}
          </Text>
        )}
      </View>

      {errorLabel ? (
        <Text style={[styles.emptyLine, { fontSize: getScaledFontSize(14), color: '#B45309' }]}>
          {errorLabel}
        </Text>
      ) : isLoading && count === 0 ? (
        <Text style={[styles.emptyLine, { fontSize: getScaledFontSize(14), color: colors.text + '80' }]}>
          Loading…
        </Text>
      ) : count === 0 ? (
        <>
          <Text style={[styles.emptyLine, { fontSize: getScaledFontSize(14), color: colors.text + '80' }]}>
            {emptyLabel}
          </Text>
          {!!emptyHint && (
            <Text style={[styles.emptyHint, { fontSize: getScaledFontSize(12), color: colors.text + '70' }]}>
              {emptyHint}
            </Text>
          )}
        </>
      ) : (
        children
      )}
    </View>
  );
}

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
  const todayWindow = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }, []);

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
        .filter((e) => e.startDate.slice(0, 10) === today)
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
  const openCalendarDetail = (event: CalendarEvent) => {
    if (event.origin === 'app' && (event.appKind === 'appointment' || event.appKind === 'past-visit')) {
      const prefix = `app:${event.appKind}:`;
      const apptId = event.id.startsWith(prefix)
        ? event.id.slice(prefix.length)
        : event.id.startsWith('app:')
          ? event.id.slice(4)
          : event.id;
      router.push({ pathname: '/Home/appointment-detail', params: { id: apptId } } as never);
      return;
    }
    router.push({ pathname: '/calendar-event-detail', params: { eventId: event.id } } as never);
  };

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

  const handleTaskSkip = async (task: TaskOccurrence) => {
    setPlanTasks((prev) =>
      prev.map((t) =>
        t.id === task.id && t.scheduledFor === task.scheduledFor ? { ...t, status: 'skipped' } : t,
      ),
    );
    const result = await skipTask(task.id, task.scheduledFor);
    if (!result.ok) {
      setPlanTasks((prev) =>
        prev.map((t) =>
          t.id === task.id && t.scheduledFor === task.scheduledFor ? { ...t, status: 'pending' } : t,
        ),
      );
      const reason = result.code === 'NETWORK_ERROR'
        ? 'No internet connection. Try again when you’re back online.'
        : result.status === 401 || result.status === 403
          ? 'Your session expired. Please sign in again to skip tasks.'
          : (result.message ?? 'Could not save task skip.');
      Alert.alert("Couldn't skip task", reason);
      return;
    }
    // Skips also count as expected-not-done in completionRate — same
    // wellbeing invalidation as complete.
    invalidateWellbeingCaches(queryClient);
  };

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

  // ── Row renderers ─────────────────────────────────────────────────

  /**
   * Calendar-derived row (appointment or reminder).
   *
   * Two distinct tap targets so both existing capabilities survive:
   *   • the 44pt check circle toggles the local per-day done flag
   *   • the row body opens the item's detail screen
   */
  const renderCalendarRow = (item: CalendarEvent, kind: 'appointment' | 'reminder') => {
    const done = completedCalendarIds.has(item.id) || !!item.completed;
    const iconBg = kind === 'reminder' ? 'rgba(245,158,11,0.12)' : 'rgba(59,130,246,0.12)';
    const iconColor = kind === 'reminder' ? '#F59E0B' : '#3B82F6';
    const iconName: keyof typeof MaterialIcons.glyphMap = kind === 'reminder' ? 'notifications' : 'event';
    const subtitle = item.location || item.source?.title || '';

    return (
      <View
        key={`${kind}:${item.id}`}
        style={[
          styles.row,
          { backgroundColor: colors.background, borderColor: colors.text + '15', opacity: done ? 0.6 : 1 },
        ]}>
        <Pressable
          onPress={() => toggleCalendarItem(item)}
          style={styles.checkHit}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: done }}
          accessibilityLabel={done ? `Mark ${item.title} not done` : `Mark ${item.title} done`}>
          <View
            style={[
              styles.checkCircle,
              {
                borderColor: done ? DONE_TEAL : colors.text + '50',
                backgroundColor: done ? DONE_TEAL : 'transparent',
              },
            ]}>
            {done && <MaterialIcons name="check" size={14} color="#fff" />}
          </View>
        </Pressable>

        <Pressable
          onPress={() => openCalendarDetail(item)}
          style={styles.rowBodyHit}
          accessibilityRole="button"
          accessibilityLabel={`${item.title}, ${formatEventTime(item)}. Open details.`}>
          <View style={[styles.rowIcon, { backgroundColor: iconBg }]}>
            <MaterialIcons name={iconName} size={18} color={iconColor} />
          </View>
          <View style={styles.rowBody}>
            <Text
              style={{
                fontSize: getScaledFontSize(14),
                fontWeight: getScaledFontWeight(600) as any,
                color: colors.text,
                textDecorationLine: done ? 'line-through' : 'none',
              }}
              numberOfLines={2}>
              {item.title}
            </Text>
            {/* State is never colour-only: a done row also says "Done". */}
            <Text
              style={[styles.rowSub, { fontSize: getScaledFontSize(12), color: colors.text + '70' }]}
              numberOfLines={1}>
              {done ? (subtitle ? `Done · ${subtitle}` : 'Done') : subtitle}
            </Text>
          </View>
          <Text
            style={{
              fontSize: getScaledFontSize(12),
              color: colors.text + '80',
              fontWeight: getScaledFontWeight(600) as any,
            }}>
            {formatEventTime(item)}
          </Text>
        </Pressable>
      </View>
    );
  };

  /** Plan-task row — tap completes, long-press skips (unchanged). */
  const renderTaskRow = (task: TaskOccurrence) => {
    const icon = TASK_ICON_CONFIG[task.type];
    const done = task.status === 'completed';
    const skipped = task.status === 'skipped';
    // SCRUM-279 (build 45): if this task is metric-trackable, show a
    // small "Record" pill so the patient sees that tapping will ask
    // them for a value (not just check off).
    const spec = !done && !skipped ? detectMetricForTask(task) : null;
    const stateLabel = done ? 'Done' : skipped ? 'Skipped' : '';
    const subtitle = task.description || '';

    return (
      <Pressable
        key={`${task.id}#${task.scheduledFor}`}
        onPress={() => handleTaskComplete(task)}
        onLongPress={() => handleTaskSkip(task)}
        accessibilityRole="button"
        accessibilityLabel={
          `${task.title}, ${formatTaskTime(task.scheduledTime)}.` +
          (stateLabel ? ` ${stateLabel}.` : '') +
          (spec ? ' Tap to record a value.' : ' Tap to complete, long press to skip.')
        }
        style={[
          styles.row,
          {
            backgroundColor: colors.background,
            borderColor: colors.text + '15',
            opacity: done || skipped ? 0.6 : 1,
          },
        ]}>
        <View style={styles.checkHit}>
          <View
            style={[
              styles.checkCircle,
              {
                borderColor: done ? DONE_TEAL : colors.text + '50',
                backgroundColor: done ? DONE_TEAL : 'transparent',
              },
            ]}>
            {done && <MaterialIcons name="check" size={14} color="#fff" />}
            {skipped && <MaterialIcons name="close" size={14} color={colors.text + '70'} />}
          </View>
        </View>
        <View style={[styles.rowIcon, { backgroundColor: icon.bg }]}>
          <MaterialIcons name={icon.name} size={18} color={icon.color} />
        </View>
        <View style={styles.rowBody}>
          <Text
            style={{
              fontSize: getScaledFontSize(14),
              fontWeight: getScaledFontWeight(600) as any,
              color: colors.text,
              textDecorationLine: done ? 'line-through' : 'none',
            }}
            numberOfLines={2}>
            {task.title}
          </Text>
          {(!!stateLabel || !!subtitle) && (
            <Text
              style={[styles.rowSub, { fontSize: getScaledFontSize(12), color: colors.text + '70' }]}
              numberOfLines={1}>
              {stateLabel && subtitle ? `${stateLabel} · ${subtitle}` : stateLabel || subtitle}
            </Text>
          )}
        </View>
        {spec ? (
          <View
            style={[
              styles.recordPill,
              { backgroundColor: (colors.tint ?? DONE_TEAL) + '22', borderColor: (colors.tint ?? DONE_TEAL) + '55' },
            ]}>
            <Text
              style={{
                color: colors.tint ?? DONE_TEAL,
                fontSize: getScaledFontSize(10),
                fontWeight: getScaledFontWeight(700) as any,
                letterSpacing: 0.3,
              }}>
              RECORD
            </Text>
          </View>
        ) : null}
        <Text
          style={{
            fontSize: getScaledFontSize(12),
            color: colors.text + '80',
            fontWeight: getScaledFontWeight(600) as any,
          }}>
          {formatTaskTime(task.scheduledTime)}
        </Text>
      </Pressable>
    );
  };

  /**
   * Routine row — DISPLAY ONLY on this screen.
   *
   * Ken's spec: routines are shown here for awareness; editing lives on
   * the routines screen. Tapping navigates there rather than mutating
   * anything, so no CRUD surface leaks onto the day view.
   */
  const renderRoutineRow = (habit: PlanHabit) => {
    const cadence = formatCadence(habit.cadence);
    const target = habit.targetValue !== undefined
      ? `${habit.targetValue}${habit.unit ? ` ${habit.unit}` : ''}`
      : '';
    const subtitle = [cadence, target].filter(Boolean).join(' · ');

    return (
      <Pressable
        key={habit.habitId}
        onPress={() => router.push('/Home/habits' as never)}
        accessibilityRole="button"
        accessibilityLabel={`${habit.label}${subtitle ? `, ${subtitle}` : ''}. Open routines.`}
        style={[styles.row, { backgroundColor: colors.background, borderColor: colors.text + '15' }]}>
        <View style={[styles.rowIcon, { backgroundColor: 'rgba(122,111,240,0.12)' }]}>
          <MaterialIcons name="repeat" size={18} color="#7A6FF0" />
        </View>
        <View style={styles.rowBody}>
          <Text
            style={{
              fontSize: getScaledFontSize(14),
              fontWeight: getScaledFontWeight(600) as any,
              color: colors.text,
            }}
            numberOfLines={2}>
            {habit.label}
          </Text>
          {!!subtitle && (
            <Text
              style={[styles.rowSub, { fontSize: getScaledFontSize(12), color: colors.text + '70' }]}
              numberOfLines={1}>
              {subtitle}
            </Text>
          )}
        </View>
        <MaterialIcons name="chevron-right" size={20} color={colors.text + '60'} />
      </Pressable>
    );
  };

  const completedTaskCount = planTasks.filter((t) => t.status === 'completed').length;

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
                size={getScaledFontSize(80)}
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

        {/* ── 1. Appointments ─────────────────────────────────────── */}
        <ScheduleSection
          title="Appointments"
          count={appointmentItems.length}
          emptyLabel="No appointments today"
          emptyHint={
            calendarAccessDenied
              ? 'Calendar access is off, so events saved on this device are not shown. Turn it on in Settings.'
              : undefined
          }
          isLoading={isLoadingAppointments || isLoadingCalendar}
          errorLabel={
            appointmentsError && appointmentItems.length === 0
              ? "Couldn't load appointments. Pull down to try again."
              : undefined
          }>
          {appointmentItems.map((item) => renderCalendarRow(item, 'appointment'))}
        </ScheduleSection>

        {/* ── 2. Tasks ────────────────────────────────────────────── */}
        <ScheduleSection
          title="Tasks"
          count={planTasks.length}
          emptyLabel="No tasks today"
          isLoading={isLoadingTasks}
          errorLabel={tasksError ? "Couldn't load tasks. Pull down to try again." : undefined}
          headerNote={planTasks.length > 0 ? `${completedTaskCount} / ${planTasks.length} done` : undefined}>
          {planTasks.map(renderTaskRow)}
        </ScheduleSection>

        {/* ── 3. Routines (plan habits — label only; identifiers stay
               `habit*`, another workstream owns the rename) ───────── */}
        <ScheduleSection
          title="Routines"
          count={routines.length}
          emptyLabel={routinesEnabled ? 'No routines yet' : 'No routines today'}
          emptyHint={routinesEnabled ? 'Add routines from your plan to see them here.' : undefined}
          isLoading={isLoadingRoutines}
          errorLabel={routinesError ? "Couldn't load routines. Pull down to try again." : undefined}>
          {routines.map(renderRoutineRow)}
        </ScheduleSection>

        {/* ── 4. Reminders ────────────────────────────────────────── */}
        <ScheduleSection
          title="Reminders"
          count={reminderItems.length}
          emptyLabel="No reminders today"
          emptyHint={
            reminderAccessDenied
              ? 'Reminders access is off, so your Reminders list is not shown. Turn it on in Settings.'
              : undefined
          }
          isLoading={isLoadingCalendar}>
          {reminderItems.map((item) => renderCalendarRow(item, 'reminder'))}
        </ScheduleSection>

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
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: { flex: 1, flexShrink: 1, textAlign: 'center', marginHorizontal: 8 },

  profileCard: { margin: 16, padding: 20, borderRadius: 16 },
  profileContent: { flexDirection: 'row', alignItems: 'center' },
  profileInfo: { marginLeft: 16, flex: 1 },

  // Day groups
  section: { marginHorizontal: 16, marginBottom: 20 },
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

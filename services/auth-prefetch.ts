/**
 * Post-auth parallel prefetch (SCRUM-279, build 50).
 *
 * Ken: "when I open app initially there are no events or
 * appointments on home page but when I move to calendar screen and
 * fetch data and move to home screen then I have data. I want to
 * initiate parallel calls for calendar and home screen after sign in
 * or pin screen so we can have data quickly on all screens."
 *
 * Strategy: as soon as the user clears the auth gate (fresh sign-in
 * OR PIN unlock OR splash-gate cached profile route), kick off all
 * the hot-path data fetches in parallel and warm the react-query
 * cache. By the time the user navigates to Home / Calendar / Health
 * Plan, the data is either there or seconds away.
 *
 * Fire-and-forget by design. Failures are silent — the destination
 * screen still owns the error surface for its own data, this helper
 * just ensures the request started earlier.
 *
 * Guard: a 30-second cooldown so we don't pile on identical
 * requests when the user bounces between PIN and home rapidly.
 */

import { queryClient } from '@/providers/QueryProvider';
import { fetchTasksForDate } from '@/services/api/ai-health-plan';
import { fetchPatientInfo, fetchMedicationsSummary } from '@/services/api/patient';
import { listMyCalendarSnapshot, listServerCalendarEvents } from '@/services/api/calendar';
import { buildAndUploadSnapshot } from '@/services/calendar-sync';
import { listSelfReportedMetrics } from '@/services/api/self-reported-metrics';
import { apiClient } from '@/lib/api-client';

const COOLDOWN_MS = 30_000;
let lastRunAt = 0;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function calendarWindow(): { from: string; to: string } {
  const now = Date.now();
  const from = new Date(now - 30 * 24 * 60 * 60_000).toISOString().slice(0, 10);
  const to = new Date(now + 365 * 24 * 60 * 60_000).toISOString().slice(0, 10);
  return { from, to };
}

function snapshotWindow(): { from: string; to: string } {
  const now = Date.now();
  const from = new Date(now - 30 * 24 * 60 * 60_000).toISOString().slice(0, 10);
  const to = new Date(now + 1 * 24 * 60 * 60_000).toISOString().slice(0, 10);
  return { from, to };
}

export interface PrefetchOptions {
  /** Force the prefetch even if the cooldown hasn't elapsed.
   *  Set true on fresh sign-in (the user JUST authenticated, definitely
   *  warm the cache); leave false for PIN-unlock-on-already-active-session. */
  force?: boolean;
}

/**
 * Kick off the parallel post-auth prefetch. Returns immediately —
 * callers should NOT await. All fetches are independent; one failure
 * doesn't block the others.
 */
export function prefetchAfterAuth(opts: PrefetchOptions = {}): void {
  const now = Date.now();
  if (!opts.force && now - lastRunAt < COOLDOWN_MS) return;
  lastRunAt = now;

  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.log('[auth-prefetch] kicking off post-auth parallel fetches');
  }

  const calWin = calendarWindow();
  const snapWin = snapshotWindow();

  // Each prefetch is independent and best-effort. We use
  // queryClient.prefetchQuery where possible so the destination
  // screen's useQuery hook picks up the warm cache without re-fetching.
  void Promise.allSettled([
    // Home screen data
    queryClient.prefetchQuery({
      queryKey: ['patient-info'],
      queryFn: fetchPatientInfo,
      staleTime: 5 * 60_000,
    }),
    queryClient.prefetchQuery({
      queryKey: ['medications-summary'],
      queryFn: () => fetchMedicationsSummary(),
      staleTime: 5 * 60_000,
    }),
    queryClient.prefetchQuery({
      queryKey: ['plan-tasks', todayIso()],
      queryFn: () => fetchTasksForDate(todayIso()),
      staleTime: 2 * 60_000,
    }),
    // Health Trends progress card
    queryClient.prefetchQuery({
      queryKey: ['self-reported-metrics-progress'],
      queryFn: () => listSelfReportedMetrics({ limit: 500 }),
      staleTime: 5 * 60_000,
    }),
    // Appointments (FHIR)
    queryClient.prefetchQuery({
      queryKey: ['appointments', undefined],
      queryFn: async () => {
        const res = await apiClient.get('/v1/patients/me/appointments?');
        return res.data?.data?.appointments ?? [];
      },
      staleTime: 5 * 60_000,
    }),
    // Calendar — server events + cross-device snapshot. These don't
    // map to a useQuery hook (use-calendar.ts manages its own
    // useState), so we just trigger the network calls so the
    // backend response is cached by the OS/HTTP layer.
    listServerCalendarEvents(calWin).catch(() => undefined),
    listMyCalendarSnapshot(snapWin).catch(() => undefined),
    // Push a fresh snapshot of this device's calendar to backend so
    // sibling devices see it on their next pull. Best-effort.
    buildAndUploadSnapshot().catch(() => 0),
  ]);
}

/** Reset cooldown (used by tests or for explicit re-prime). */
export function resetPrefetchCooldown(): void {
  lastRunAt = 0;
}

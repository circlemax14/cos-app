/**
 * React Query hooks for notification categories (COS-373).
 *
 * One query (`['notification-categories']`) for the GET, one mutation for the
 * PUT. The mutation optimistically merges the partial into the cached prefs so
 * the toggle flips instantly, then invalidates so the server-recomputed map
 * re-confirms. Mirrors the use-plan-medications pattern.
 *
 * Flag-gating lives in the consuming component: it renders nothing unless
 * `NOTIFICATION_CATEGORIES_ENABLED`. The query is defensive (the service
 * returns a disabled, default-prefs result on any error), so it never breaks
 * the screen.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchNotificationCategories,
  updateNotificationCategories,
  type NotificationCategoriesResponse,
} from '@/services/api/notification-prefs';
import {
  defaultCategoryPrefs,
  type NotificationCategory,
} from '@/lib/notification-categories';
import { buildCategoryGateFromPrefs } from '@/services/notification-category-gate';
import { reconcilePlanTaskNotifications } from '@/services/plan-task-notifications';
import type { TaskOccurrence } from '@/services/api/types';
import { todayLocalIso } from '@/lib/day-key';
import { cancelAllVitalsScheduled } from '@/services/vitals-recheck-notifications';

const NOTIFICATION_CATEGORIES_KEY = ['notification-categories'] as const;

export function useNotificationCategories() {
  return useQuery<NotificationCategoriesResponse>({
    queryKey: NOTIFICATION_CATEGORIES_KEY,
    queryFn: fetchNotificationCategories,
    staleTime: 60_000,
  });
}

export function useUpdateNotificationCategories() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (partial: Partial<Record<NotificationCategory, boolean>>) =>
      updateNotificationCategories(partial),
    onMutate: async (partial) => {
      // Optimistic: merge the partial into the cached prefs so the toggle
      // reflects immediately. Cancel in-flight reads first so they don't
      // clobber the optimistic value.
      await qc.cancelQueries({ queryKey: NOTIFICATION_CATEGORIES_KEY });
      const previous = qc.getQueryData<NotificationCategoriesResponse>(
        NOTIFICATION_CATEGORIES_KEY,
      );
      qc.setQueryData<NotificationCategoriesResponse>(
        NOTIFICATION_CATEGORIES_KEY,
        (prev) => ({
          flagEnabled: prev?.flagEnabled ?? true,
          preferences: { ...(prev?.preferences ?? defaultCategoryPrefs()), ...partial },
        }),
      );
      return { previous };
    },
    onError: (_err, _partial, context) => {
      // Roll back to the pre-mutation snapshot on failure.
      if (context?.previous) {
        qc.setQueryData(NOTIFICATION_CATEGORIES_KEY, context.previous);
      }
    },
    onSuccess: (updated) => {
      // Seed with the server-recomputed map, then invalidate to re-confirm.
      qc.setQueryData(NOTIFICATION_CATEGORIES_KEY, updated);

      // SCRUM-525 FIX 1: cancel already-OS-scheduled notifications for any
      // category the user just toggled off, and re-schedule enabled ones.
      // We pull today's plan tasks from the React Query cache (they were
      // prefetched by auth-prefetch / today-schedule) and build the gate
      // directly from the server-confirmed prefs — no extra network call.
      // Fire-and-forget; failures are non-fatal.
      // 2026-08-12 — reconcile UNCONDITIONALLY, even with no cached tasks.
      //
      // This used to be guarded by `if (cached && cached.length > 0)`, which
      // made turning a category OFF depend on today's tasks happening to be in
      // the query cache. Open Reminders settings without having visited Today's
      // Schedule that session — or straight after an app restart — and the
      // cache is cold, the reconcile never runs, and every notification already
      // sitting in the OS queue keeps firing for up to the 7-day scheduling
      // horizon. Reported: "i disabled all reminders for my user but still i am
      // recieving task notifications."
      //
      // reconcilePlanTaskNotifications cancels every plan-task notification
      // BEFORE it schedules, so passing [] is precisely "cancel everything and
      // schedule nothing" — which is what turning a category off means.
      // Scheduling is driven by the gate regardless, so an empty list can never
      // over-schedule.
      const todayIso = todayLocalIso();
      const cached = qc.getQueryData<TaskOccurrence[]>(['plan-tasks', todayIso]);
      const gate = buildCategoryGateFromPrefs(updated.flagEnabled, updated.preferences);
      void reconcilePlanTaskNotifications(cached ?? [], gate).catch(() => { /* non-fatal */ });

      // 2026-08-14 — cancel the VITALS queue here too.
      //
      // The 2026-08-12 fix made vitals-recheck honour `healthAlerts`, but only
      // via use-vitals-red-flag-notifications, which sits behind two early
      // returns (`if (disabled) return; if (!trends?.length) return;`) and is
      // mounted on exactly one screen. So a patient who switched Health alerts
      // off kept receiving recheck pings for the full cooldown unless they
      // happened to open the Plan screen with non-empty HealthKit trends — and
      // never at all if Apple Health was off.
      //
      // Cancelling straight from the toggle is the same unconditional
      // treatment plan-task notifications already get above.
      if (updated.preferences.healthAlerts === false) {
        void cancelAllVitalsScheduled().catch(() => { /* non-fatal */ });
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: NOTIFICATION_CATEGORIES_KEY });
    },
  });
}

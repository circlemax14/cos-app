/**
 * SCRUM-659 Story 4 (2026-08-05) — client-side CRUD for plan-scoped habits.
 *
 * Reads: reuses `useAiHealthPlan()` from use-plan-tasks.ts — habits live
 * inside AiHealthPlan.habits (added in Story 2 backend). This module
 * exposes `usePlanHabits()` as a thin selector for ergonomics.
 *
 * Writes: POST / PATCH / DELETE against /v1/patients/me/plan/habits
 * (Story 4a backend). All mutations invalidate the ai-health-plan
 * query key so the banner + screen refresh in place.
 *
 * Flag gate: HABITS_IN_PLAN_ENABLED — mirrors the server-side flag.
 * When OFF, the banner + screen render as a no-op and mutations 404.
 */

import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'

import { apiClient } from '@/lib/api-client'
import { fetchAiHealthPlan } from '@/services/api/ai-health-plan'
import type { AiHealthPlan, PlanHabit } from '@/services/api/types'
import { useFeatureFlags } from './use-feature-flags'

const AI_HEALTH_PLAN_QUERY_KEY = ['ai-health-plan'] as const

const HABITS_ROUTE = '/v1/patients/me/plan/habits'

/**
 * Put the server's authoritative habits[] where every reader will see it.
 *
 * COS-1224 — all three write hooks did `(prev) => prev ? { ...prev, habits } : prev`,
 * which is a SILENT NO-OP when the plan cache holds null or undefined. And it
 * does: `fetchAiHealthPlan` swallows its own errors and resolves to `null`, so a
 * failed plan GET looks exactly like "no plan". The nutrition card derives its
 * whole "already added" answer from this cache, so a dropped write meant an
 * accepted suggestion offered "Add to my plan" again and a second tap minted a
 * duplicate.
 *
 * There is no honest way to synthesise an AiHealthPlan around these habits —
 * version / goals / tasks / generatedAt would all be invented, and other screens
 * read them — so when there is nothing to splice into, mark the query stale and
 * let the next read get the truth. The server's answer is never dropped: it is
 * either written or re-asked for.
 */
function writeHabits(qc: QueryClient, habits: PlanHabit[]): void {
  if (qc.getQueryData<AiHealthPlan | null>(AI_HEALTH_PLAN_QUERY_KEY)) {
    qc.setQueryData<AiHealthPlan | null>(AI_HEALTH_PLAN_QUERY_KEY, (prev) =>
      prev ? { ...prev, habits } : prev,
    )
    return
  }
  void qc.invalidateQueries({ queryKey: AI_HEALTH_PLAN_QUERY_KEY })
}

// ─── Flag ────────────────────────────────────────────────────────────

/**
 * SCRUM-659 — server-driven Habits-in-Plan flag. Mirrors the
 * back-end habits_in_plan_enabled flag, surfaced through
 * /v1/feature-flags (see cos-backend feature-flag.service.ts once the
 * flag is registered there; today the FE falls open OFF so nothing
 * ships to users before the backend flip).
 */
export function useHabitsInPlanFlag(): boolean {
  const { data } = useFeatureFlags()
  return data?.habits_in_plan_enabled === true
}

/**
 * SCRUM-666 — will a routine with a time actually produce a push?
 *
 * Separate from the flag above, and deliberately so: `habits_in_plan_enabled`
 * is already true in production, while reminder DISPATCH rolls out on its own
 * switch. Today's Schedule draws a bell on the rows that will remind, and a
 * bell shown while dispatch is dark would repeat the exact failure Ken
 * reported — a UI promising a notification nobody receives.
 *
 * Falls open OFF, so the bell appears only once the backend says it is real.
 */
export function useHabitRemindersFlag(): boolean {
  const { data } = useFeatureFlags()
  return data?.habit_reminders_enabled === true
}

// ─── Read selector ───────────────────────────────────────────────────

export function usePlanHabits(): {
  habits: PlanHabit[]
  isLoading: boolean
  isError: boolean
  /**
   * Is `habits` the ANSWER, or just an empty default? COS-1224.
   *
   * `data?.habits ?? []` cannot tell "no routines" from "the plan read did not
   * land" — and `fetchAiHealthPlan` catches its own errors and returns `null`,
   * so `isError` never fires to tell you either. Any caller that makes a CLAIM
   * about what is or is not on the plan has to check this first; a caller that
   * merely lists routines can keep using `habits` as before.
   *
   * True when the flag is off: there are no routines at all then, so `[]` is the
   * correct answer rather than a missing one.
   */
  known: boolean
} {
  const flag = useHabitsInPlanFlag()
  const { data, isLoading, isError } = useQuery({
    queryKey: AI_HEALTH_PLAN_QUERY_KEY,
    queryFn: fetchAiHealthPlan,
    staleTime: 60_000,
    enabled: flag,
  })
  return {
    habits: data?.habits ?? [],
    isLoading,
    isError,
    // `!= null` on purpose — undefined is "not fetched yet", null is "the fetch
    // resolved to nothing", and a swallowed error is indistinguishable from the
    // latter. Neither is a basis for telling the patient what they have.
    known: !flag || data != null,
  }
}

// ─── Mutations ───────────────────────────────────────────────────────

export interface UpsertHabitInput {
  habitId?: string
  label: string
  cadence: PlanHabit['cadence']
  /**
   * HH:MM 24h. Ken 2026-08-11: "we have to be able to place a time on each
   * routine so that it integrates into the schedule flow and is not
   * separate." Backend accepts it since #380; this is the client half.
   */
  scheduledTime?: string
  /**
   * Does it also push at that time? SCRUM-666 r2.
   *
   * A time places the routine on the schedule; this decides whether it buzzes.
   * Sent explicitly (never omitted) once the editor exposes the toggle, because
   * PATCH merges — omitting it would silently preserve the old value and make
   * the switch feel broken.
   */
  remindersEnabled?: boolean
  targetValue?: number
  unit?: string
  bpsDomain?: PlanHabit['bpsDomain']
  rationale?: string
}

// ─── Per-day completion (SCRUM-666 r2) ───────────────────────────────
//
// Vishal 2026-08-12: "user should be able to complete them similar to task but
// they won't impact any score."
//
// Deliberately its OWN query key, not folded into the plan. Routine ticks are
// per-day state that must never reach adherence, wellbeing or Daily Read; the
// backend keeps them on a separate row for the same reason. Keeping the client
// cache separate means no plan refetch can accidentally carry them into a
// scorer's input, and no completion write invalidates the plan.

const ROUTINE_COMPLETIONS_KEY = (date: string) => ['routine-completions', date] as const

/** habitIds ticked on `date`. Empty while loading, on error, or when flag-off. */
export function useRoutineCompletions(date: string): {
  completedIds: Set<string>
  isLoading: boolean
} {
  const flag = useHabitsInPlanFlag()
  const { data, isLoading } = useQuery({
    queryKey: ROUTINE_COMPLETIONS_KEY(date),
    queryFn: async (): Promise<string[]> => {
      const res = await apiClient.get<{ success: boolean; data: { habitIds: string[] } }>(
        `${HABITS_ROUTE}/completions?date=${encodeURIComponent(date)}`,
      )
      return res.data.data.habitIds ?? []
    },
    staleTime: 30_000,
    enabled: flag,
  })
  // Memoised on the array identity, not rebuilt per render. A fresh Set every
  // render would be a new reference, so any useMemo depending on it (the
  // timeline builder does) would recompute on every render and the
  // memoisation would be decorative.
  const completedIds = useMemo(() => new Set(data ?? []), [data])
  return { completedIds, isLoading }
}

/**
 * Tick / untick a routine for one day.
 *
 * Optimistic, and it must be: this fires from a tap on Today's Schedule, where
 * an unresponsive checkbox is the whole complaint. The cache is updated before
 * the request, rolled back on failure, and re-synced from the server's
 * authoritative list on success.
 *
 * Deliberately does NOT call invalidateWellbeingCaches — that is what task
 * completion does, and the requirement here is the opposite.
 */
export function useToggleRoutineCompletion(date: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      habitId,
      done,
    }: {
      habitId: string
      done: boolean
    }): Promise<string[]> => {
      const res = await apiClient.post<{ success: boolean; data: { habitIds: string[] } }>(
        `${HABITS_ROUTE}/${encodeURIComponent(habitId)}/complete`,
        { date, done },
      )
      return res.data.data.habitIds ?? []
    },
    onMutate: async ({ habitId, done }) => {
      await qc.cancelQueries({ queryKey: ROUTINE_COMPLETIONS_KEY(date) })
      const previous = qc.getQueryData<string[]>(ROUTINE_COMPLETIONS_KEY(date)) ?? []
      const next = done
        ? Array.from(new Set([...previous, habitId]))
        : previous.filter((id) => id !== habitId)
      qc.setQueryData<string[]>(ROUTINE_COMPLETIONS_KEY(date), next)
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      // Put the tick back where it was — a checkbox that stays ticked after a
      // failed write is a lie the patient acts on.
      if (ctx?.previous) qc.setQueryData<string[]>(ROUTINE_COMPLETIONS_KEY(date), ctx.previous)
    },
    onSuccess: (habitIds) => {
      qc.setQueryData<string[]>(ROUTINE_COMPLETIONS_KEY(date), habitIds)
    },
  })
}

export function useAddHabit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: UpsertHabitInput): Promise<PlanHabit[]> => {
      const res = await apiClient.post<{ success: boolean; data: { habits: PlanHabit[] } }>(
        HABITS_ROUTE,
        input,
      )
      return res.data.data.habits
    },
    onSuccess: (habits) => {
      // Optimistic-in-effect: the server returns the full habits[], so writeHabits
      // splices it into the cached plan — or re-asks when there is no cached plan
      // to splice into, rather than dropping it (COS-1224).
      writeHabits(qc, habits)
    },
  })
}

export function useUpdateHabit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      habitId,
      patch,
    }: {
      habitId: string
      patch: Partial<UpsertHabitInput>
    }): Promise<PlanHabit[]> => {
      const res = await apiClient.patch<{ success: boolean; data: { habits: PlanHabit[] } }>(
        `${HABITS_ROUTE}/${encodeURIComponent(habitId)}`,
        patch,
      )
      return res.data.data.habits
    },
    onSuccess: (habits) => {
      writeHabits(qc, habits)
    },
  })
}

export function useDeleteHabit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (habitId: string): Promise<PlanHabit[]> => {
      const res = await apiClient.delete<{ success: boolean; data: { habits: PlanHabit[] } }>(
        `${HABITS_ROUTE}/${encodeURIComponent(habitId)}`,
      )
      return res.data.data.habits
    },
    onSuccess: (habits) => {
      writeHabits(qc, habits)
    },
  })
}

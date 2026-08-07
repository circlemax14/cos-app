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

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiClient } from '@/lib/api-client'
import { fetchAiHealthPlan } from '@/services/api/ai-health-plan'
import type { AiHealthPlan, PlanHabit } from '@/services/api/types'
import { useFeatureFlags } from './use-feature-flags'

const AI_HEALTH_PLAN_QUERY_KEY = ['ai-health-plan'] as const

const HABITS_ROUTE = '/v1/patients/me/plan/habits'

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

// ─── Read selector ───────────────────────────────────────────────────

export function usePlanHabits(): {
  habits: PlanHabit[]
  isLoading: boolean
  isError: boolean
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
  }
}

// ─── Mutations ───────────────────────────────────────────────────────

export interface UpsertHabitInput {
  habitId?: string
  label: string
  cadence: PlanHabit['cadence']
  targetValue?: number
  unit?: string
  bpsDomain?: PlanHabit['bpsDomain']
  rationale?: string
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
      // Optimistic-in-effect: server returns the full habits[] so we
      // just splice it into the cached plan object.
      qc.setQueryData<AiHealthPlan | null>(AI_HEALTH_PLAN_QUERY_KEY, (prev) =>
        prev ? { ...prev, habits } : prev,
      )
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
      qc.setQueryData<AiHealthPlan | null>(AI_HEALTH_PLAN_QUERY_KEY, (prev) =>
        prev ? { ...prev, habits } : prev,
      )
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
      qc.setQueryData<AiHealthPlan | null>(AI_HEALTH_PLAN_QUERY_KEY, (prev) =>
        prev ? { ...prev, habits } : prev,
      )
    },
  })
}

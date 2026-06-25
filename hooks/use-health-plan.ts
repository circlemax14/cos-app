import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { updatePlanGoal, type GoalPatch } from '@/services/api/ai-health-plan'

export interface PlanGoal { id: string; title: string; description: string; status: 'active' | 'completed' | 'cancelled' }
export interface CareManagerPlan { goals: PlanGoal[]; notes: string; updatedAt: string; updatedBy: string }
export interface AiInsights { summary: string; recommendations: Array<{ category: string; text: string; priority: string }>; generatedAt: string; nextRefreshAvailableAt: string }
export interface HealthPlan { careManagerPlan: CareManagerPlan | null; aiInsights: AiInsights | null }

export function useHealthPlan() {
  return useQuery({
    queryKey: ['health-plan'],
    queryFn: async () => {
      const res = await apiClient.get('/v1/patients/me/health-plan')
      return res.data.data as HealthPlan
    },
    staleTime: 2 * 60 * 1000,
  })
}

export function useRefreshAiInsights() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const res = await apiClient.post('/v1/patients/me/health-plan/ai-refresh')
      return res.data.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['health-plan'] }),
  })
}

/**
 * React Query mutation that edits a measurable goal on the AI health plan (COS-377).
 * On success invalidates the ['ai-health-plan'] query key so any subscriber
 * (Task 10 UI once wired up) refetches the updated plan automatically.
 * Query key: ['ai-health-plan']
 */
export function useUpdatePlanGoal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ goalId, patch }: { goalId: string; patch: GoalPatch }) =>
      updatePlanGoal(goalId, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai-health-plan'] }),
  })
}

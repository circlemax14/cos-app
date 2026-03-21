import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'

export interface PlanGoal { id: string; title: string; description: string; status: 'active' | 'completed' | 'cancelled' }
export interface CareManagerPlan { goals: PlanGoal[]; notes: string; updatedAt: string; updatedBy: string }
export interface AiInsights { summary: string; recommendations: Array<{ category: string; text: string; priority: string }>; generatedAt: string; nextRefreshAvailableAt: string }
export interface HealthPlan { careManagerPlan: CareManagerPlan | null; aiInsights: AiInsights | null }

export function useHealthPlan() {
  return useQuery({
    queryKey: ['health-plan'],
    queryFn: async () => {
      const res = await apiClient.get('/patients/me/health-plan')
      return res.data.data as HealthPlan
    },
    staleTime: 2 * 60 * 1000,
  })
}

export function useRefreshAiInsights() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const res = await apiClient.post('/patients/me/health-plan/ai-refresh')
      return res.data.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['health-plan'] }),
  })
}

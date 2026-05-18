import { apiClient } from '@/lib/api-client'

export interface ProgressSummary {
  summary: string
  generatedAt: string
  fromCache: boolean
}

export async function fetchProgressSummary(refresh = false): Promise<ProgressSummary> {
  const path = refresh
    ? '/v1/patients/me/health-plan/progress-summary?refresh=1'
    : '/v1/patients/me/health-plan/progress-summary'
  const res = await apiClient.get<{ success: boolean; data: ProgressSummary }>(path)
  return res.data.data
}

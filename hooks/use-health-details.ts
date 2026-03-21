import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'

export interface HealthDetails { height?: string; weight?: string; bloodType?: string; usesCpap?: boolean; chronicConditions?: string[]; allergies?: string[]; notes?: string }

export function useHealthDetails() {
  return useQuery({
    queryKey: ['health-details'],
    queryFn: async () => {
      const res = await apiClient.get('/patients/me/health-details')
      return res.data.data as HealthDetails
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function useUpdateHealthDetails() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: Partial<HealthDetails>) => {
      const res = await apiClient.put('/patients/me/health-details', input)
      return res.data.data as HealthDetails
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['health-details'] }),
  })
}

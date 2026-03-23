import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'

export interface MedicalReport { id: string; title: string; category: string; status: string; date: string; performer: string; conclusion?: string; results?: Array<{ name: string; value: string; unit?: string }> }

export function useMedicalReports() {
  return useQuery({
    queryKey: ['reports'],
    queryFn: async () => {
      const res = await apiClient.get('/v1/patients/me/reports')
      return res.data.data.reports as MedicalReport[]
    },
    staleTime: 10 * 60 * 1000,
  })
}

export function useMedicalReport(id: string) {
  return useQuery({
    queryKey: ['reports', id],
    queryFn: async () => {
      const res = await apiClient.get(`/v1/patients/me/reports/${id}`)
      return res.data.data.report as MedicalReport
    },
    enabled: !!id,
    staleTime: 10 * 60 * 1000,
  })
}

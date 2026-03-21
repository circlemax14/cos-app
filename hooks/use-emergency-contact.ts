import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'

export interface EmergencyContact {
  id: string; name: string; relationship: string; phone: string; email?: string; source: 'ehr' | 'user'
}

export function useEmergencyContacts() {
  return useQuery({
    queryKey: ['emergency-contacts'],
    queryFn: async () => {
      const res = await apiClient.get('/patients/me/emergency-contacts')
      return res.data.data.contacts as EmergencyContact[]
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function useCreateEmergencyContact() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: Omit<EmergencyContact, 'id' | 'source'>) => {
      const res = await apiClient.post('/patients/me/emergency-contacts', input)
      return res.data.data.contact as EmergencyContact
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['emergency-contacts'] }),
  })
}

export function useUpdateEmergencyContact() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...input }: Partial<EmergencyContact> & { id: string }) => {
      const res = await apiClient.put(`/patients/me/emergency-contacts/${id}`, input)
      return res.data.data.contact as EmergencyContact
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['emergency-contacts'] }),
  })
}

export function useDeleteEmergencyContact() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/patients/me/emergency-contacts/${id}`)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['emergency-contacts'] }),
  })
}

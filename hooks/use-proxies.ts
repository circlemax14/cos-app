import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'

export type ProxyScope = 'view_appointments' | 'view_records' | 'view_medications' | 'view_labs' | 'manage_appointments' | 'view_care_plan'
export type ProxyStatus = 'pending' | 'active' | 'revoked'

export interface Proxy { id: string; email: string; name: string; status: ProxyStatus; scopes: ProxyScope[]; invitedAt: string; acceptedAt?: string }

export function useProxies() {
  return useQuery({
    queryKey: ['proxies'],
    queryFn: async () => {
      const res = await apiClient.get('/v1/patients/me/proxies')
      return res.data.data.proxies as Proxy[]
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function useCreateProxy() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { email: string; name: string; scopes: ProxyScope[] }) => {
      const res = await apiClient.post('/v1/patients/me/proxies', input)
      return res.data.data.proxy as Proxy
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['proxies'] }),
  })
}

export function useUpdateProxy() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, scopes }: { id: string; scopes: ProxyScope[] }) => {
      const res = await apiClient.put(`/v1/patients/me/proxies/${id}`, { scopes })
      return res.data.data.proxy as Proxy
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['proxies'] }),
  })
}

export function useRevokeProxy() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/v1/patients/me/proxies/${id}`)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['proxies'] }),
  })
}

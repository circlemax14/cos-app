import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'

export interface InboxMessage { id: string; type: 'system' | 'care_manager'; title: string; body: string; read: boolean; metadata?: Record<string, unknown>; createdAt: string }

export function useInbox(type?: 'system' | 'care_manager') {
  return useInfiniteQuery({
    queryKey: ['inbox', type],
    queryFn: async ({ pageParam }: { pageParam: string | undefined }) => {
      const params = new URLSearchParams({ limit: '20' })
      if (pageParam) params.set('cursor', pageParam)
      if (type) params.set('type', type)
      const res = await apiClient.get(`/patients/me/inbox?${params.toString()}`)
      return res.data.data as { messages: InboxMessage[]; nextCursor: string | null }
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    initialPageParam: undefined as string | undefined,
    staleTime: 0,
  })
}

export function useMarkMessageRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => apiClient.put(`/patients/me/inbox/${id}/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inbox'] }),
  })
}

export function useDismissMessage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => apiClient.delete(`/patients/me/inbox/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inbox'] }),
  })
}

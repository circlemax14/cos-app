import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'

export interface ChatMessage { id: string; channelId: string; role: 'user' | 'ai' | 'care_manager'; content: string; createdAt: string }

export function useChatHistory(type: 'ai' | 'care_manager' = 'ai') {
  return useQuery({
    queryKey: ['chat-history', type],
    queryFn: async () => {
      const res = await apiClient.get(`/v1/patients/me/chat/history?type=${type}`)
      return res.data.data.messages as ChatMessage[]
    },
    staleTime: 0,
  })
}

export function useGetChatToken() {
  return useMutation({
    mutationFn: async (type: 'ai' | 'care_manager' = 'ai') => {
      const res = await apiClient.post(`/v1/patients/me/chat/token?type=${type}`)
      return res.data.data as { token: string; channelId: string; expiresAt: string }
    },
  })
}

export function useSendAiMessage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { message: string; context?: string }) => {
      const res = await apiClient.post('/v1/patients/me/chat/ai', input)
      return res.data.data.message as ChatMessage
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['chat-history', 'ai'] }),
  })
}

export function useEscalateToManager() {
  return useMutation({
    mutationFn: async () => {
      const res = await apiClient.post('/v1/patients/me/chat/escalate')
      return res.data.data as { token: string; channelId: string }
    },
  })
}

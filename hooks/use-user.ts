import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export interface UserProfile {
  sub: string;
  email: string;
  role: string;
  allowedServices: string[];
  termsAccepted: boolean;
  fastenConnected: boolean;
  dataReady: boolean;
}

export function useUser() {
  return useQuery<UserProfile>({
    queryKey: ['user', 'me'],
    queryFn: async () => {
      const res = await apiClient.get<{ success: boolean; data: UserProfile }>('/v1/auth/me');
      return res.data.data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: (failureCount, error) => {
      // Don't retry on 401/403
      const status = (error as { response?: { status: number } })?.response?.status;
      if (status === 401 || status === 403) return false;
      return failureCount < 2;
    },
  });
}

export function useHasService(service: string): boolean {
  const { data } = useUser();
  return data?.allowedServices?.includes(service) ?? false;
}

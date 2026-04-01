import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { createSupportTicket, getSupportTickets, SupportTicketRequest } from '@/services/api/support';

export function useSupportTickets() {
  return useQuery({
    queryKey: ['support-tickets'],
    queryFn: getSupportTickets,
  });
}

export function useCreateSupportTicket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<SupportTicketRequest, 'deviceInfo'>) => {
      const deviceInfo = {
        platform: Platform.OS,
        osVersion: Platform.Version.toString(),
        appVersion: Constants.expoConfig?.version ?? '1.0.0',
        deviceModel: `${Platform.OS === 'ios' ? 'iPhone' : 'Android Device'}`,
      };
      return createSupportTicket({ ...data, deviceInfo });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['support-tickets'] });
    },
  });
}

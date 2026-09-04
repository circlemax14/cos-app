import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import {
  createSupportTicket,
  getSupportTickets,
  uploadSupportAttachment,
  PickedFile,
  SupportRoutedTo,
} from '@/services/api/support';

export function useSupportTickets() {
  return useQuery({
    queryKey: ['support-tickets'],
    queryFn: getSupportTickets,
  });
}

export interface CreateSupportTicketInput {
  subject: string;
  description: string;
  routedTo?: SupportRoutedTo;
  /** Staged files. Uploaded here, so `isPending` covers the whole submit. */
  files?: PickedFile[];
}

export function useCreateSupportTicket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateSupportTicketInput) => {
      const deviceInfo = {
        platform: Platform.OS,
        osVersion: Platform.Version.toString(),
        appVersion: Constants.expoConfig?.version ?? '1.0.0',
        deviceModel: `${Platform.OS === 'ios' ? 'iPhone' : 'Android Device'}`,
      };

      // Upload first: a ticket that claims attachments it doesn't have is
      // worse than a failed submit the patient can retry. If any upload
      // rejects, no ticket is created and the screen says so.
      const files = input.files ?? [];
      const attachments = files.length
        ? await Promise.all(files.map(uploadSupportAttachment))
        : undefined;

      return createSupportTicket({
        subject: input.subject,
        description: input.description,
        routedTo: input.routedTo,
        attachments,
        deviceInfo,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['support-tickets'] });
    },
  });
}

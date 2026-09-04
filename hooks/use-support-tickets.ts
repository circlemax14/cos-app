import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import {
  createSupportTicket,
  getSupportTicket,
  getSupportTickets,
  replyToSupportTicket,
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

/**
 * COS-882 — one ticket and its thread, for app/Home/support-ticket-detail.tsx.
 *
 * Separate query key from the list: the list row carries no guarantee of a
 * `messages` array, and reading the thread out of the list cache would show an
 * empty thread on any ticket the patient opens before the list refetches.
 */
export function useSupportTicket(ticketId: string) {
  return useQuery({
    queryKey: ['support-ticket', ticketId],
    queryFn: () => getSupportTicket(ticketId),
    enabled: ticketId !== '',
  });
}

/**
 * Post a patient reply. The route returns the FULL updated ticket, so the
 * detail cache is seeded from the response — no refetch, and the new message
 * is on screen the moment the request settles.
 *
 * The list is invalidated too: a reply bumps `updatedAt`, and staff may have
 * moved the status since the list was last fetched.
 */
export function useReplyToSupportTicket(ticketId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (text: string) => replyToSupportTicket(ticketId, text),
    onSuccess: (ticket) => {
      queryClient.setQueryData(['support-ticket', ticketId], ticket);
      queryClient.invalidateQueries({ queryKey: ['support-tickets'] });
    },
  });
}

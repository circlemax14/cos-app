import { apiClient } from '@/lib/api-client';

export interface SupportTicketRequest {
  subject: string;
  description: string;
  deviceInfo: {
    platform: string;
    osVersion: string;
    appVersion: string;
    deviceModel: string;
  };
}

export interface SupportTicket {
  ticketId: string;
  subject: string;
  description: string;
  status: 'open' | 'in-progress' | 'resolved' | 'closed';
  createdAt: string;
  updatedAt: string;
}

/*
 * COS-872 — UNWRAP TWICE.
 *
 * The API wraps every payload as `{ success, data }` (utils/response.ts
 * sendSuccess). axios then wraps THAT as `response.data`. So the payload is
 * `response.data.data`, which is what every other service in this app reads —
 * see hooks/use-health-summary.ts.
 *
 * This file unwrapped once. Two visible consequences, both reported by Vishal:
 *
 *   create → returned `{ success, data: { ticketId } }`, so `result.ticketId`
 *            was undefined and the confirmation read
 *            "Your ticket ID is undefined."
 *   list   → returned an OBJECT `{ success, data: { tickets: [...] } }` where
 *            the screen expects an array, so "Your requests" was always empty
 *            even though the tickets existed.
 */
export async function createSupportTicket(data: SupportTicketRequest): Promise<SupportTicket> {
  const response = await apiClient.post<{ success: boolean; data: SupportTicket }>(
    '/v1/support/tickets',
    data,
  );
  return response.data.data;
}

export async function getSupportTickets(): Promise<SupportTicket[]> {
  const response = await apiClient.get<{ success: boolean; data: { tickets: SupportTicket[] } }>(
    '/v1/support/tickets',
  );
  // The route sends `{ tickets: items }`; the screen wants the array itself.
  return response.data.data.tickets ?? [];
}

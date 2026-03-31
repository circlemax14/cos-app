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

export async function createSupportTicket(data: SupportTicketRequest): Promise<SupportTicket> {
  const response = await apiClient.post('/v1/support/tickets', data);
  return response.data;
}

export async function getSupportTickets(): Promise<SupportTicket[]> {
  const response = await apiClient.get('/v1/support/tickets');
  return response.data;
}

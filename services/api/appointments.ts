import { apiClient } from '@/lib/api-client';
import type { Appointment } from './types';

interface FetchOptions {
  status?: string;
  from?: string;
  to?: string;
  type?: string;
}

export async function fetchAppointments(options?: FetchOptions): Promise<Appointment[]> {
  const params = new URLSearchParams();
  if (options?.status) params.set('status', options.status);
  if (options?.from) params.set('from', options.from);
  if (options?.to) params.set('to', options.to);
  if (options?.type) params.set('type', options.type);
  const query = params.toString();
  const url = `/v1/patients/me/appointments${query ? `?${query}` : ''}`;
  const res = await apiClient.get<{ success: boolean; data: { appointments: Appointment[] } }>(url);
  return res.data.data.appointments;
}

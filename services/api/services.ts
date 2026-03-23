import { apiClient } from '@/lib/api-client';
import type { ServiceDefinition } from './types';

export async function fetchAvailableServices(): Promise<ServiceDefinition[]> {
  const res = await apiClient.get<{ success: boolean; data: { services: ServiceDefinition[] } }>('/v1/services');
  return res.data.data.services;
}

import { apiClient } from '@/lib/api-client';
import type { HealthPlan } from './types';

export async function fetchHealthPlan(): Promise<HealthPlan> {
  const res = await apiClient.get<{ success: boolean; data: { plan: HealthPlan } }>('/v1/patients/me/health-plan');
  return res.data.data.plan;
}

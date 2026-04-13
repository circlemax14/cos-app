import { apiClient } from '../../lib/api-client';
import type { LongitudinalTrend, TrendExplanation } from './types';

export async function fetchTrends(
  category?: 'lab' | 'vital' | 'score',
): Promise<LongitudinalTrend[]> {
  const params = new URLSearchParams();
  if (category) params.set('category', category);
  const query = params.toString();
  const url = `/v1/patients/me/trends${query ? `?${query}` : ''}`;
  const res = await apiClient.get(url);
  return res.data?.data?.trends || [];
}

export async function fetchTrend(metricCode: string): Promise<LongitudinalTrend> {
  const res = await apiClient.get(`/v1/patients/me/trends/${metricCode}`);
  return res.data?.data;
}

export async function fetchTrendExplanation(metricCode: string): Promise<TrendExplanation> {
  const res = await apiClient.get(`/v1/patients/me/trends/${metricCode}/explain`);
  return res.data?.data;
}

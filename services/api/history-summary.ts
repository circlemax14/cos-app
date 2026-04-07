import { apiClient } from '@/lib/api-client';

export interface HistorySummary {
  medical: string;
  psychiatric: string;
  psychological: string;
  social: string;
  generatedAt: string;
}

export async function fetchHistorySummary(): Promise<HistorySummary> {
  const response = await apiClient.post<{ success: boolean; data: HistorySummary }>(
    '/v1/patients/me/history-summary',
    {},
    { timeout: 90000 }, // 90s — AI summary generation can take time
  );
  return response.data.data;
}

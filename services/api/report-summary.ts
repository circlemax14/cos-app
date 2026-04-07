import { apiClient } from '@/lib/api-client';

export interface ReportSummaryRequest {
  title: string;
  date: string;
  provider?: string;
  exam?: string;
  clinicalHistory?: string;
  technique?: string;
  findings?: string;
  impression?: string;
  interpretedBy?: string;
}

export interface ReportSummary {
  summary: string;
  generatedAt: string;
}

export async function fetchReportSummary(reportData: ReportSummaryRequest): Promise<ReportSummary> {
  const response = await apiClient.post<{ success: boolean; data: ReportSummary }>(
    '/v1/patients/me/reports/summary',
    reportData,
    { timeout: 60000 }, // 60s — AI summary generation can take time
  );
  return response.data.data;
}

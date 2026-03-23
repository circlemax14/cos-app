import { apiClient } from '@/lib/api-client';
import type { Report } from './types';

interface BackendReport {
  id: string;
  title: string;
  category: string;
  status: string;
  date: string;
  performer: string;
  conclusion?: string;
  results?: Array<{ name: string; value: string; unit?: string }>;
}

function mapToReport(r: BackendReport): Report {
  const statusMap: Record<string, Report['status']> = {
    final: 'Available',
    preliminary: 'Pending',
    registered: 'Pending',
    amended: 'Available',
    corrected: 'Available',
    cancelled: 'Completed',
  };
  return {
    id: r.id,
    title: r.title,
    category: r.category,
    provider: r.performer,
    date: r.date,
    status: statusMap[r.status] ?? 'Available',
    impression: r.conclusion,
    description: r.results?.map((res) => `${res.name}: ${res.value}${res.unit ? ` ${res.unit}` : ''}`).join('\n'),
  };
}

export async function fetchReports(): Promise<Report[]> {
  const res = await apiClient.get<{ success: boolean; data: { reports: BackendReport[] } }>('/v1/patients/me/reports');
  return res.data.data.reports.map(mapToReport);
}

export async function fetchReportById(id: string): Promise<Report | null> {
  const res = await apiClient.get<{ success: boolean; data: { report: BackendReport } }>(`/v1/patients/me/reports/${id}`);
  return res.data.data.report ? mapToReport(res.data.data.report) : null;
}

import { apiClient } from '@/lib/api-client';
import type { Report } from './types';

interface BackendReport {
  id: string;
  title: string;
  category: string;
  status: string;
  date: string;
  performer: string;
  performingFacility?: string;
  interpretedBy?: string;
  accessionNumber?: string;
  orderNumber?: string;
  conclusion?: string;
  results?: Array<{ name: string; value: string; unit?: string; referenceRange?: string }>;
  // Detail-only narrative sections (only populated by GET /reports/:id)
  exam?: string;
  clinicalHistory?: string;
  technique?: string;
  findings?: string;
  impression?: string;
  rawNarrative?: string;
  aiSummary?: string;
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
  // Description is the structured-results join — used as a fallback in
  // the list / card view when the rich narrative isn't loaded yet.
  const description = r.results
    ?.map((res) => `${res.name}: ${res.value}${res.unit ? ` ${res.unit}` : ''}`)
    .filter((line) => line.trim() !== ':')
    .join('\n');
  return {
    id: r.id,
    title: r.title,
    category: r.category,
    provider: r.performer,
    date: r.date,
    status: statusMap[r.status] ?? 'Available',
    description: description || r.rawNarrative,
    exam: r.exam,
    clinicalHistory: r.clinicalHistory,
    technique: r.technique,
    findings: r.findings,
    impression: r.impression ?? r.conclusion,
    interpretedBy: r.interpretedBy,
    accessionNumber: r.accessionNumber,
    orderNumber: r.orderNumber,
    performingFacility: r.performingFacility
      ? {
          name: r.performingFacility,
          address: '',
          city: '',
          state: '',
          zip: '',
        }
      : undefined,
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

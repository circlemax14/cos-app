import { apiClient } from '@/lib/api-client';
import type { Report, ReportResultEntry, ReportPresentedForm } from './types';

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
  results?: ReportResultEntry[];
  abnormalCount?: number;
  encounterRef?: string;
  encounterDisplay?: string;
  encounterDate?: string;
  presentedForms?: ReportPresentedForm[];
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
  // Card description: flatten structured results into a quick preview when
  // available, otherwise fall back to the narrative. Card rendering doesn't
  // use the description anymore once results[] is present, but kept for
  // Reports without structured results (Imaging, Procedures, etc.).
  const description = r.results && r.results.length > 0
    ? r.results
        .map((res) => `${res.name}: ${res.value}${res.unit ? ` ${res.unit}` : ''}`)
        .filter((line) => line.trim() !== ':')
        .join('\n')
    : r.rawNarrative;
  return {
    id: r.id,
    title: r.title,
    category: r.category,
    provider: r.performer,
    date: r.date,
    status: statusMap[r.status] ?? 'Available',
    description,
    results: r.results,
    abnormalCount: r.abnormalCount,
    encounterRef: r.encounterRef,
    encounterDisplay: r.encounterDisplay,
    encounterDate: r.encounterDate,
    presentedForms: r.presentedForms,
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

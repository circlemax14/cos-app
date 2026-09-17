import { apiClient } from '@/lib/api-client';

/**
 * COS-1023 — the shape the server has preferred all along.
 *
 * report-summary.routes.ts validates a UNION: `{ reportId }` (preferred — the
 * server fetches the full report and summarises the real narrative) OR the
 * legacy payload below, kept "for callers that pre-fetch (admin tools,
 * scripts)".
 *
 * The app sent the legacy form while holding a LIST row, where every clinical
 * field is undefined, so the summary was produced from a title, a date and a
 * provider name. Mirroring the union here is what makes the preferred form
 * expressible.
 */
export interface ReportSummaryByIdRequest {
  reportId: string;
}

export type ReportSummaryRequest = ReportSummaryByIdRequest | ReportSummaryLegacyRequest;

/** Legacy pre-fetched payload. Prefer {@link ReportSummaryByIdRequest}. */
export interface ReportSummaryLegacyRequest {
  title: string;
  date: string;
  provider?: string;
  exam?: string;
  clinicalHistory?: string;
  technique?: string;
  findings?: string;
  impression?: string;
  interpretedBy?: string;
  /** Performing organization — lab/imaging center name (e.g. "LabCorp"). */
  performingFacility?: string;
  /** Filler identifier — lab/imaging center's internal study ID. */
  accessionNumber?: string;
  /** Placer identifier — ordering provider's order number. */
  orderNumber?: string;
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

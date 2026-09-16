import { apiClient } from '@/lib/api-client';

/**
 * COS-1024 — the fast, AI-free half of the History tab.
 *
 * `GET /v1/patients/me/history-overview` has been live and registered since it
 * was written, and cos-backend's own service comment says exactly why it
 * exists:
 *
 *   "The web and mobile apps both show a history screen where a 30–90-second
 *    AI summary is the only content. That means users stare at a blank screen
 *    until the LLM call finishes. This endpoint gives the UI something to
 *    render immediately: record counts and top-N recent items across the same
 *    categories the AI summary covers."
 *
 * cos-app never had a client for it. The History tab therefore did the thing
 * the endpoint was built to prevent: a full-screen blocking overlay for up to
 * 90 seconds, whose payoff is a single undifferentiated paragraph.
 *
 * ~1–2s on HealthLake, parallel FHIR queries, no LLM.
 */

export interface HistoryOverviewCounts {
  conditions: number;
  medications: number;
  encounters: number;
  diagnosticReports: number;
  observations: number;
}

export interface OverviewCondition {
  name: string;
  status: string;
  category: string;
  onsetDate?: string;
}

export interface OverviewMedication {
  name: string;
  status: string;
  dosage: string;
  reason?: string;
  authoredOn?: string;
}

export interface OverviewEncounter {
  type: string;
  date?: string;
  status: string;
  reason?: string;
  providerName?: string;
}

export interface OverviewDiagnosticReport {
  type: string;
  date?: string;
  [key: string]: unknown;
}

export interface OverviewObservation {
  [key: string]: unknown;
}

export interface HistoryOverview {
  counts: HistoryOverviewCounts;
  recentConditions: OverviewCondition[];
  activeMedications: OverviewMedication[];
  recentEncounters: OverviewEncounter[];
  recentDiagnosticReports: OverviewDiagnosticReport[];
  recentObservations: OverviewObservation[];
  generatedAt: string;
}

/**
 * Fetch the overview.
 *
 * Returns null rather than throwing. This is advisory content shown WHILE the
 * real summary loads — a failure here must never take down the tab or replace
 * the AI summary's own error handling. Same reasoning the plan shelf uses: a
 * failed READ of an advisory list may degrade; a failed WRITE never may.
 */
export async function fetchHistoryOverview(): Promise<HistoryOverview | null> {
  try {
    const res = await apiClient.get<{ success: boolean; data: HistoryOverview }>(
      '/v1/patients/me/history-overview',
      { timeout: 15000 },
    );
    return res.data?.data ?? null;
  } catch {
    return null;
  }
}

/**
 * COS-1072 — the "things we track" numbers, from one place.
 *
 * Home and the Health Trends screen both draw `TrendSourceBar`, and both must
 * put the SAME number under it. They did not: Home said 11 and the screen said
 * 106, because Home passed `{ clinic: 0, checkins: 0, devices: raw }` while the
 * screen deduped three real buckets.
 *
 * ─── THIS ADDS NO NETWORK CALLS TO THE TRENDS SCREEN ─────────────────
 *
 * Every query below uses the SAME query key the Health Trends screen already
 * uses — `useTrends`, `useReportTrends`, `useHealthKitTrends` and the
 * `['assessments-trends']` key `SelfAssessmentTrends` reads. React Query serves
 * both screens from one fetch, so putting this on Home costs Home its first
 * fetch and then costs the trends screen nothing when the patient navigates in.
 *
 * ─── AND WHAT IT DOES COST HOME ──────────────────────────────────────
 *
 * Three requests Home did not make before. That is a real cost on the most
 * loaded screen in the app, and it is the reason the zeroes were there.
 *
 * It is worth paying, because the alternative is a number that is wrong. Home's
 * hard-coded `clinic: 0` carried a comment saying the bucket "is empty on every
 * stage today" — true when written, false now that patients have labs, and a
 * literal zero never notices. Showing a confidently wrong 11 beside a screen
 * that says 106 is worse than one extra request.
 *
 * `enabled` is not used to defer them: a count that arrives after the card has
 * drawn would make the number visibly change under the patient, which is the
 * same flash PlanBootGate exists to prevent. The card renders nothing until it
 * has an answer.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { useTrends } from '@/hooks/use-trends';
import { useHealthKitTrends } from '@/hooks/use-healthkit-trends';
import { useReportTrends } from '@/hooks/use-report-trends';
import { fetchAssessments } from '@/services/api/assessments';
import { buildTrendSources, type TrendSource } from '@/lib/trend-sources';
import { computeTrendSourceCounts, type TrendLike } from '@/lib/trend-source-counts';

export interface TrendSourcesResult {
  /** Non-empty segments, ready for TrendSourceBar. */
  sources: TrendSource[];
  /** True while any contributing query is still in flight. */
  isLoading: boolean;
}

export function useTrendSourceCounts(): TrendSourcesResult {
  const { data: backend, isLoading: loadingBackend } = useTrends();
  const { data: reports, isLoading: loadingReports } = useReportTrends();
  const { data: healthKit } = useHealthKitTrends();

  // Same key SelfAssessmentTrends uses, so this is a cache hit there.
  const { data: assessments, isLoading: loadingAssessments } = useQuery({
    queryKey: ['assessments-trends'],
    queryFn: fetchAssessments,
    staleTime: 60 * 1000,
  });

  const sources = useMemo(
    () =>
      buildTrendSources(
        computeTrendSourceCounts({
          backend: (backend ?? []) as TrendLike[],
          reports: (reports ?? []) as TrendLike[],
          healthKit: (healthKit ?? []) as TrendLike[],
          assessments: (assessments ?? []) as { instrumentId: string }[],
        }),
      ),
    [backend, reports, healthKit, assessments],
  );

  return {
    sources,
    /*
     * HealthKit is deliberately excluded from the loading signal. It resolves
     * from a local cache and is `disabled` entirely on Android and wherever
     * permission was refused, so waiting on it would hold the card forever on
     * exactly the devices that can never satisfy it.
     */
    isLoading: loadingBackend || loadingReports || loadingAssessments,
  };
}

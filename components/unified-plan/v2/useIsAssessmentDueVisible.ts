/**
 * useIsAssessmentDueVisible — CHUNK 36 fix (adversarial-verify blocker).
 *
 * Shared boolean signal for whether v2's AssessmentDueBanner would
 * currently render. PlanScreenV2 uses this to suppress CachedPlanBanner
 * when the due banner is showing (both are amber and would stack
 * otherwise — the exact regression chunks 34/35 established the
 * mutual-exclusion pattern to prevent).
 *
 * Implementation notes:
 * - Wraps the same useQuery(['assessments']) shape AssessmentDueBanner
 *   uses. react-query dedupes by key so no extra network cost — this
 *   is the second observer of the same query, staleTime aligned to
 *   60_000.
 * - Feature-flag-gated at module scope. When ASSESSMENT_DUE_BANNER_ENABLED
 *   is false (day 1), the query is never enabled and this hook returns
 *   false unconditionally — CachedPlanBanner behaves exactly as it did
 *   pre-chunk-36.
 * - Hooks called unconditionally so hook order stays stable across a
 *   runtime flag flip.
 */

import { useQuery } from '@tanstack/react-query';

import {
  ASSESSMENT_DUE_BANNER_ENABLED,
  dueAssessments,
} from '@/components/health-plan/AssessmentDueBanner';
import { fetchAssessments } from '@/services/api/assessments';

export function useIsAssessmentDueVisible(): boolean {
  const q = useQuery({
    queryKey: ['assessments'],
    queryFn: fetchAssessments,
    staleTime: 60_000,
    enabled: ASSESSMENT_DUE_BANNER_ENABLED,
  });

  if (!ASSESSMENT_DUE_BANNER_ENABLED) return false;
  const dueList = dueAssessments(q.data ?? []);
  return dueList.length > 0;
}

/**
 * COS-360 / SCRUM-577 — display label for a PlanType.
 *
 * When ASSESSMENT_STRATEGY_V2_ENABLED is on, we render 'agency-supported'
 * as "Family Support" (Ken's v2 label). When off, the legacy "Agency
 * Support" label ships. All other tiers unchanged.
 *
 * Usage:
 *   const displayName = usePlanTypeDisplayName();
 *   // ...
 *   <Text>{displayName(planType)}</Text>
 */

import { displayNameForPlanType, type PlanType } from '@/services/api/plan-type';
import { useAssessmentStrategyV2Flag } from './use-assessment-strategy-v2-flag';

export function usePlanTypeDisplayName(): (type: PlanType) => string {
  const v2 = useAssessmentStrategyV2Flag();
  return (type: PlanType) =>
    displayNameForPlanType(type, { assessmentStrategyV2Enabled: v2 });
}

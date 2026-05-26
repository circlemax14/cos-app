import { useQuery } from '@tanstack/react-query'
import { fetchPlanType, type PlanType } from '@/services/api/plan-type'

export const PLAN_TYPE_QUERY_KEY = ['plan-type'] as const

const TIER_RANK: Record<PlanType, number> = {
  basic: 0,
  advanced: 1,
  'agency-supported': 2,
  'agency-managed': 3,
}

export function meetsTier(actual: PlanType | undefined, required: PlanType): boolean {
  if (!actual) return false
  return TIER_RANK[actual] >= TIER_RANK[required]
}

/**
 * Plan type for the current user. Cached for 5 minutes — the Plan tab
 * already uses the same query key so a single fetch hydrates everything.
 *
 * Returns `undefined` while loading. Callers that need to gate UI should
 * check `isLoading` separately to avoid flashing "basic" before the
 * server responds.
 */
export function usePlanType() {
  const query = useQuery({
    queryKey: PLAN_TYPE_QUERY_KEY,
    queryFn: fetchPlanType,
    staleTime: 5 * 60 * 1000,
  })
  return {
    planType: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
  }
}

/**
 * Feature-disabled helpers for the unified BPS plan (COS-467).
 *
 * The backend gates `GET /v1/plan` behind `PLAN_BPS_UNIFIED_ENABLED`.
 * When OFF the endpoint responds `404` with body `{ code:
 * 'FEATURE_DISABLED' }`. Both the client-side sentinel narrowing and
 * the raw-error predicate live here as pure functions so the hook's
 * retry gate and `node --test` unit tests can reach them without
 * importing axios / RN.
 */

/** Shape of the sentinel the fetch client returns instead of throwing. */
export interface UnifiedPlanFeatureDisabledSentinel {
  __featureDisabled: true;
}

/** Type guard for the sentinel. */
export function isFeatureDisabled<T>(
  r: T | UnifiedPlanFeatureDisabledSentinel | null | undefined,
): r is UnifiedPlanFeatureDisabledSentinel {
  return !!r && (r as UnifiedPlanFeatureDisabledSentinel).__featureDisabled === true;
}

/** True when the raw axios-shaped error carries a 404 FEATURE_DISABLED body. */
export function isFeatureDisabledError(err: unknown): boolean {
  const e = err as
    | { response?: { status?: number; data?: { code?: string } } }
    | undefined;
  return e?.response?.status === 404 && e?.response?.data?.code === 'FEATURE_DISABLED';
}

/**
 * Unified BPS plan client (COS-467 / SCRUM Phase 2).
 *
 * Mirrors the Phase 1 backend contract exposed by `GET /v1/plan`:
 * one JSON envelope with three BPS sections (biological / psychological /
 * socialSpiritual), each carrying planBullets + interventions + goals +
 * tasks + categoryStatusItems + section-level meta (status, trend,
 * lastUpdated). Same-source-of-truth view over both the legacy Care Plan
 * (`AI_GENERATED_PLAN`) and the biopsychosocial plan record.
 *
 * The backend gates this behind the `PLAN_BPS_UNIFIED_ENABLED` flag; when
 * OFF it 404s with `{ code: 'FEATURE_DISABLED' }`. This client swallows
 * that specific 404 into a sentinel `{ __featureDisabled: true }` return
 * so react-query keeps it out of the error path — the `useUnifiedPlan`
 * hook then surfaces `disabled: true` and callers render an inert
 * "not-available" state (banner returns null, screen shows a placeholder).
 * All other failures (network / 5xx / auth) still throw.
 */

import { apiClient } from '@/lib/api-client';
import { isFeatureDisabledError } from '@/lib/unified-plan-feature-flag';
import type { PlanItemSource } from '@/lib/unified-plan-provenance';

// ── Item source union ────────────────────────────────────────────────
//
// Single source of truth is `lib/unified-plan-provenance.ts` so it can
// be consumed from both this axios client and the pure
// `node --test` unit tests without pulling axios/RN into the test
// module graph.
//   `bps` = native BPS section item (no provenance chip needed).
//   `ai_generated` / `care_manager` / `patient` = legacy Care Plan
//     sources rewritten into BPS sections by the BE.
//   `med_overlay` = integrative overlay — "Integrative" chip.
export type { PlanItemSource };

export type { UnifiedSectionKey } from '@/lib/unified-plan-assessment-routing';

export type SectionStatus = 'on-track' | 'needs-attention' | 'just-started';
export type SectionTrendDirection =
  | 'improving'
  | 'stable'
  | 'declining'
  | 'unknown';

// ── Goal / task shapes ──────────────────────────────────────────────

export interface UnifiedGoal {
  id: string;
  title: string;
  description?: string;
  metric?: string;
  baseline?: string;
  target?: string;
  timeframe?: string;
  status?: 'active' | 'achieved' | 'paused' | 'cancelled';
  source: PlanItemSource;
  sourceCategory?: string;
  /** True when BE couldn't confidently classify this into one BPS section. */
  ambiguous?: boolean;
  aiKey?: string;
  editedBy?: 'patient' | 'care_manager';
  editedFields?: string[];
}

export interface UnifiedTaskMetric {
  name?: string;
  unit?: string;
}

export interface UnifiedTask {
  id: string;
  title: string;
  description?: string;
  source: PlanItemSource;
  sourceCategory?: string;
  ambiguous?: boolean;
  completionStyle?: 'simple' | 'measurable';
  metric?: UnifiedTaskMetric;
  measurements?: unknown[];
  completions?: unknown[];
  status?: 'pending' | 'completed' | 'skipped';
  dueDate?: string;
  editedBy?: 'patient' | 'care_manager';
}

// ── Ancillary item shapes ────────────────────────────────────────────

export interface UnifiedIntervention {
  id: string;
  kind: 'intervention' | 'support' | 'recommendation' | 'resource';
  title: string;
  description?: string;
  link?: string;
}

export interface UnifiedCategoryStatusItem {
  id: string;
  label: string;
  subLabel?: string;
  status?: SectionStatus;
}

// ── Section + envelope ──────────────────────────────────────────────

export interface UnifiedPlanSection {
  planBullets: string[];
  interventions: UnifiedIntervention[];
  goals: UnifiedGoal[];
  tasks: UnifiedTask[];
  categoryStatusItems: UnifiedCategoryStatusItem[];
  status?: SectionStatus;
  trendSummary?: string;
  trendDirection?: SectionTrendDirection;
  lastUpdated?: string;
}

export interface UnifiedPlanMeta {
  generatedAt: string;
  planType?: string;
  hasLegacy: boolean;
  hasBps: boolean;
  refreshInFlight: boolean;
}

export interface UnifiedPlanView {
  meta: UnifiedPlanMeta;
  sections: {
    biological: UnifiedPlanSection;
    psychological: UnifiedPlanSection;
    socialSpiritual: UnifiedPlanSection;
  };
}

/** Sentinel — react-query treats this as `data`, not an error. */
export interface UnifiedPlanFeatureDisabled {
  __featureDisabled: true;
}

export type UnifiedPlanFetchResult =
  | UnifiedPlanView
  | UnifiedPlanFeatureDisabled;

// Pure feature-disabled helpers live in `lib/unified-plan-feature-flag.ts`
// so both this axios-bound client and the `node --test` unit tests can
// consume them without pulling axios into the test module graph.
export { isFeatureDisabled } from '@/lib/unified-plan-feature-flag';
export { isFeatureDisabledError };

/**
 * GET /v1/plan → UnifiedPlanView, or `{ __featureDisabled: true }` when the
 * backend reports the flag is off. Any other failure re-throws unchanged so
 * axios error semantics (401 refresh, 5xx retry) continue to work upstream.
 */
export async function fetchUnifiedPlan(): Promise<UnifiedPlanFetchResult> {
  try {
    // BE wraps as { success: true, data: <view> } (see utils/response.ts
    // sendSuccess). Legacy code path had a latent bug returning the whole
    // envelope; chunked v2 rollout exposed it because v2 shows empty
    // states instead of crashing on undefined.sections access.
    const res = await apiClient.get<{ success: boolean; data: UnifiedPlanView }>('/v1/plan');
    return res.data?.data ?? res.data;
  } catch (err) {
    if (isFeatureDisabledError(err)) {
      // Tag on the error too — some callers (retry gates) inspect the raw
      // error rather than the sentinel.
      (err as { code?: string }).code = 'FEATURE_DISABLED';
      return { __featureDisabled: true };
    }
    throw err;
  }
}

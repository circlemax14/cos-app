/**
 * Health-Plan Medication Management (COS-357 / SCRUM-504).
 *
 * Lets a patient manage the *effective* medication list that drives their
 * health-plan medication tasks: list EHR-sourced + self-added meds, hide an
 * EHR med, add/edit a med (the "med changed but not in the EHR yet" case),
 * toggle adherence tracking, and manage supply / refill reminders.
 *
 * IMPORTANT — this is tracking-only. It never changes a prescription and
 * never notifies a provider. The UI surfaces that disclaimer prominently.
 *
 * Backend contract (fixed):
 *   GET  /v1/patients/me/plan-medications
 *        -> { success, data: {
 *               flagEnabled,
 *               medications: Medication[],
 *               // COS-357 follow-up (SCRUM-504): soft recurring "review your
 *               // medications" prompt. medsReviewNeeded is true while the
 *               // server-side review flag is on AND the patient hasn't yet
 *               // confirmed; medsReviewedAt is the last confirmation time.
 *               // Both default to a no-prompt state on older backends.
 *               medsReviewNeeded?: boolean,
 *               medsReviewedAt?: string | null,
 *             } }
 *   PUT  /v1/patients/me/plan-medications  (all body fields optional)
 *        -> { success, data: { medications: Medication[] } }
 *        accepts confirmReview?: boolean to mark the review complete.
 *
 * Flag-gating: `flagEnabled` defaults to false on older/back-compat
 * deployments. Callers MUST treat false as "render nothing".
 */

import { apiClient } from '@/lib/api-client';

export type MedicationSource = 'ehr' | 'patient-reported';

/**
 * COS-372 — how a medication is taken. `consumable` = pills/tablets/mL on a
 * daily-times schedule (today's only behavior); `injectable` = pens/vials/doses
 * on a cadence (weekly, etc.). Additive + optional: older backends omit it and
 * the client treats a missing value as 'consumable' (see lib/med-forms.ts), so
 * the existing UI is unchanged. Gated client-side by MED_FORMS_ENABLED.
 */
export type MedicationForm = 'consumable' | 'injectable';

/**
 * COS-372 — dosing cadence for an injectable. Consumables stay on daily-times,
 * so cadence is only meaningful for injectables. Optional for back-compat.
 */
export type MedicationCadence = 'daily' | 'weekly' | 'biweekly' | 'monthly';

export interface MedicationSupply {
  /** How many doses/units the patient currently has on hand. */
  remainingQuantity: number | null;
  /** How many units are consumed per day. */
  dosesPerDay: number | null;
  /** ISO date (or datetime) the patient is projected to run out. */
  runOutDate: string | null;
  /** ISO date the refill window opens (server-computed). */
  refillWindowStart: string | null;
  /** True once the patient is inside the refill window and not snoozed. */
  needsRefill: boolean;
  /** ISO date (YYYY-MM-DD) the refill banner is snoozed until, if any. */
  snoozedUntil: string | null;
  /**
   * COS-372 — dosing cadence for an injectable's supply projection. Optional;
   * absent on older backends, where supply is assumed daily (consumable).
   */
  cadence?: MedicationCadence;
  /**
   * COS-372 — ISO date (YYYY-MM-DD) the cadence schedule starts from, used to
   * project the next dose / run-out for an injectable. Optional.
   */
  startDate?: string;
}

export interface Medication {
  id: string;
  name: string;
  dose: string | null;
  frequency: string | null;
  times: string[];
  source: MedicationSource;
  tracked: boolean;
  supply: MedicationSupply | null;
  /**
   * COS-372 — how the med is taken. Optional + additive: when absent (older
   * backend) the client defaults to 'consumable', preserving today's behavior.
   */
  form?: MedicationForm;
  /**
   * Ken 2026-08-05 (BE PR #365) — soft-delete timestamp. Only populated
   * when the caller opts in with `?includePast=1`. Null / absent = the
   * med is actively taken. An ISO string = the med was discontinued at
   * that time and belongs in the "Past medications" section.
   *
   * Older backends omit this field entirely; older frontends ignore it.
   * Additive contract — safe to read without a version gate.
   */
  discontinuedAt?: string | null;
}

export interface PlanMedicationsResponse {
  flagEnabled: boolean;
  medications: Medication[];
  /**
   * COS-357 follow-up (SCRUM-504). True when the patient should be nudged to
   * review their medications (server review flag on + not yet confirmed).
   * Defaults to false on older backends that don't send the field, so the
   * prompt stays inert (back-compat).
   */
  medsReviewNeeded: boolean;
  /** ISO timestamp of the last review confirmation, or null if never. */
  medsReviewedAt: string | null;
}

// ─── PUT body shapes (every field optional) ────────────────────────────────

export interface PlanMedicationEdit {
  id: string;
  dose?: string;
  times?: string[];
  frequency?: string;
  /** COS-372 — update how the med is taken. Optional + additive. */
  form?: MedicationForm;
}

export interface PlanMedicationAdd {
  name: string;
  dose?: string;
  times?: string[];
  frequency?: string;
  /** COS-372 — how the med is taken. Optional; backend defaults to consumable. */
  form?: MedicationForm;
}

export interface PlanMedicationSetTracked {
  id: string;
  tracked: boolean;
}

export interface PlanMedicationSetSupply {
  id: string;
  remainingQuantity: number;
  dosesPerDay: number;
  /**
   * COS-372 — cadence for an injectable's supply projection. Optional +
   * additive; omitted for consumables (daily-times) and on older clients.
   */
  cadence?: MedicationCadence;
  /** COS-372 — ISO date (YYYY-MM-DD) the cadence starts from. Optional. */
  startDate?: string;
}

export interface PlanMedicationSnoozeRefill {
  /** Medication id. */
  id: string;
  /** ISO date (YYYY-MM-DD) to snooze the refill banner until. */
  until: string;
}

export interface UpdatePlanMedicationsBody {
  remove?: string[];
  unremove?: string[];
  edit?: PlanMedicationEdit[];
  add?: PlanMedicationAdd[];
  setTracked?: PlanMedicationSetTracked[];
  setSupply?: PlanMedicationSetSupply[];
  snoozeRefill?: PlanMedicationSnoozeRefill[];
  /**
   * COS-357 follow-up (SCRUM-504). When true, marks the "review your
   * medications" prompt as completed server-side. Can be sent on its own or
   * alongside other mutations (e.g. when the patient saves supply).
   */
  confirmReview?: boolean;
}

/**
 * GET the effective plan-medication list.
 *
 * Back-compat: if the endpoint is missing (older backend that hasn't shipped
 * this route) or returns an error, we resolve to a disabled, empty result so
 * the screen renders exactly as it did before — never throwing into the UI.
 */
export interface FetchPlanMedicationsOptions {
  /**
   * Ken 2026-08-05 — when true, the BE returns discontinued medications
   * too (with `discontinuedAt` populated) so the FE can split Active
   * vs Past client-side. Default false → legacy filtered response.
   */
  includePast?: boolean;
}

export async function fetchPlanMedications(
  opts: FetchPlanMedicationsOptions = {},
): Promise<PlanMedicationsResponse> {
  try {
    const url = opts.includePast
      ? '/v1/patients/me/plan-medications?includePast=1'
      : '/v1/patients/me/plan-medications';
    const res = await apiClient.get<{ success: boolean; data: PlanMedicationsResponse }>(url);
    const data = res.data?.data;
    return {
      flagEnabled: data?.flagEnabled === true,
      medications: Array.isArray(data?.medications) ? data.medications : [],
      // Default to no-prompt when the field is absent (older backend).
      medsReviewNeeded: data?.medsReviewNeeded === true,
      medsReviewedAt: typeof data?.medsReviewedAt === 'string' ? data.medsReviewedAt : null,
    };
  } catch {
    // Disabled-by-default on any failure (404 on old backends, network, etc.)
    return { flagEnabled: false, medications: [], medsReviewNeeded: false, medsReviewedAt: null };
  }
}

/**
 * PUT a batch of medication mutations. Returns the recomputed list so the
 * caller can prime the React Query cache without a second round-trip.
 *
 * `opts.includePast` mirrors the GET behavior — the PUT response echoes
 * the effective list, and when true it includes discontinued rows so
 * the caller's cache-seed doesn't accidentally hide a med the patient
 * just moved to Past.
 */
export async function updatePlanMedications(
  body: UpdatePlanMedicationsBody,
  opts: FetchPlanMedicationsOptions = {},
): Promise<Medication[]> {
  const url = opts.includePast
    ? '/v1/patients/me/plan-medications?includePast=1'
    : '/v1/patients/me/plan-medications';
  const res = await apiClient.put<{ success: boolean; data: { medications: Medication[] } }>(
    url,
    body,
  );
  return res.data?.data?.medications ?? [];
}

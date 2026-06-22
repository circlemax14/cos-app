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
}

export interface PlanMedicationAdd {
  name: string;
  dose?: string;
  times?: string[];
  frequency?: string;
}

export interface PlanMedicationSetTracked {
  id: string;
  tracked: boolean;
}

export interface PlanMedicationSetSupply {
  id: string;
  remainingQuantity: number;
  dosesPerDay: number;
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
export async function fetchPlanMedications(): Promise<PlanMedicationsResponse> {
  try {
    const res = await apiClient.get<{ success: boolean; data: PlanMedicationsResponse }>(
      '/v1/patients/me/plan-medications',
    );
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
 */
export async function updatePlanMedications(
  body: UpdatePlanMedicationsBody,
): Promise<Medication[]> {
  const res = await apiClient.put<{ success: boolean; data: { medications: Medication[] } }>(
    '/v1/patients/me/plan-medications',
    body,
  );
  return res.data?.data?.medications ?? [];
}

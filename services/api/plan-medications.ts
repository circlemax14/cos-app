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
 *        -> { success, data: { flagEnabled, medications: Medication[] } }
 *   PUT  /v1/patients/me/plan-medications  (all body fields optional)
 *        -> { success, data: { medications: Medication[] } }
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
    };
  } catch {
    // Disabled-by-default on any failure (404 on old backends, network, etc.)
    return { flagEnabled: false, medications: [] };
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

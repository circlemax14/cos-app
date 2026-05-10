import type { MedicationSummary, ProviderMedication } from '@/services/api/types';

/**
 * Heuristic for medication status pills — mirrors cos-frontend's
 * `inferMedicationStatus` so web + mobile show the same labels.
 *
 * WHY: FHIR data we ingest defaults `status: 'active'` for most
 * MedicationRequest resources, including prescriptions authored years
 * ago that almost certainly aren't being taken anymore. Upstream EHRs
 * rarely flip records to `completed`. So an `active` row whose
 * `authoredOn` is older than 90 days gets re-tagged "Likely
 * completed" (with `inferred: true`) so the UI is honest. Explicit
 * non-active statuses (stopped / completed / on-hold / cancelled) are
 * always trusted as-is.
 */

export interface MedicationStatusPill {
  /** Logical status after inference. */
  code: 'active' | 'completed' | 'stopped' | 'on-hold' | 'unknown';
  /** Display label, e.g. "Active", "Likely completed". */
  label: string;
  /** Background hex. */
  bg: string;
  /** Foreground (text) hex. */
  fg: string;
  /** True when we inferred completion (vs. FHIR saying so directly). */
  inferred: boolean;
}

const STALE_CUTOFF_DAYS = 90;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function pickStatus(input: { status?: string; authoredOn?: string | null }): MedicationStatusPill {
  const status = (input.status ?? '').toLowerCase().trim();

  if (status === 'stopped' || status === 'cancelled' || status === 'entered-in-error') {
    return { code: 'stopped', label: 'Stopped', bg: '#FEE2E2', fg: '#B91C1C', inferred: false };
  }
  if (status === 'completed') {
    return { code: 'completed', label: 'Completed', bg: '#E5E7EB', fg: '#374151', inferred: false };
  }
  if (status === 'on-hold') {
    return { code: 'on-hold', label: 'On Hold', bg: '#FEF3C7', fg: '#92400E', inferred: false };
  }

  if (status === 'active') {
    if (input.authoredOn) {
      const authored = new Date(input.authoredOn).getTime();
      if (!Number.isNaN(authored)) {
        const ageDays = (Date.now() - authored) / MS_PER_DAY;
        if (ageDays > STALE_CUTOFF_DAYS) {
          // Stale active record — flip to "Likely completed".
          return {
            code: 'completed',
            label: 'Likely completed',
            bg: '#E5E7EB',
            fg: '#374151',
            inferred: true,
          };
        }
      }
    }
    return { code: 'active', label: 'Active', bg: '#DCFCE7', fg: '#166534', inferred: false };
  }

  return { code: 'unknown', label: 'Unknown', bg: '#E5E7EB', fg: '#374151', inferred: false };
}

export function inferMedicationStatus(m: ProviderMedication | MedicationSummary): MedicationStatusPill {
  return pickStatus({ status: m.status, authoredOn: m.authoredOn });
}

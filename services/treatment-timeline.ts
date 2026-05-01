import type {
  ProviderTreatmentPlan,
  ProviderAppointment,
  ProviderDiagnosis,
  ProviderMedication,
  TimelineEvent,
  EncounterGroupView,
  TreatmentTimeline,
  ClinicalStatus,
} from './api/types';

/** Sentinel id for the trailing bucket of items lacking encounter attribution. */
export const EARLIER_BUCKET_ID = 'earlier' as const;

/** Diagnosis clinicalStatus values that count as "currently active". */
export const ACTIVE_STATUSES: ClinicalStatus[] = ['active', 'recurrence', 'relapse'];

/** Diagnosis clinicalStatus values that count as "no longer active". */
export const RESOLVED_STATUSES: ClinicalStatus[] = ['resolved', 'remission', 'inactive'];

function isActive(status: ClinicalStatus): boolean {
  return ACTIVE_STATUSES.includes(status);
}

function isResolved(status: ClinicalStatus): boolean {
  return RESOLVED_STATUSES.includes(status);
}

/** "2026-04-12T..." → "APR 12" (uppercase, no year). Empty string if invalid. */
function formatDateLabel(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    .toUpperCase();
}

function diagnosisToEvent(d: ProviderDiagnosis): TimelineEvent {
  if (isResolved(d.clinicalStatus)) {
    return {
      id: `dx-${d.id}`,
      kind: 'diagnosis-resolved',
      title: `${d.name} → Resolved`,
      subtitle: null,
      reasonText: null,
    };
  }
  return {
    id: `dx-${d.id}`,
    kind: 'diagnosis-recorded',
    title: d.name,
    subtitle: d.clinicalStatus === 'unknown' ? null : d.clinicalStatus,
    reasonText: null,
  };
}

function medicationToEvent(m: ProviderMedication): TimelineEvent {
  const dosePieces = [m.dose, m.frequency].filter(Boolean);
  return {
    id: `med-${m.id}`,
    kind: 'medication-added',
    title: m.name,
    subtitle: dosePieces.length ? dosePieces.join(' · ') : null,
    reasonText: m.reason ? `for ${m.reason}` : null,
  };
}

/**
 * Build the grouped timeline view from raw treatment + appointment data.
 *
 * Rules:
 *  - Diagnoses with active-family clinicalStatus go into `activeConditions`.
 *  - Diagnoses with resolved-family clinicalStatus go into `resolvedConditions`.
 *  - Items (any med, plus diagnoses with a state-change worth showing on the
 *    timeline) bucket by `encounterId` when known. Resolved diagnoses always
 *    get a timeline event (so the user sees "X → Resolved at this visit").
 *    Active-recorded-here diagnoses do not — they're already pinned at top.
 *  - Items lacking an encounter id fall into a trailing "EARLIER" bucket.
 *  - Encounter groups sort reverse-chronological by appointment date; the
 *    "EARLIER" bucket is always last.
 */
export function groupTreatmentByEncounter(
  plan: ProviderTreatmentPlan,
  appointments: ProviderAppointment[],
): TreatmentTimeline {
  const activeConditions = plan.diagnoses.filter((d) => isActive(d.clinicalStatus));
  const resolvedConditions = plan.diagnoses.filter((d) => isResolved(d.clinicalStatus));

  // Index appointments by id for O(1) lookup of date + type metadata
  const apptById = new Map(appointments.map((a) => [a.id, a]));

  // Bucket items by encounterId. Map iteration order = insertion order;
  // we'll re-sort once we have the full set.
  const buckets = new Map<string, TimelineEvent[]>();

  // Resolved diagnoses → one event each, bucketed
  for (const d of resolvedConditions) {
    const key = d.encounterId ?? EARLIER_BUCKET_ID;
    const arr = buckets.get(key) ?? [];
    arr.push(diagnosisToEvent(d));
    buckets.set(key, arr);
  }

  // All medications → one event each, bucketed
  for (const m of plan.medications) {
    const key = m.encounterId ?? EARLIER_BUCKET_ID;
    const arr = buckets.get(key) ?? [];
    arr.push(medicationToEvent(m));
    buckets.set(key, arr);
  }

  // Build the group views
  const groups: EncounterGroupView[] = [];
  for (const [encounterId, events] of buckets.entries()) {
    if (encounterId === EARLIER_BUCKET_ID) continue; // handle last
    const appt = apptById.get(encounterId);
    groups.push({
      id: encounterId,
      dateLabel: formatDateLabel(appt?.date) || null,
      typeLabel: appt?.type ? appt.type.toUpperCase() : null,
      events,
    });
  }

  // Sort dated groups newest-first by appt.date (fallback: keep insertion order)
  groups.sort((a, b) => {
    const da = apptById.get(a.id)?.date ?? '';
    const db = apptById.get(b.id)?.date ?? '';
    return db.localeCompare(da);
  });

  // Append the "earlier" bucket last if it exists
  const earlier = buckets.get(EARLIER_BUCKET_ID);
  if (earlier && earlier.length) {
    groups.push({
      id: EARLIER_BUCKET_ID,
      dateLabel: 'EARLIER',
      typeLabel: null,
      events: earlier,
    });
  }

  return {
    activeConditions,
    resolvedConditions,
    encounterGroups: groups,
  };
}

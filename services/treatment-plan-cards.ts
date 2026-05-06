import type {
  ProviderDiagnosis,
  ProviderMedication,
  ProviderAppointment,
  TreatmentPlanItem,
} from './api/types';

const ACTIVE_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;

const MONTH_ABBR_LONG = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return `${MONTH_ABBR_LONG[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function formatMedication(m: ProviderMedication): string {
  const parts: string[] = [m.name];
  if (m.dose) parts.push(m.dose);
  if (m.frequency) parts.push(m.frequency);
  return parts.join(' · ');
}

function isWithinActiveWindow(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const ts = new Date(iso).getTime();
  if (isNaN(ts)) return false;
  return Date.now() - ts <= ACTIVE_WINDOW_MS;
}

interface BuildArgs {
  diagnoses: ProviderDiagnosis[];
  medications: ProviderMedication[];
  appointments: ProviderAppointment[];
}

/**
 * Group diagnoses + medications into per-encounter "Treatment Plan" cards
 * matching the legacy fasten-health card shape (one card per visit, with
 * the diagnoses recorded and medications prescribed at that visit).
 *
 * Cards are sorted newest-first. The most recent card is titled
 * "Current Diagnosis & Treatment Plan"; older cards are titled
 * "Previous Diagnosis & Treatment Recommendations". Items lacking an
 * encounter id are bucketed into a trailing "Earlier" card so the
 * patient still sees them.
 *
 * Cards with no diagnoses AND no medications are dropped — there is
 * nothing to show.
 */
export function buildTreatmentPlanCards({
  diagnoses,
  medications,
  appointments,
}: BuildArgs): TreatmentPlanItem[] {
  const apptById = new Map(appointments.map((a) => [a.id, a]));

  // Bucket diagnoses + medications by encounter id (or 'earlier' for unattributed)
  const dxByEncounter = new Map<string, ProviderDiagnosis[]>();
  const medByEncounter = new Map<string, ProviderMedication[]>();
  const EARLIER = '__earlier__';

  for (const d of diagnoses) {
    const key = d.encounterId ?? EARLIER;
    const arr = dxByEncounter.get(key) ?? [];
    arr.push(d);
    dxByEncounter.set(key, arr);
  }
  for (const m of medications) {
    const key = m.encounterId ?? EARLIER;
    const arr = medByEncounter.get(key) ?? [];
    arr.push(m);
    medByEncounter.set(key, arr);
  }

  const allEncounterIds = new Set([
    ...dxByEncounter.keys(),
    ...medByEncounter.keys(),
  ]);

  // Build a card per encounter, ignoring empty buckets up front
  const cards: Array<{ card: TreatmentPlanItem; sortDate: number }> = [];
  for (const encId of allEncounterIds) {
    const dx = dxByEncounter.get(encId) ?? [];
    const meds = medByEncounter.get(encId) ?? [];
    if (dx.length === 0 && meds.length === 0) continue;

    const isEarlier = encId === EARLIER;
    const appt = isEarlier ? null : apptById.get(encId);
    // Anchor date: appointment date for known encounters; for the earlier
    // bucket, fall back to the newest recordedDate / authoredOn we have.
    let anchorIso: string | null = appt?.date ?? null;
    if (!anchorIso) {
      const candidateDates = [
        ...dx.map((d) => d.recordedDate ?? d.onsetDate),
        ...meds.map((m) => m.authoredOn),
      ].filter((x): x is string => !!x);
      if (candidateDates.length > 0) {
        anchorIso = candidateDates.sort().reverse()[0];
      }
    }

    const sortDate = anchorIso ? new Date(anchorIso).getTime() : 0;
    const dateLabel = formatDate(anchorIso);

    // Diagnosis line: comma-joined names, or '—' if none
    const diagnosisText =
      dx.length > 0
        ? dx.map((d) => d.name).filter(Boolean).join(', ')
        : '';

    // Description: encounter type when available, else first diagnosis note
    const description = appt?.type
      ? appt.type
      : dx.find((d) => d.notes.length > 0)?.notes[0] ?? '';

    cards.push({
      card: {
        id: encId,
        title: '', // filled in after sort
        status: isWithinActiveWindow(anchorIso) ? 'Active' : 'Completed',
        date: dateLabel,
        diagnosis: diagnosisText || 'No diagnosis recorded',
        description,
        medications: meds.length > 0 ? meds.map(formatMedication) : [],
      },
      sortDate,
    });
  }

  // Sort newest-first; "Earlier" (sortDate=0) sinks naturally to the bottom
  cards.sort((a, b) => b.sortDate - a.sortDate);

  // Title: most recent → "Current"; rest → "Previous"
  return cards.map(({ card }, index) => ({
    ...card,
    title:
      index === 0
        ? 'Current Diagnosis & Treatment Plan'
        : 'Previous Diagnosis & Treatment Recommendations',
  }));
}

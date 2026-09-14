/**
 * COS-1013 — the provider detail payload, and grouping it into visits.
 *
 * Pure: no imports, so `node --test` can reach it. The fetch that uses these
 * types lives in services/api/provider-detail.ts, which imports the API client
 * through the `@/` alias the test runner cannot resolve.
 */

export interface DetailCondition {
  id: string;
  name: string;
  status: string;
  severity?: string;
  onsetDate?: string;
  recordedDate?: string;
}

export interface DetailProcedure {
  id: string;
  name: string;
  status: string;
  performedDate?: string;
}

export interface DetailReport {
  id: string;
  name: string;
  date?: string;
  status: string;
  conclusion?: string;
  category?: string;
  /** The visit this came from, when the record says. */
  encounterId?: string;
}

export interface DetailMedication {
  id: string;
  name: string;
  status: string;
  dosage?: string;
  authoredOn?: string;
  indication?: string;
  refillsRemaining?: number;
  endedReason?: string;
  encounterId?: string;
}

export interface DetailEncounter {
  id: string;
  type: string;
  date?: string;
  endDate?: string;
  status: string;
  normalizedStatus?: 'planned' | 'arrived' | 'in-progress' | 'finished' | 'cancelled';
  durationMinutes?: number;
  location?: string;
  cancelationReason?: string;
  reason?: string;
}

export interface ProviderDetail {
  provider: {
    id: string;
    name: string;
    specialty?: string;
    qualifications?: string;
    /** The office number. Present when the record carries one. */
    phone?: string;
    npi?: string;
  };
  treatment: {
    activeConditions: DetailCondition[];
    resolvedConditions: DetailCondition[];
    procedures: DetailProcedure[];
  };
  progressNotes: { reports: DetailReport[] };
  medications: { active: DetailMedication[]; previous: DetailMedication[] };
  encounters?: DetailEncounter[];
}

/** One visit, with everything the record ties to it. */
export interface VisitCard {
  encounter: DetailEncounter;
  medications: DetailMedication[];
  reports: DetailReport[];
}

/**
 * Group a provider's record into one card per visit, newest first.
 *
 * Vishal: "the patient visited on 3 Feb 2025, then there will be one card.
 * Patient visits multiple times, and there will be multiple cards."
 *
 * Only medications and reports are grouped, because only they carry the link —
 * 46 of 59 and 74 of 76 on a real record. CONDITIONS DELIBERATELY ARE NOT: none
 * of them reference an encounter, so placing a diagnosis inside a visit card
 * would assert it was made that day, which the record does not say.
 *
 * Anything with no visit attached is returned separately rather than dropped or
 * quietly folded into the nearest date.
 */
export function toVisitCards(detail: ProviderDetail): {
  visits: VisitCard[];
  unlinkedMedications: DetailMedication[];
  unlinkedReports: DetailReport[];
} {
  const encounters = detail.encounters ?? [];
  const meds = [...detail.medications.active, ...detail.medications.previous];
  const reports = detail.progressNotes.reports;

  const known = new Set(encounters.map((e) => e.id));
  const byEncounter = new Map<string, VisitCard>();
  for (const e of encounters) byEncounter.set(e.id, { encounter: e, medications: [], reports: [] });

  for (const m of meds) {
    const card = m.encounterId ? byEncounter.get(m.encounterId) : undefined;
    if (card) card.medications.push(m);
  }
  for (const r of reports) {
    const card = r.encounterId ? byEncounter.get(r.encounterId) : undefined;
    if (card) card.reports.push(r);
  }

  const visits = [...byEncounter.values()].sort((a, b) =>
    (b.encounter.date ?? '').localeCompare(a.encounter.date ?? ''),
  );

  return {
    visits,
    unlinkedMedications: meds.filter((m) => !m.encounterId || !known.has(m.encounterId)),
    unlinkedReports: reports.filter((r) => !r.encounterId || !known.has(r.encounterId)),
  };
}

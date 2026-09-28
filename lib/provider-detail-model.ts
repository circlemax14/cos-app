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
  /**
   * COS-1148 — the visit this diagnosis was recorded at, when the source says.
   *
   * Absent for about half the fleet, and absent by SOURCE rather than at
   * random: athenahealth populates it on 81-100% of Conditions, Epic and the
   * payer feeds on 0%. Undefined means the source did not say — never that we
   * may infer one from dates.
   */
  encounterId?: string;
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
  /*
   * COS-1016 — encounters are nested under `appointments`, not at the top level.
   *
   * I wrote this model from the interface NAMES in the service rather than the
   * shape it actually returns, so `detail.encounters` was always undefined: no
   * visit cards ever rendered, and the treatment tab fell back to "No diagnoses
   * recorded by this provider" for a provider with seven visits. Vishal asked
   * the obvious question — how can there be ten records and no information —
   * and the answer was that the client was reading a field that does not exist.
   */
  appointments?: { encounters: DetailEncounter[] };
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
 * Medications, reports AND — since COS-1148 — conditions are grouped, each
 * only where the record carries the link.
 *
 * The note this replaces said conditions never reference an encounter. That
 * was measured on one Epic patient and generalised; across the datastore 179
 * of 339 (53%) do. Where the link is ABSENT the original caution stands
 * unchanged: a diagnosis with no encounter must not be placed inside a visit
 * card, because that asserts it was made that day and the record does not say
 * so.
 *
 * Anything with no visit attached is returned separately rather than dropped or
 * quietly folded into the nearest date.
 */
export function toVisitCards(detail: ProviderDetail): {
  visits: VisitCard[];
  unlinkedMedications: DetailMedication[];
  unlinkedReports: DetailReport[];
} {
  const encounters = detail.appointments?.encounters ?? [];
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

export interface ConditionGroup {
  condition: DetailCondition;
  /** Visits where this diagnosis was recorded, newest first. */
  visits: VisitCard[];
}

/**
 * COS-1148 — Ken's provider-page spec, as data.
 *
 *   "Notes =. List only
 *      1. Condition 1 - dates/notes
 *         Condition 2 - date/notes"
 *
 * Groups a provider's visits UNDER the diagnoses recorded at them, using only
 * `Condition.encounter` — the one link the data actually carries.
 *
 * ─── WHY THIS RETURNS A FALLBACK RATHER THAN ALWAYS GROUPING ─────────
 *
 * The link is populated by SOURCE, not at random: athenahealth records carry it
 * on 81-100% of Conditions, Epic and the payer feeds on 0%. So for some
 * patients this produces exactly the shape Ken drew — one athena record has 44
 * distinct condition codes with 21 recurring across multiple encounters, which
 * is "Condition 1 -> several dates" literally — and for others, nothing.
 *
 * `ungrouped` carries every visit no diagnosis claimed. A caller with an empty
 * `groups` renders its flat list exactly as before. Nothing is hidden by being
 * ungroupable, and nothing is invented to avoid an empty section.
 *
 * ─── ONE VISIT CAN APPEAR UNDER SEVERAL CONDITIONS ──────────────────
 *
 * Faithful, not a bug: 35-47% of notes on the linked records belong to an
 * encounter carrying more than one diagnosis. A visit where two problems were
 * addressed IS part of both stories, and picking one would silently drop the
 * other.
 */
export function groupVisitsByCondition(
  detail: ProviderDetail,
  visits: VisitCard[],
): { groups: ConditionGroup[]; ungrouped: VisitCard[] } {
  // Active and resolved both: a resolved diagnosis still has visits worth
  // reading, and Ken's spec draws a list of conditions, not a list of open ones.
  const conditions = [
    ...(detail.treatment?.activeConditions ?? []),
    ...(detail.treatment?.resolvedConditions ?? []),
  ];
  const byEncounter = new Map<string, VisitCard>();
  for (const v of visits) byEncounter.set(v.encounter.id, v);

  const claimed = new Set<string>();
  const groups: ConditionGroup[] = [];

  for (const c of conditions) {
    if (!c.encounterId) continue;
    const visit = byEncounter.get(c.encounterId);
    if (!visit) continue;
    claimed.add(visit.encounter.id);
    /*
     * Merge by condition NAME, not by Condition.id. The same diagnosis recorded
     * at three visits arrives as three Condition resources with three ids;
     * keying on id would render the same problem three times as three one-visit
     * groups, which is the opposite of what the spec asks for.
     */
    const key = c.name.trim().toLowerCase();
    const existing = groups.find((g) => g.condition.name.trim().toLowerCase() === key);
    if (existing) {
      if (!existing.visits.some((v) => v.encounter.id === visit.encounter.id)) {
        existing.visits.push(visit);
      }
    } else {
      groups.push({ condition: c, visits: [visit] });
    }
  }

  for (const g of groups) {
    g.visits.sort((a, b) => (b.encounter.date ?? '').localeCompare(a.encounter.date ?? ''));
  }
  // Most-documented condition first — what a clinician scans for.
  groups.sort((a, b) => b.visits.length - a.visits.length);

  return {
    groups,
    ungrouped: visits.filter((v) => !claimed.has(v.encounter.id)),
  };
}

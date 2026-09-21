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

/**
 * COS-1077 — a course of therapy is ONE card, not N near-identical ones.
 *
 * Ken, looking at his own record: "Many of these visits were to physical
 * therapy. How should we filter this?" On the reference record 22 of 55
 * encounters are type "Therapies Series" — 40% of the list — and most carry
 * nothing but the line "No medicines or tests were recorded for this visit."
 * The one that matters, the Therapy Discharge, is buried in the middle of the
 * repetition wearing the same face as the rest.
 *
 * We do not have to decide whether that is one episode or many: the EHR
 * already decided. The encounter type is literally "Therapies Series", so
 * consecutive visits of the same type at the same place are the same course.
 *
 * ─── WHY GROUPING AND NOT A FILTER ───────────────────────────────────
 *
 * A filter asks the patient to know the answer before they can see it, and
 * leaves the default view exactly as noisy as the thing being complained
 * about. It also costs permanent chrome on every provider — and most of the
 * 59 in this record have one visit type, so the control would do nothing.
 *
 * ─── THE SAFETY PROPERTY ─────────────────────────────────────────────
 *
 * The group carries the SUM of its members' reports and medications, so a
 * caller can always say what came out of the course on the collapsed face.
 * The rule can therefore get a date range wrong; it can never hide a result.
 * That is the whole reason grouping is defensible on a medical record.
 */
export interface VisitGroup {
  /** Stable id: the newest member's encounter id. */
  id: string;
  /** Present only when this is a course; a lone visit has none. */
  courseType?: string;
  /** Newest first, same order as `toVisitCards`. */
  visits: VisitCard[];
  /** Oldest member's date. */
  startDate?: string;
  /** Newest member's date. */
  endDate?: string;
  /** Totals across every member — never let the collapsed card hide these. */
  reportCount: number;
  medicationCount: number;
}

/** Same type AND same location — two courses at different clinics stay apart. */
function sameCourse(a: VisitCard, b: VisitCard): boolean {
  const type = (s?: string) => (s ?? '').trim().toLowerCase();
  if (!type(a.encounter.type) || type(a.encounter.type) !== type(b.encounter.type)) return false;
  return type(a.encounter.location) === type(b.encounter.location);
}

/**
 * Collapse runs of consecutive same-type visits into courses.
 *
 * CONSECUTIVE is deliberate. Grouping every "Outpatient" visit in a record
 * would merge two unrelated years into one card; a run broken by a different
 * visit type is a different episode, and the break is the evidence.
 *
 * A run of one is returned as a plain visit with no `courseType`, so callers
 * render it exactly as before — this is additive, not a change to single visits.
 */
export function groupVisitCourses(visits: VisitCard[]): VisitGroup[] {
  const out: VisitGroup[] = [];
  let run: VisitCard[] = [];

  const flush = () => {
    if (run.length === 0) return;
    const dates = run.map((v) => v.encounter.date).filter((d): d is string => Boolean(d)).sort();
    out.push({
      id: run[0].encounter.id,
      // A run of one is not a course — no badge, no "show all", no date range.
      courseType: run.length > 1 ? run[0].encounter.type : undefined,
      visits: run,
      startDate: dates[0],
      endDate: dates[dates.length - 1],
      reportCount: run.reduce((n, v) => n + v.reports.length, 0),
      medicationCount: run.reduce((n, v) => n + v.medications.length, 0),
    });
    run = [];
  };

  for (const v of visits) {
    if (run.length > 0 && !sameCourse(run[run.length - 1], v)) flush();
    run.push(v);
  }
  flush();
  return out;
}

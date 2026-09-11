import { apiClient } from '@/lib/api-client';
import { retryAsync, isTransientApiError } from '@/lib/retry-async';
import { categorizeProvider } from '@/services/provider-categorization';
import type {
  Provider,
  TreatmentPlanItem,
  ProgressNote,
  ProviderAppointment,
  Allergy,
  CarePlanItem,
  DeviceItem,
  LabReport,
  ProviderTreatmentPlan,
  ProviderDiagnosis,
  ProviderMedication,
  ClinicalStatus,
} from './types';

interface FhirName {
  given?: string[];
  family?: string;
  text?: string;
  prefix?: string[];
}

interface FhirPractitioner {
  id: string;
  name?: FhirName[];
  telecom?: { system?: string; value?: string }[];
  qualification?: { code?: { text?: string; coding?: { display?: string }[] } }[];
  hasData?: boolean;
  recordCount?: number;
}

interface FhirPractitionerRole {
  practitioner?: { reference?: string };
  specialty?: { text?: string; coding?: { display?: string }[] }[];
}

function buildName(names?: FhirName[]): string {
  if (!names || names.length === 0) return 'Unknown';
  const n = names[0];
  if (n.text) return n.text;
  const parts: string[] = [];
  if (n.prefix?.length) parts.push(n.prefix[0]);
  if (n.given?.length) parts.push(...n.given);
  if (n.family) parts.push(n.family);
  return parts.join(' ') || 'Unknown';
}

function extractSpecialty(role?: FhirPractitionerRole): string | undefined {
  const spec = role?.specialty?.[0];
  return spec?.text ?? spec?.coding?.[0]?.display;
}

function extractQualifications(practitioner: FhirPractitioner): string | undefined {
  return practitioner.qualification
    ?.map((q) => q.code?.text ?? q.code?.coding?.[0]?.display)
    .filter(Boolean)
    .join(', ') || undefined;
}

function extractContact(practitioner: FhirPractitioner, system: string): string | undefined {
  return practitioner.telecom?.find((t) => t.system === system)?.value;
}

function transformToProvider(practitioner: FhirPractitioner, role?: FhirPractitionerRole): Provider {
  const name = buildName(practitioner.name);
  const qualifications = extractQualifications(practitioner);
  const specialty = extractSpecialty(role);

  const cat = categorizeProvider({ name, qualifications, specialty });

  return {
    id: practitioner.id,
    name,
    qualifications,
    specialty,
    phone: extractContact(practitioner, 'phone'),
    email: extractContact(practitioner, 'email'),
    category: cat.category.toLowerCase(),
    subCategory: cat.subCategory,
    subCategories: cat.subCategories,
    hasData: practitioner.hasData ?? true,
    recordCount: practitioner.recordCount ?? 0,
  };
}

/**
 * COS-968 — the same doctor, twice.
 *
 * Ken, 2026-09-10, on the provider pages: they "duplicate" and filter badly.
 * He is right, and it is measurable: a live patient returns 78 provider rows
 * in which every name appears exactly twice — once keyed by the Epic FHIR
 * id, once by the NPI. So ~39 doctors render as 78 entries, and half of them
 * open a detail screen where all five tabs read "No … recorded by this
 * provider", because the records hang off the OTHER copy.
 *
 * Merged on name + credentials rather than name alone: two different people
 * called J. Smith at one clinic will differ in qualifications, and merging
 * them would be a worse error than showing them twice. The survivor is the
 * copy that actually has records, so the tap lands somewhere with content.
 *
 * `fetchProviderById` resolves through this same list, so an id dropped here
 * can never be navigated to — the row that carries the id is the row that
 * renders.
 *
 * The proper home for this is cos-backend patient.service.ts:99, where the
 * two FHIR identifiers are still distinguishable. That needs a `main` deploy;
 * this does not, and the duplication is on screen today.
 */
function dedupeByPerson(providers: Provider[]): Provider[] {
  const norm = (v?: string) => (v ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

  const groups = new Map<string, Provider[]>();
  for (const p of providers) {
    const key = `${norm(p.name)}|${norm(p.qualifications)}`;
    // A blank name is not an identity. Key those to themselves so they can
    // never pool together.
    const k = norm(p.name) ? key : `${key}|${p.id}`;
    const g = groups.get(k);
    if (g) g.push(p);
    else groups.set(k, [p]);
  }

  /*
   * COS-971 — merge ONLY the pattern we actually observed, and nothing else.
   *
   * The first cut of this merged every row sharing name+credentials, keeping
   * whichever had records. That was too greedy against real data: production
   * returns a PLACEHOLDER practitioner name with no specialty, repeated, and
   * on two live accounts it collapsed 17 and 15 DISTINCT practitioner FHIR ids
   * into a single row. Those doctors became unreachable from the list. Showing
   * a doctor twice is untidy; hiding sixteen is dangerous, and it is the worse
   * failure of the two.
   *
   * The duplication we are actually fixing has a narrow signature: EXACTLY TWO
   * rows for one person — the same human arriving once under the Epic FHIR id
   * and once under the NPI — where only ONE of them carries records, which is
   * why half the roster opened onto five empty tabs.
   *
   * So: collapse a group only when it is a pair AND exactly one side has
   * records. Anything else — three or more rows, or two rows that both have
   * records — is left intact, because at that point we cannot tell a duplicate
   * from two people, and the safe answer is to show both.
   */
  const out: Provider[] = [];
  for (const group of groups.values()) {
    if (group.length === 1) {
      out.push(group[0]);
      continue;
    }
    const withData = group.filter((p) => p.hasData === true || (p.recordCount ?? 0) > 0);
    if (group.length === 2 && withData.length === 1) {
      out.push(withData[0]);
      continue;
    }
    out.push(...group);
  }
  return out;
}

export async function fetchProviders(): Promise<Provider[]> {
  try {
    // COS-366: retry transient launch-burst throttles (429) so a momentary
    // Lambda-concurrency throttle doesn't collapse the provider list to [].
    const res = await retryAsync(
      () =>
        apiClient.get<{
          success: boolean;
          data: { roles: FhirPractitionerRole[]; practitioners: FhirPractitioner[] };
        }>('/v1/patients/me/providers'),
      { shouldRetry: isTransientApiError },
    );
    const { roles, practitioners } = res.data.data;
    return dedupeByPerson(
      practitioners.map((p) => {
        const role = roles.find((r) => r.practitioner?.reference === `Practitioner/${p.id}`);
        return transformToProvider(p, role);
      }),
    );
  } catch (error) {
    console.warn('Failed to fetch providers (HealthLake may be unavailable):', error);
    return [];
  }
}

export async function fetchProviderById(providerId: string): Promise<Provider | null> {
  const all = await fetchProviders();
  return all.find((p) => p.id === providerId) ?? null;
}

export async function fetchProvidersByDepartment(): Promise<{ id: string; name: string; providers: Provider[] }[]> {
  const all = await fetchProviders();
  const groups = new Map<string, Provider[]>();
  for (const provider of all) {
    const dept = provider.specialty ?? 'General';
    if (!groups.has(dept)) groups.set(dept, []);
    groups.get(dept)!.push(provider);
  }
  return Array.from(groups.entries()).map(([name, providers]) => ({
    id: name.toLowerCase().replace(/\s+/g, '-'),
    name,
    providers,
  }));
}

interface RawCondition {
  id: string;
  code?: { text?: string; coding?: { display?: string; code?: string }[] };
  clinicalStatus?: { coding?: { code?: string }[] };
  onsetDateTime?: string;
  recordedDate?: string;
  note?: { text?: string }[];
  recorder?: { reference?: string };
  asserter?: { reference?: string };
  encounter?: { reference?: string };
}

interface RawMedicationRequest {
  id: string;
  status?: string;
  authoredOn?: string;
  medicationCodeableConcept?: { text?: string; coding?: { display?: string }[] };
  medicationReference?: { display?: string };
  requester?: { reference?: string };
  encounter?: { reference?: string };
  dosageInstruction?: Array<{
    text?: string;
    timing?: {
      repeat?: { frequency?: number; period?: number; periodUnit?: string };
    };
    doseAndRate?: Array<{ doseQuantity?: { value?: number; unit?: string } }>;
  }>;
  reasonCode?: { text?: string; coding?: { display?: string }[] }[];
  reasonReference?: { reference?: string; display?: string }[];
  /** Why a stopped/cancelled prescription ended (FHIR statusReason). */
  statusReason?: { text?: string; coding?: { display?: string }[] };
  /** Dispense instructions — refill count etc. */
  dispenseRequest?: {
    numberOfRepeatsAllowed?: number;
    quantity?: { value?: number; unit?: string };
  };
}

const CLINICAL_STATUS_CODES: ClinicalStatus[] = [
  'active',
  'recurrence',
  'relapse',
  'inactive',
  'remission',
  'resolved',
];

function normaliseClinicalStatus(raw: RawCondition['clinicalStatus']): ClinicalStatus {
  const code = raw?.coding?.[0]?.code?.toLowerCase();
  if (code && (CLINICAL_STATUS_CODES as string[]).includes(code)) {
    return code as ClinicalStatus;
  }
  return 'unknown';
}

function conditionName(c: RawCondition): string {
  return (
    c.code?.text?.trim() ||
    c.code?.coding?.find((x) => x.display)?.display ||
    'Unnamed condition'
  );
}

function medicationName(m: RawMedicationRequest): string {
  return (
    m.medicationCodeableConcept?.text?.trim() ||
    m.medicationCodeableConcept?.coding?.find((x) => x.display)?.display ||
    m.medicationReference?.display ||
    'Unnamed medication'
  );
}

/**
 * Derive a human-readable dose string from a MedicationRequest.
 * Prefers structured doseQuantity; falls back to the free-text `.text`
 * field when the EHR only supplied prose.
 */
function formatDose(m: RawMedicationRequest): string | null {
  const dose = m.dosageInstruction?.[0]?.doseAndRate?.[0]?.doseQuantity;
  if (dose?.value != null) {
    const unit = dose.unit ?? '';
    return `${dose.value}${unit ? ` ${unit}` : ''}`.trim();
  }
  const text = m.dosageInstruction?.[0]?.text?.trim();
  return text || null;
}

/**
 * Derive "once daily", "twice daily", "every 8 hours", etc. from a
 * structured timing.repeat block. Returns null when the EHR didn't
 * provide structured timing.
 */
function formatFrequency(m: RawMedicationRequest): string | null {
  const repeat = m.dosageInstruction?.[0]?.timing?.repeat;
  if (!repeat) return null;
  const freq = repeat.frequency ?? 1;
  const period = repeat.period ?? 1;
  const unit = repeat.periodUnit ?? 'd';
  // Common shortcuts
  if (unit === 'd' && period === 1) {
    if (freq === 1) return 'Once daily';
    if (freq === 2) return 'Twice daily';
    if (freq === 3) return 'Three times daily';
    if (freq === 4) return 'Four times daily';
    return `${freq} times daily`;
  }
  if (unit === 'h') return `Every ${period} hour${period === 1 ? '' : 's'}`;
  if (unit === 'wk') return `${freq} time${freq === 1 ? '' : 's'} per week`;
  return `${freq}/${period}${unit}`;
}

function formatReason(m: RawMedicationRequest): string | null {
  const code = m.reasonCode?.[0];
  const byCode = code?.text || code?.coding?.find((x) => x.display)?.display;
  if (byCode) return byCode.trim();
  const ref = m.reasonReference?.[0]?.display;
  return ref ? ref.trim() : null;
}

function isFromProvider(
  recorderRef: string | undefined,
  asserterRef: string | undefined,
  requesterRef: string | undefined,
  providerRef: string,
): boolean {
  return (
    recorderRef === providerRef ||
    asserterRef === providerRef ||
    requesterRef === providerRef
  );
}

/** Extract the bare id from a FHIR reference like "Encounter/abc-123".
 *  Returns null if the reference is missing or malformed. */
function extractEncounterId(ref?: string): string | null {
  if (!ref) return null;
  const m = ref.match(/^Encounter\/([^/]+)$/);
  return m ? m[1] : null;
}

/**
 * Fetch a provider's clinical footprint for this patient: the diagnoses
 * they recorded and the medications they prescribed. Attribution is
 * widened beyond Condition.recorder / MedicationRequest.requester to
 * also include any resource tied to an Encounter where this provider
 * was the service provider or a participant. Many EHR exports only
 * tag the encounter, so without this widening the treatment tab would
 * look empty for most providers.
 */
export async function fetchProviderTreatmentPlans(
  providerId: string,
  providerName?: string,
): Promise<ProviderTreatmentPlan> {
  const [medicalRes, apptRes] = await Promise.all([
    apiClient.get<{
      success: boolean;
      data: { conditions: RawCondition[]; medications: RawMedicationRequest[] };
    }>('/v1/patients/me/medical-data'),
    apiClient
      .get<{
        success: boolean;
        data: {
          appointments: {
            id: string;
            resourceType?: 'Appointment' | 'Encounter';
            doctorName?: string;
          }[];
        };
      }>('/v1/patients/me/appointments')
      .catch(() => null),
  ]);

  const { conditions, medications } = medicalRes.data.data;
  const providerRef = `Practitioner/${providerId}`;

  // Build the set of Encounter IDs that belong to this provider so we
  // can widen the condition / medication filter to include encounter
  // attribution. Match by name (the appointments endpoint tags each
  // encounter with the provider's display name, not an ID).
  /*
   * COS-977 — an unresolved provider name must attribute NOTHING, not everything.
   *
   * This read `(!providerName || a.doctorName === providerName)`. The left half
   * is a fail-OPEN: whenever the provider's name could not be resolved, every
   * encounter passed the filter, and every condition and prescription linked to
   * any encounter was attributed to whichever doctor the patient had tapped.
   *
   * So on a provider whose name is missing — which is most of them while
   * hasData/recordCount are broken — the Treatment and Medications tabs showed
   * a patient another doctor's diagnoses under this doctor's heading. Silent,
   * plausible-looking, and wrong in the direction that matters clinically.
   *
   * With no name there is no attribution to make, so the honest answer is an
   * empty set: the tab says nothing was recorded by this provider, which is
   * what we actually know.
   */
  const providerEncounterRefs = new Set(
    !providerName
      ? []
      : (apptRes?.data?.data?.appointments ?? [])
          .filter((a) => a.resourceType === 'Encounter' && a.doctorName === providerName)
          .map((a) => `Encounter/${a.id}`),
  );

  const diagnoses: ProviderDiagnosis[] = conditions
    .filter(
      (c) =>
        isFromProvider(c.recorder?.reference, c.asserter?.reference, undefined, providerRef) ||
        (c.encounter?.reference != null && providerEncounterRefs.has(c.encounter.reference)),
    )
    .map((c) => ({
      id: c.id,
      name: conditionName(c),
      clinicalStatus: normaliseClinicalStatus(c.clinicalStatus),
      onsetDate: c.onsetDateTime ?? null,
      recordedDate: c.recordedDate ?? null,
      notes: (c.note ?? [])
        .map((n) => n.text?.trim())
        .filter((t): t is string => !!t),
      encounterId: extractEncounterId(c.encounter?.reference),
    }));

  const meds: ProviderMedication[] = medications
    .filter(
      (m) =>
        isFromProvider(undefined, undefined, m.requester?.reference, providerRef) ||
        (m.encounter?.reference != null && providerEncounterRefs.has(m.encounter.reference)),
    )
    .map((m) => {
      // Categorize inactive meds for the UI: "completed" when course finished;
      // statusReason text when provider stopped/cancelled. Active meds get null.
      const status = m.status ?? 'unknown';
      let endedReason: string | null = null;
      if (status === 'completed') {
        endedReason = 'completed';
      } else if (status === 'stopped' || status === 'cancelled') {
        endedReason =
          m.statusReason?.text?.trim() ||
          m.statusReason?.coding?.find((c) => c.display)?.display ||
          'stopped';
      }
      const refills = m.dispenseRequest?.numberOfRepeatsAllowed;
      return {
        id: m.id,
        name: medicationName(m),
        status,
        dose: formatDose(m),
        frequency: formatFrequency(m),
        authoredOn: m.authoredOn ?? null,
        reason: formatReason(m),
        encounterId: extractEncounterId(m.encounter?.reference),
        refillsRemaining: typeof refills === 'number' ? refills : null,
        endedReason,
      };
    });

  return { diagnoses, medications: meds };
}

/** @deprecated Use fetchProviderTreatmentPlans (now returns ProviderTreatmentPlan). */
export async function fetchProviderTreatmentPlansLegacy(
  providerId: string,
): Promise<TreatmentPlanItem[]> {
  const { diagnoses } = await fetchProviderTreatmentPlans(providerId);
  return diagnoses.map((d) => ({
    id: d.id,
    title: d.name,
    status: d.clinicalStatus === 'active' ? 'Active' as const : 'Completed' as const,
    date: d.recordedDate ?? '',
    diagnosis: d.name,
    description: d.notes.join('\n\n'),
    medications: [],
  }));
}

/**
 * Fetch progress notes (DiagnosticReports) attributed to this provider.
 *
 * The backend's `/reports` endpoint maps `performer` to the practitioner's
 * display name (e.g. "Dr. Patel"), not their FHIR id. Earlier code filtered
 * by id and almost never matched, leaving the tab empty. We now match by
 * name primarily and fall back to id-based matching for environments where
 * `performer` carries a "Practitioner/{id}" reference.
 *
 * `note` falls through `conclusion → title` so we never render an empty
 * card — even a report with no narrative still shows its title.
 */
export async function fetchProviderProgressNotes(
  providerId: string,
  providerName?: string,
): Promise<ProgressNote[]> {
  const res = await apiClient.get<{
    success: boolean;
    data: { reports: { id: string; title: string; date: string; performer: string; conclusion?: string }[] };
  }>('/v1/patients/me/reports');
  const matchesProvider = (performer: string | undefined): boolean => {
    if (!performer) return false;
    if (providerName && performer.toLowerCase().includes(providerName.toLowerCase())) return true;
    if (performer.includes(`Practitioner/${providerId}`)) return true;
    if (performer === providerId) return true;
    return false;
  };
  return res.data.data.reports
    .filter((r) => matchesProvider(r.performer))
    .map((r) => ({
      id: r.id,
      date: r.date?.split('T')[0] ?? '',
      time: r.date?.split('T')[1]?.substring(0, 5) ?? '',
      author: providerName ?? r.performer ?? 'Unknown',
      note: r.conclusion ?? r.title ?? 'Progress note recorded',
    }));
}

export async function fetchProviderAppointments(providerName: string): Promise<ProviderAppointment[]> {
  const res = await apiClient.get<{
    success: boolean;
    data: {
      appointments: {
        id: string;
        resourceType?: 'Appointment' | 'Encounter';
        date: string;
        time: string;
        type: string;
        status: string;
        doctorName: string;
        doctorSpecialty?: string;
        clinicName?: string;
        encounterClass?: string;
        encounterClassDisplay?: string;
        notes?: string;
        diagnosis?: string;
        normalizedStatus?: 'planned' | 'arrived' | 'in-progress' | 'finished' | 'cancelled';
        durationMinutes?: number;
        location?: string;
        cancelationReason?: string;
      }[];
    };
  }>('/v1/patients/me/appointments');
  return res.data.data.appointments
    .filter((a) => a.doctorName === providerName)
    .map((a) => ({
      id: a.id,
      resourceType: a.resourceType,
      date: a.date,
      time: a.time,
      type: a.type,
      status:
        a.status === 'fulfilled' || a.status === 'finished'
          ? ('Completed' as const)
          : a.status === 'booked'
            ? ('Confirmed' as const)
            : ('Pending' as const),
      encounterClass: a.encounterClassDisplay || a.encounterClass,
      notes: a.notes,
      diagnosis: a.diagnosis,
      clinicName: a.clinicName,
      doctorSpecialty: a.doctorSpecialty,
      normalizedStatus: a.normalizedStatus,
      durationMinutes: a.durationMinutes,
      location: a.location,
      cancelationReason: a.cancelationReason,
    }));
}

/**
 * Fetch allergies for a patient, optionally filtered by recorder practitioner.
 */
export async function fetchProviderAllergies(providerId?: string): Promise<Allergy[]> {
  try {
    const res = await apiClient.get<{ success: boolean; data: Allergy[] }>('/v1/patients/me/allergies');
    const allergies = res.data.data ?? [];
    if (!providerId) return allergies;
    const providerRef = `Practitioner/${providerId}`;
    return allergies.filter((a) => !a.recorderRef || a.recorderRef === providerRef);
  } catch {
    return [];
  }
}

/**
 * Fetch care plans for a patient.
 */
export async function fetchCarePlans(): Promise<CarePlanItem[]> {
  try {
    const res = await apiClient.get<{ success: boolean; data: CarePlanItem[] }>('/v1/patients/me/care-plans');
    return res.data.data ?? [];
  } catch {
    return [];
  }
}

/**
 * Fetch devices (implants) for a patient.
 */
export async function fetchDevices(): Promise<DeviceItem[]> {
  try {
    const res = await apiClient.get<{ success: boolean; data: DeviceItem[] }>('/v1/patients/me/devices');
    return res.data.data ?? [];
  } catch {
    return [];
  }
}

/**
 * Fetch lab reports with resolved Observation values, optionally filtered by performer.
 *
 * Lenient variant used by legacy callers — swallows errors and returns [] so a
 * transient HealthLake failure doesn't blank the Providers tab. New code paths
 * (e.g. useLabs on the Plan/Health Summary surface) should call
 * `fetchProviderLabReportsStrict` instead so react-query can surface the error
 * state and drive retries — same pattern as patient.ts.
 */
export async function fetchProviderLabReports(providerId?: string): Promise<LabReport[]> {
  try {
    return await fetchProviderLabReportsStrict(providerId);
  } catch {
    return [];
  }
}

/**
 * Strict variant: propagates errors to the caller so react-query can render
 * an error state and retry, instead of showing a misleading empty labs list.
 */
export async function fetchProviderLabReportsStrict(providerId?: string): Promise<LabReport[]> {
  const res = await apiClient.get<{ success: boolean; data: LabReport[] }>('/v1/patients/me/lab-reports');
  const reports = res.data.data ?? [];
  if (!providerId) return reports;
  const providerRef = `Practitioner/${providerId}`;
  return reports.filter((r) => !r.performerRef || r.performerRef === providerRef || r.performerRef.includes(providerId));
}

/**
 * Fetch AI-generated insight for a specific doctor detail tab.
 * Passing providerId scopes the LLM context to a single practitioner so
 * the summary doesn't blend care from other providers into the narrative.
 */
export async function fetchAiInsight(
  tab: 'treatment' | 'progress' | 'appointments' | 'carePlans',
  providerName?: string,
  providerId?: string,
): Promise<{ summary: string; generatedAt: string; empty?: boolean } | null> {
  try {
    const res = await apiClient.post<{
      success: boolean;
      data: { summary: string; generatedAt: string; empty?: boolean };
    }>('/v1/patients/me/ai-insights', { tab, providerName, providerId });
    return res.data.data ?? null;
  } catch {
    return null;
  }
}

import { apiClient } from '@/lib/api-client';
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
  };
}

export async function fetchProviders(): Promise<Provider[]> {
  try {
    const res = await apiClient.get<{
      success: boolean;
      data: { roles: FhirPractitionerRole[]; practitioners: FhirPractitioner[] };
    }>('/v1/patients/me/providers');
    const { roles, practitioners } = res.data.data;
    return practitioners.map((p) => {
      const role = roles.find((r) => r.practitioner?.reference === `Practitioner/${p.id}`);
      return transformToProvider(p, role);
    });
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
}

interface RawMedicationRequest {
  id: string;
  status?: string;
  authoredOn?: string;
  medicationCodeableConcept?: { text?: string; coding?: { display?: string }[] };
  medicationReference?: { display?: string };
  requester?: { reference?: string };
  dosageInstruction?: Array<{
    text?: string;
    timing?: {
      repeat?: { frequency?: number; period?: number; periodUnit?: string };
    };
    doseAndRate?: Array<{ doseQuantity?: { value?: number; unit?: string } }>;
  }>;
  reasonCode?: { text?: string; coding?: { display?: string }[] }[];
  reasonReference?: { reference?: string; display?: string }[];
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

/**
 * Fetch a provider's clinical footprint for this patient: the diagnoses
 * they recorded and the medications they prescribed. Strictly scoped —
 * resources without a recorder / requester reference back to this
 * provider are NOT shown here (they may still surface on the patient's
 * global Conditions / Medications pages). This prevents mixing care
 * across providers on a single doctor's detail screen.
 */
export async function fetchProviderTreatmentPlans(
  providerId: string,
): Promise<ProviderTreatmentPlan> {
  const res = await apiClient.get<{
    success: boolean;
    data: { conditions: RawCondition[]; medications: RawMedicationRequest[] };
  }>('/v1/patients/me/medical-data');

  const { conditions, medications } = res.data.data;
  const providerRef = `Practitioner/${providerId}`;

  const diagnoses: ProviderDiagnosis[] = conditions
    .filter((c) =>
      isFromProvider(c.recorder?.reference, c.asserter?.reference, undefined, providerRef),
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
    }));

  const meds: ProviderMedication[] = medications
    .filter((m) => isFromProvider(undefined, undefined, m.requester?.reference, providerRef))
    .map((m) => ({
      id: m.id,
      name: medicationName(m),
      status: m.status ?? 'unknown',
      dose: formatDose(m),
      frequency: formatFrequency(m),
      authoredOn: m.authoredOn ?? null,
      reason: formatReason(m),
    }));

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

export async function fetchProviderProgressNotes(providerId: string): Promise<ProgressNote[]> {
  const res = await apiClient.get<{
    success: boolean;
    data: { reports: { id: string; title: string; date: string; performer: string; conclusion?: string }[] };
  }>('/v1/patients/me/reports');
  return res.data.data.reports
    .filter((r) => r.performer?.includes(providerId) || r.performer?.includes(`Practitioner/${providerId}`))
    .map((r) => ({
      id: r.id,
      date: r.date?.split('T')[0] ?? '',
      time: r.date?.split('T')[1]?.substring(0, 5) ?? '',
      author: r.performer ?? 'Unknown',
      note: r.conclusion ?? r.title,
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
 */
export async function fetchProviderLabReports(providerId?: string): Promise<LabReport[]> {
  try {
    const res = await apiClient.get<{ success: boolean; data: LabReport[] }>('/v1/patients/me/lab-reports');
    const reports = res.data.data ?? [];
    if (!providerId) return reports;
    const providerRef = `Practitioner/${providerId}`;
    return reports.filter((r) => !r.performerRef || r.performerRef === providerRef || r.performerRef.includes(providerId));
  } catch {
    return [];
  }
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

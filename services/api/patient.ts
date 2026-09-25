import { apiClient } from '@/lib/api-client';
import type { Patient, Medication, MedicationSummary } from './types';

interface FhirPatientResource {
  id: string;
  name?: Array<{ given?: string[]; family?: string; text?: string; prefix?: string[] }>;
  telecom?: Array<{ system?: string; value?: string }>;
  birthDate?: string;
  gender?: string;
  address?: Array<{ line?: string[]; city?: string; state?: string; postalCode?: string; country?: string }>;
  maritalStatus?: { text?: string };
  contact?: Array<{
    name?: { text?: string };
    relationship?: Array<{ text?: string }>;
    telecom?: Array<{ system?: string; value?: string }>;
  }>;
}

function mapToPatient(r: FhirPatientResource): Patient {
  const name = r.name?.[0];
  const firstName = name?.given?.[0] ?? '';
  const lastName = name?.family ?? '';
  const fullName = name?.text ?? [firstName, lastName].filter(Boolean).join(' ');
  const addr = r.address?.[0];
  const ec = r.contact?.[0];
  return {
    id: r.id,
    name: fullName,
    firstName,
    lastName,
    email: r.telecom?.find((t) => t.system === 'email')?.value,
    phone: r.telecom?.find((t) => t.system === 'phone')?.value,
    dateOfBirth: r.birthDate,
    gender: r.gender,
    address: addr?.line?.join(', '),
    city: addr?.city,
    state: addr?.state,
    zipCode: addr?.postalCode,
    country: addr?.country,
    maritalStatus: r.maritalStatus?.text,
    emergencyContact: ec ? {
      name: ec.name?.text,
      relationship: ec.relationship?.[0]?.text,
      phone: ec.telecom?.find((t) => t.system === 'phone')?.value,
    } : undefined,
  };
}

/**
 * Fetch patient info. Tries HealthLake first (/patients/me), then falls back
 * to patientDetails from DynamoDB via /auth/me (populated by the webhook).
 */
export async function fetchPatientInfo(): Promise<Patient | null> {
  // Always fetch /auth/me to get photoUrl and DynamoDB data
  let meData: { sub: string; email?: string; photoUrl?: string; patientDetails?: Record<string, string> } | null = null;
  try {
    const meRes = await apiClient.get('/v1/auth/me');
    meData = meRes.data?.data ?? null;
  } catch {
    // Continue — will try HealthLake
  }

  // Try HealthLake FHIR Patient first
  try {
    const res = await apiClient.get<{ success: boolean; data: FhirPatientResource }>('/v1/patients/me');
    const patient = mapToPatient(res.data.data);
    // Merge photoUrl from /auth/me into HealthLake patient
    if (patient.name) {
      patient.photoUrl = meData?.photoUrl ?? undefined;
      patient.email = patient.email || meData?.email || meData?.patientDetails?.email;
      return patient;
    }
  } catch {
    // HealthLake may be unavailable — fall back to DynamoDB
  }

  // Fallback: use patientDetails from /auth/me
  if (meData?.patientDetails) {
    const pd = meData.patientDetails;
    return {
      id: meData.sub,
      name: pd.fullName ?? ([pd.firstName, pd.lastName].filter(Boolean).join(' ') || ''),
      firstName: pd.firstName,
      lastName: pd.lastName,
      email: pd.email ?? meData.email,
      phone: pd.phone,
      dateOfBirth: pd.dateOfBirth,
      gender: pd.gender,
      address: pd.address,
      city: pd.city,
      state: pd.state,
      zipCode: pd.postalCode,
      photoUrl: meData.photoUrl ?? undefined,
    };
  }

  try {
    // Last resort — return null
    return null;
  } catch {
    return null;
  }
}

export async function fetchMedications(): Promise<Medication[]> {
  // Errors intentionally propagate so React Query's isError fires for the
  // MedicationsByConditionSection consumer. Do NOT re-add a try/catch that
  // returns [] — it masks 5xx/network failures as empty success.
  const res = await apiClient.get<{
    success: boolean;
    data: {
      conditions: unknown[];
      medications: Array<{
        medicationCodeableConcept?: { text?: string };
        dosageInstruction?: Array<{
          text?: string;
          timing?: { repeat?: { frequency?: number; period?: number; periodUnit?: string } };
        }>;
        reasonCode?: Array<{ text?: string }>;
        // COS-1041 — always present on the wire; this mapper just never read it.
        status?: string;
        authoredOn?: string;
        // COS-1109 — recognises a finished one-off course. See types.ts.
        dispenseRequest?: { numberOfRepeatsAllowed?: number };
      }>;
    };
  }>('/v1/patients/me/medical-data');
  return res.data.data.medications.map((m) => {
    const dosage = m.dosageInstruction?.[0];
    const timing = dosage?.timing?.repeat;
    /*
     * COS-1109 — `frequency` must NOT fall back to the sig text.
     *
     * Both fields were assigned `dosageInstruction[0].text`, and MedRow renders
     * them as `[dosage, frequency].join(' • ')`. So every row on the Health
     * Status card printed its instructions twice, separated by a bullet:
     *   "Take 1 capsule by mouth Daily. • Take 1 capsule by mouth Daily."
     * On rows whose sig carries the EHR's "Historical Med" annotation that read
     * as four lines of near-identical text per medication.
     *
     * The sig text belongs to `dosage`. `frequency` is only ever the STRUCTURED
     * timing, and stays empty when the EHR sent none — an empty half renders as
     * nothing, which is correct, rather than as a duplicate.
     */
    const frequency = timing
      ? `${timing.frequency ?? 1}x per ${timing.period ?? 1} ${timing.periodUnit ?? 'day'}`
      : '';
    return {
      name: m.medicationCodeableConcept?.text ?? 'Unknown',
      dosage: dosage?.text ?? '',
      frequency,
      purpose: m.reasonCode?.[0]?.text ?? '',
      status: m.status,
      authoredOn: m.authoredOn ?? null,
      dispenseRequest: m.dispenseRequest ?? null,
    };
  });
}

/**
 * Fetch medications with structured dose/frequency. By default returns
 * only currently active meds prescribed within the last 6 months. Pass
 * `{ includePast: true }` to also receive historical (stopped /
 * completed / cancelled) entries — used by the Medications tab which
 * tags active vs past.
 */
export async function fetchMedicationsSummary(
  opts: { includePast?: boolean } = {},
): Promise<MedicationSummary[]> {
  try {
    const url = opts.includePast
      ? '/v1/patients/me/medications?includePast=true'
      : '/v1/patients/me/medications';
    const res = await apiClient.get<{
      success: boolean;
      data: { medications: MedicationSummary[] };
    }>(url);
    return res.data.data.medications;
  } catch {
    return [];
  }
}

/**
 * COS-1133 — Ken's biopsychosocial summary of the Health Trends page.
 *
 * POST, because the biometric half travels in the body: raw HealthKit values
 * deliberately never reach the backend, so the digest is built on the device
 * from the trends already on screen.
 */
export interface TrendBiometricDigest {
  system: string;
  lines: string[];
}

export interface HealthTrendSummaryResult {
  summary: string;
  generatedAt: string;
  notMeasured: string[];
}

export async function fetchHealthTrendSummary(
  biometrics: TrendBiometricDigest[],
): Promise<HealthTrendSummaryResult> {
  const res = await apiClient.post<{ data: HealthTrendSummaryResult }>(
    '/v1/patients/me/health-trend-summary',
    { biometrics },
  );
  const d = res.data?.data;
  return {
    summary: d?.summary ?? '',
    generatedAt: d?.generatedAt ?? '',
    notMeasured: Array.isArray(d?.notMeasured) ? d.notMeasured : [],
  };
}

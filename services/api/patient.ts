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
  try {
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
      }>;
    };
  }>('/v1/patients/me/medical-data');
  return res.data.data.medications.map((m) => {
    const dosage = m.dosageInstruction?.[0];
    const timing = dosage?.timing?.repeat;
    let frequency = dosage?.text ?? '';
    if (!frequency && timing) {
      frequency = `${timing.frequency ?? 1}x per ${timing.period ?? 1} ${timing.periodUnit ?? 'day'}`;
    }
    return {
      name: m.medicationCodeableConcept?.text ?? 'Unknown',
      dosage: dosage?.text ?? '',
      frequency,
      purpose: m.reasonCode?.[0]?.text ?? '',
    };
  });
  } catch {
    return [];
  }
}

/**
 * Fetch currently active medications with structured dose/frequency.
 */
export async function fetchMedicationsSummary(): Promise<MedicationSummary[]> {
  try {
    const res = await apiClient.get<{
      success: boolean;
      data: { medications: MedicationSummary[] };
    }>('/v1/patients/me/medications');
    return res.data.data.medications;
  } catch {
    return [];
  }
}

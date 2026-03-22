import { apiClient } from '@/lib/api-client';
import type { Patient, Medication } from './types';

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

export async function fetchPatientInfo(): Promise<Patient | null> {
  try {
    const res = await apiClient.get<{ success: boolean; data: FhirPatientResource }>('/v1/patients/me');
    return mapToPatient(res.data.data);
  } catch {
    return null;
  }
}

export async function fetchMedications(): Promise<Medication[]> {
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
}

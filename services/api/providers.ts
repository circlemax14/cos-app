import { apiClient } from '@/lib/api-client';
import type { Provider, TreatmentPlanItem, ProgressNote, ProviderAppointment } from './types';

interface FhirName {
  given?: string[];
  family?: string;
  text?: string;
  prefix?: string[];
}

interface FhirPractitioner {
  id: string;
  name?: FhirName[];
  telecom?: Array<{ system?: string; value?: string }>;
  qualification?: Array<{ code?: { text?: string; coding?: Array<{ display?: string }> } }>;
}

interface FhirPractitionerRole {
  practitioner?: { reference?: string };
  specialty?: Array<{ text?: string; coding?: Array<{ display?: string }> }>;
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
  return {
    id: practitioner.id,
    name: buildName(practitioner.name),
    qualifications: extractQualifications(practitioner),
    specialty: extractSpecialty(role),
    phone: extractContact(practitioner, 'phone'),
    email: extractContact(practitioner, 'email'),
  };
}

export async function fetchProviders(): Promise<Provider[]> {
  const res = await apiClient.get<{
    success: boolean;
    data: { roles: FhirPractitionerRole[]; practitioners: FhirPractitioner[] };
  }>('/v1/patients/me/providers');
  const { roles, practitioners } = res.data.data;
  return practitioners.map((p) => {
    const role = roles.find((r) => r.practitioner?.reference === `Practitioner/${p.id}`);
    return transformToProvider(p, role);
  });
}

export async function fetchProviderById(providerId: string): Promise<Provider | null> {
  const all = await fetchProviders();
  return all.find((p) => p.id === providerId) ?? null;
}

export async function fetchProvidersByDepartment(): Promise<Array<{ id: string; name: string; providers: Provider[] }>> {
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

export async function fetchProviderTreatmentPlans(providerId: string): Promise<TreatmentPlanItem[]> {
  const res = await apiClient.get<{
    success: boolean;
    data: {
      conditions: Array<{
        id: string;
        code?: { text?: string };
        clinicalStatus?: { coding?: Array<{ code?: string }> };
        recordedDate?: string;
        note?: Array<{ text?: string }>;
        recorder?: { reference?: string };
        asserter?: { reference?: string };
      }>;
      medications: Array<{
        medicationCodeableConcept?: { text?: string };
        requester?: { reference?: string };
      }>;
    };
  }>('/v1/patients/me/medical-data');
  const { conditions, medications } = res.data.data;
  const providerRef = `Practitioner/${providerId}`;
  const filtered = conditions.filter(
    (c) => c.recorder?.reference === providerRef || c.asserter?.reference === providerRef || (!c.recorder?.reference && !c.asserter?.reference),
  );
  const medNames = medications
    .filter((m) => m.requester?.reference === providerRef || !m.requester?.reference)
    .map((m) => m.medicationCodeableConcept?.text)
    .filter((n): n is string => !!n);
  return filtered.map((c) => ({
    id: c.id,
    title: c.code?.text ?? 'Unknown Condition',
    status: c.clinicalStatus?.coding?.[0]?.code === 'active' ? 'Active' as const : 'Completed' as const,
    date: c.recordedDate ?? '',
    diagnosis: c.code?.text ?? '',
    description: c.note?.[0]?.text ?? '',
    medications: medNames,
  }));
}

export async function fetchProviderProgressNotes(providerId: string): Promise<ProgressNote[]> {
  const res = await apiClient.get<{
    success: boolean;
    data: { reports: Array<{ id: string; title: string; date: string; performer: string; conclusion?: string }> };
  }>('/v1/patients/me/reports');
  return res.data.data.reports
    .filter((r) => r.performer?.toLowerCase().includes(providerId.toLowerCase()))
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
    data: { appointments: Array<{ id: string; date: string; time: string; type: string; status: string; doctorName: string }> };
  }>('/v1/patients/me/appointments');
  return res.data.data.appointments
    .filter((a) => a.doctorName === providerName)
    .map((a) => ({
      id: a.id,
      date: a.date,
      time: a.time,
      type: a.type,
      status: a.status === 'fulfilled' ? 'Completed' as const : a.status === 'booked' ? 'Confirmed' as const : 'Pending' as const,
    }));
}

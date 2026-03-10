import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

// ─── Types (mirror backend FHIR types for app consumption) ─────────────────

export interface PatientInfo {
  resourceType: 'Patient';
  id: string;
  name?: Array<{ given?: string[]; family?: string }>;
  birthDate?: string;
  gender?: string;
  address?: Array<{ line?: string[]; city?: string; state?: string }>;
  telecom?: Array<{ system?: string; value?: string }>;
}

export interface Provider {
  id: string;
  name?: Array<{ text?: string; given?: string[]; family?: string }>;
  specialty?: string;
}

export interface Clinic {
  id: string;
  name?: string;
  address?: Array<{ line?: string[]; city?: string; state?: string }>;
  telecom?: Array<{ system?: string; value?: string }>;
}

export interface EmergencyContact {
  id: string;
  name?: Array<{ given?: string[]; family?: string }>;
  relationship?: Array<{ text?: string }>;
  telecom?: Array<{ system?: string; value?: string }>;
}

export interface MedicalData {
  conditions: Array<{ id: string; code?: { text?: string }; clinicalStatus?: { text?: string } }>;
  medications: Array<{ id: string; medicationCodeableConcept?: { text?: string }; status?: string }>;
}

export interface LabData {
  observations: Array<{ id: string; code?: { text?: string }; valueQuantity?: { value?: number; unit?: string } }>;
  reports: Array<{ id: string; code?: { text?: string }; status?: string; effectiveDateTime?: string }>;
}

export interface CareTeam {
  id: string;
  participant?: Array<{ member?: { reference?: string; display?: string }; role?: Array<{ text?: string }> }>;
}

// ─── Hooks ──────────────────────────────────────────────────────────────────

export function usePatientInfo() {
  return useQuery<PatientInfo>({
    queryKey: ['patient', 'me'],
    queryFn: async () => {
      const res = await apiClient.get<{ success: boolean; data: PatientInfo }>('/v1/patients/me');
      return res.data.data;
    },
    staleTime: 10 * 60 * 1000,
  });
}

export function useProviders() {
  return useQuery<{ roles: unknown[]; practitioners: Provider[] }>({
    queryKey: ['patient', 'providers'],
    queryFn: async () => {
      const res = await apiClient.get('/v1/patients/me/providers');
      return res.data.data;
    },
    staleTime: 10 * 60 * 1000,
  });
}

export function useClinics() {
  return useQuery<Clinic[]>({
    queryKey: ['patient', 'clinics'],
    queryFn: async () => {
      const res = await apiClient.get('/v1/patients/me/clinics');
      return res.data.data;
    },
    staleTime: 10 * 60 * 1000,
  });
}

export function useEmergencyContacts() {
  return useQuery<EmergencyContact[]>({
    queryKey: ['patient', 'emergency-contacts'],
    queryFn: async () => {
      const res = await apiClient.get('/v1/patients/me/emergency-contacts');
      return res.data.data;
    },
    staleTime: 10 * 60 * 1000,
  });
}

export function useMedicalData() {
  return useQuery<MedicalData>({
    queryKey: ['patient', 'medical-data'],
    queryFn: async () => {
      const res = await apiClient.get('/v1/patients/me/medical-data');
      return res.data.data;
    },
    staleTime: 10 * 60 * 1000,
  });
}

export function useLabData() {
  return useQuery<LabData>({
    queryKey: ['patient', 'labs'],
    queryFn: async () => {
      const res = await apiClient.get('/v1/patients/me/labs');
      return res.data.data;
    },
    staleTime: 10 * 60 * 1000,
  });
}

export function useCareCircle() {
  return useQuery<CareTeam>({
    queryKey: ['patient', 'care-circle'],
    queryFn: async () => {
      const res = await apiClient.get('/v1/patients/me/care-circle');
      return res.data.data;
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useAddToCareCircle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { participantReference: string; roleDisplay?: string }) =>
      apiClient.post('/v1/patients/me/care-circle', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['patient', 'care-circle'] });
    },
  });
}

export function useRemoveFromCareCircle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (participantReference: string) => {
      const encoded = btoa(participantReference);
      return apiClient.delete(`/v1/patients/me/care-circle/${encoded}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['patient', 'care-circle'] });
    },
  });
}

export function useFastenStatus() {
  return useQuery<{ connected: boolean; dataReady: boolean }>({
    queryKey: ['fasten', 'status'],
    queryFn: async () => {
      const res = await apiClient.get('/v1/fasten/status');
      return res.data.data;
    },
    refetchInterval: (query) => {
      // Poll every 10 seconds if connected but data not ready yet
      const data = query.state.data;
      if (data?.connected && !data.dataReady) return 10_000;
      return false;
    },
  });
}

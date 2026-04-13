// ─── Provider ────────────────────────────────────────────────────────────────
export interface Provider {
  id: string;
  name: string;
  qualifications?: string;
  specialty?: string;
  image?: number | { uri: string };
  photoUrl?: string;
  phone?: string;
  email?: string;
  category?: string;
  subCategory?: string;
  subCategories?: string[];
  lastVisited?: string;
}

// ─── Report ──────────────────────────────────────────────────────────────────
export interface Report {
  id: string;
  title: string;
  category: string;
  provider: string;
  date: string;
  status: 'Available' | 'Pending' | 'Completed';
  description?: string;
  fileType?: string;
  exam?: string;
  clinicalHistory?: string;
  technique?: string;
  findings?: string;
  impression?: string;
  interpretedBy?: string;
  signedBy?: string;
  signedOn?: string;
  accessionNumber?: string;
  orderNumber?: string;
  performingFacility?: {
    name: string;
    address: string;
    city: string;
    state: string;
    zip: string;
    phone?: string;
  };
}

// ─── Appointment ─────────────────────────────────────────────────────────────
export interface Appointment {
  id: string;
  resourceType?: 'Appointment' | 'Encounter';
  date: string;
  time: string;
  endTime?: string;
  endDate?: string;
  type: string;
  status: string;
  doctorName: string;
  doctorSpecialty?: string;
  clinicName?: string;
  encounterClass?: string;
  encounterClassDisplay?: string;
  notes?: string;
  diagnosis?: string;
  participantStatus?: string;
}

// ─── Patient ─────────────────────────────────────────────────────────────────
export interface Patient {
  id: string;
  name: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  dateOfBirth?: string;
  gender?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
  maritalStatus?: string;
  photoUrl?: string;
  emergencyContact?: {
    name?: string;
    relationship?: string;
    phone?: string;
  };
}

// ─── Doctor Detail types ─────────────────────────────────────────────────────
export interface TreatmentPlanItem {
  id: string;
  title: string;
  status: 'Active' | 'Completed';
  date: string;
  diagnosis: string;
  description: string;
  medications: string[];
}

export interface ProgressNote {
  id: string;
  date: string;
  time: string;
  author: string;
  note: string;
}

export interface ProviderAppointment {
  id: string;
  date: string;
  time: string;
  type: string;
  status: 'Confirmed' | 'Pending' | 'Completed';
}

// ─── Medication ──────────────────────────────────────────────────────────────
export interface Medication {
  name: string;
  dosage: string;
  frequency: string;
  purpose: string;
}

// ─── Health Plan ─────────────────────────────────────────────────────────────
export interface HealthPlan {
  careManagerPlan: {
    goals: {
      id: string;
      title: string;
      description: string;
      status: 'active' | 'completed' | 'cancelled';
    }[];
    notes: string;
    updatedAt: string;
    updatedBy: string;
  } | null;
  aiInsights: {
    summary: string;
    recommendations: {
      category: string;
      text: string;
      priority: 'high' | 'medium' | 'low';
    }[];
    generatedAt: string;
    nextRefreshAvailableAt: string;
  } | null;
}

// ─── Clinic ──────────────────────────────────────────────────────────────────
export interface Clinic {
  id: string;
  name: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  phone?: string;
  email?: string;
}

// ─── Allergy ─────────────────────────────────────────────────────────────────
export interface Allergy {
  id: string;
  name: string;
  category?: string;
  criticality?: string;
  clinicalStatus?: string;
  verificationStatus?: string;
  onsetDate?: string;
  recordedDate?: string;
  recorderRef?: string;
  reactions: { description?: string; manifestations: string[]; severity?: string }[];
}

// ─── Care Plan ───────────────────────────────────────────────────────────────
export interface CarePlanItem {
  id: string;
  status?: string;
  intent?: string;
  category?: string;
  conditions: string[];
  activities: { kind?: string; status?: string; scheduledStart?: string; scheduledEnd?: string; description?: string }[];
  textSummary?: string;
}

// ─── Device ──────────────────────────────────────────────────────────────────
export interface DeviceItem {
  id: string;
  name: string;
  status?: string;
  modelNumber?: string;
  serialNumber?: string;
  lotNumber?: string;
  expirationDate?: string;
  location?: string;
  site?: string;
  laterality?: string;
  notes: string[];
  noteAuthorRef?: string;
}

// ─── Lab Report ──────────────────────────────────────────────────────────────
export interface LabResultValue {
  name: string;
  value?: string;
  unit?: string;
  referenceRange?: string;
  interpretation?: string;
}

export interface LabReport {
  id: string;
  name: string;
  date?: string;
  status?: string;
  performerName?: string;
  performerRef?: string;
  organizationName?: string;
  results: LabResultValue[];
}

// ─── Service ─────────────────────────────────────────────────────────────────
export interface ServiceDefinition {
  id: string;
  title: string;
  description: string;
  featureKey: string;
  priceLabel: string;
  isToggle?: boolean;
}

// ─── Recommended Appointment ─────────────────────────────────────────────────
export interface RecommendedAppointment {
  id: string;
  sourceType: 'service_request' | 'care_plan' | 'encounter_pattern' | 'nlp_extraction';
  title: string;
  reason: string;
  appointmentType: string;
  specialty?: string;
  recommendedByDate: string;
  recommendedInterval?: string;
  urgency: 'routine' | 'soon' | 'urgent';
  recommendedProviderName?: string;
  relatedCondition?: string;
  status: 'pending' | 'reminded' | 'scheduled' | 'completed' | 'dismissed';
  generatedAt: string;
}

// ─── Encounter Narrative ─────────────────────────────────────────────────────
export interface EncounterNarrative {
  summary: string;
  keyFindings: string[];
  followUps: string[];
  context: string;
  generatedAt: string;
}

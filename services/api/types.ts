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
export type ClinicalStatus = 'active' | 'recurrence' | 'relapse' | 'inactive' | 'remission' | 'resolved' | 'unknown';

export interface ProviderDiagnosis {
  id: string;
  name: string;
  clinicalStatus: ClinicalStatus;
  onsetDate: string | null;
  recordedDate: string | null;
  notes: string[];
  /** Encounter ID this diagnosis was attached to in the EHR, if known.
   *  Extracted from FHIR `Condition.encounter.reference` ("Encounter/{id}").
   *  Used by the timeline view to bucket diagnoses by visit. */
  encounterId: string | null;
}

export interface ProviderMedication {
  id: string;
  name: string;
  status: string;
  dose: string | null;
  frequency: string | null;
  authoredOn: string | null;
  reason: string | null;
  /** Encounter ID this prescription was authored at, if known.
   *  Extracted from FHIR `MedicationRequest.encounter.reference`.
   *  Used by the timeline view to bucket meds by visit. */
  encounterId: string | null;
}

/**
 * Combined view of a single provider's clinical footprint: the diagnoses
 * they recorded and the medications they prescribed. Replaces the legacy
 * TreatmentPlanItem which duplicated the same med list on every diagnosis.
 */
export interface ProviderTreatmentPlan {
  diagnoses: ProviderDiagnosis[];
  medications: ProviderMedication[];
}

/** @deprecated Retained only for the legacy card path; use ProviderTreatmentPlan. */
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
  /**
   * Underlying FHIR resource kind. `Encounter` entries support an
   * AI-generated "Explain this visit" narrative pulled from
   * `/v1/patients/me/encounters/:id/narrative`.
   */
  resourceType?: 'Appointment' | 'Encounter';
  /** Inpatient / outpatient / emergency (Encounter-only). */
  encounterClass?: string;
  /** Free-text visit notes or reason captured by the EHR. */
  notes?: string;
  /** Primary diagnosis surfaced from the encounter. */
  diagnosis?: string;
  /** Clinic / facility that hosted the visit. */
  clinicName?: string;
  /** Provider specialty, when the EHR tagged it. */
  doctorSpecialty?: string;
}

// ─── Treatment Timeline (view layer) ────────────────────────────────────────
export type TimelineEventKind =
  | 'medication-added'
  | 'diagnosis-resolved'
  | 'diagnosis-recorded';

/** A single row inside an `EncounterGroup`. Either a medication that was
 *  added/changed at the encounter, or a diagnosis whose state was set. */
export interface TimelineEvent {
  id: string;
  kind: TimelineEventKind;
  /** Display title — med name or diagnosis name. */
  title: string;
  /** Optional secondary line — dose+frequency for meds, status pill text
   *  for diagnoses, free-text otherwise. */
  subtitle: string | null;
  /** "for High Cholesterol" — only for medications with a linked reason. */
  reasonText: string | null;
}

/** A bucket of timeline events tied to one encounter (or the trailing
 *  "Earlier" bucket for items with no encounter attribution). */
export interface EncounterGroupView {
  /** Stable id — encounter id, or "earlier" for the trailing bucket. */
  id: string;
  /** Header date string ("APR 12") or "EARLIER". `null` for the trailing
   *  earlier bucket means "no date header below the headline". */
  dateLabel: string | null;
  /** Header type string ("ANNUAL PHYSICAL"). `null` if unknown. */
  typeLabel: string | null;
  events: TimelineEvent[];
}

/** Output of `groupTreatmentByEncounter` — feeds the redesigned tab. */
export interface TreatmentTimeline {
  /** Diagnoses with `clinicalStatus` in ['active','recurrence','relapse']. */
  activeConditions: ProviderDiagnosis[];
  /** Diagnoses with `clinicalStatus` in ['resolved','remission','inactive']. */
  resolvedConditions: ProviderDiagnosis[];
  /** Reverse-chronological encounter groups. Trailing entry has id 'earlier'
   *  if any items lacked encounter attribution. */
  encounterGroups: EncounterGroupView[];
}

// ─── Medication ──────────────────────────────────────────────────────────────
export interface Medication {
  name: string;
  dosage: string;
  frequency: string;
  purpose: string;
}

/** Richer medication from /v1/patients/me/medications */
export interface MedicationSummary {
  id: string;
  name: string;
  status: string;
  dosage: string;
  frequency: string;
  authoredOn: string | null;
  doseValue: number | null;
  doseUnit: string | null;
  rawDosageText: string | null;
}

// ─── AI Health Plan + Tasks ──────────────────────────────────────────────
export type TaskType = 'medication' | 'exercise' | 'appointment' | 'reminder';
export type TaskRecurrence = 'daily' | 'weekdays' | 'weekly' | 'once';
export type TaskStatus = 'pending' | 'completed' | 'skipped';

export interface PlanTask {
  id: string;
  type: TaskType;
  title: string;
  description: string;
  /** HH:MM 24-hour local time */
  scheduledTime: string;
  recurrence: TaskRecurrence;
  /** ISO date YYYY-MM-DD */
  startDate: string;
  endDate?: string;
  daysOfWeek?: number[];
  metadata?: {
    medicationName?: string;
    dosage?: string;
    durationMinutes?: number;
    relatedConditionFhirId?: string;
  };
  source: 'ai' | 'care_manager';
}

export interface AiPlanGoal {
  id: string;
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
}

export interface AiHealthPlan {
  version: number;
  summary: string;
  goals: AiPlanGoal[];
  tasks: PlanTask[];
  sourceDataHash: string;
  generatedAt: string;
  provider: 'bedrock' | 'openai';
}

/** Task + completion state for a specific date. */
export interface TaskOccurrence extends PlanTask {
  scheduledFor: string;
  status: TaskStatus;
  completedAt?: string;
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

// ─── Care Gap ─────────────────────────────────────────────────────────────────
export interface CareGap {
  id: string;
  gapType: string;
  title: string;
  description: string;
  relatedConditions: Array<{ name: string; fhirId: string }>;
  guidelineSource?: string;
  evidenceSummary: string;
  priority: 'high' | 'medium' | 'low';
  overdueDays?: number;
  detectedBy: 'rule_engine' | 'ai_analysis';
  status: 'open' | 'addressed' | 'deferred' | 'resolved';
  detectedAt: string;
}

export interface CareGapExplanation {
  explanation: string;
  risk: string;
  action: string;
  generatedAt: string;
}

// ─── Health Trends ────────────────────────────────────────────────────────────

export interface TrendDataPoint {
  date: string;
  value: number;
  unit: string;
  encounterId?: string;
  referenceRange?: { low: number; high: number };
  interpretation?: 'normal' | 'high' | 'low' | 'critical';
}

export interface LongitudinalTrend {
  id: string;
  metricCode: string;
  metricName: string;
  category: 'lab' | 'vital' | 'score';
  dataPoints: TrendDataPoint[];
  trendDirection: 'improving' | 'worsening' | 'stable' | 'insufficient_data';
  trendPercentage?: number;
  trendPeriod: string;
  relatedConditions: string[];
  relatedMedications: string[];
}

export interface TrendExplanation {
  explanation: string;
  factors: string[];
  recommendation: string;
  generatedAt: string;
}

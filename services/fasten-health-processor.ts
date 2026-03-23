/**
 * Fasten Health Data Processor
 * 
 * This service processes raw FHIR data from Fasten Health and transforms it into
 * a structured format that's compatible with the app views.
 * 
 * Designed to be API-ready: This processor is stateless and can be easily moved
 * to a backend API service. It takes raw data as input and returns processed data.
 * 
 * Features:
 * - Handles multiple clinics
 * - Handles multiple patients
 * - Groups data by clinic and patient
 * - Generates meaningful, structured JSON output
 */

// ============================================================================
// Type Definitions
// ============================================================================

export interface ProcessedClinic {
  id: string;
  name: string;
  identifier?: string;
  address?: {
    line?: string[];
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
  };
  phone?: string;
  email?: string;
  type: 'clinic' | 'lab'; // Type of organization
}

export interface ProcessedLab {
  id: string;
  name: string;
  identifier?: string;
  address?: {
    line?: string[];
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
  };
  phone?: string;
  email?: string;
}

export interface ProcessedPatient {
  id: string;
  clinicId: string;
  name: string;
  firstName?: string;
  lastName?: string;
  birthDate?: string;
  gender?: string;
  phone?: string;
  email?: string;
  address?: {
    line?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
  };
  maritalStatus?: string;
  emergencyContact?: {
    name?: string;
    relationship?: string;
    phone?: string;
  };
}

export interface ProcessedProvider {
  id: string;
  name: string;
  firstName?: string;
  lastName?: string;
  qualifications?: string;
  specialty?: string;
  phone?: string;
  email?: string;
  engagementCount: number; // Number of encounters/reports with this provider
  category?: string; // Main category (Medical, Mental Health, Family, etc.)
  subCategory?: string; // Primary subcategory for Medical providers (PCP, All Specialists, etc.) - for backward compatibility
  subCategories?: string[]; // All applicable subcategories (allows multiple)
  lastVisited?: string; // ISO date string of the most recent encounter/appointment with this provider
}

export interface ProcessedMedicalReport {
  id: string;
  clinicId: string;
  patientId: string;
  title: string;
  category: string;
  date: string;
  formattedDate: string;
  provider?: {
    id: string;
    name: string;
  };
  status: 'Available' | 'Pending' | 'Completed';
  fileType?: string;
  fileUrl?: string;
  interpretedBy?: string;
  signedBy?: string;
  signedOn?: string;
  performingFacility?: {
    name: string;
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
  };
  clinicalHistory?: string;
  orderNumber?: string;
}

export interface ProcessedAppointment {
  id: string;
  clinicId: string;
  patientId: string;
  date: string;
  time: string;
  type: string;
  status: 'Scheduled' | 'Completed' | 'Cancelled';
  doctorName: string;
  doctorSpecialty: string;
  diagnosis?: string;
  providerId?: string;
}

export interface ProcessedMedication {
  id: string;
  clinicId: string;
  patientId: string;
  name: string;
  dosage?: string;
  frequency?: string;
  startDate?: string;
  endDate?: string;
  status: 'Active' | 'Completed' | 'Stopped';
  prescriber?: {
    id: string;
    name: string;
  };
}

export interface ProcessedEncounter {
  id: string;
  clinicId: string;
  patientId: string;
  type?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  providers?: Array<{
    id: string;
    name: string;
  }>;
}

export interface ProcessedEmergencyContact {
  name: string;
  relationship?: string;
  phone: string;
  email?: string;
  clinicId: string;
  clinicName: string;
  patientId: string;
}

export interface ProcessedHealthDetails {
  height?: string; // e.g., "182 cm"
  weight?: string; // e.g., "111.1 kg"
  bloodType?: string; // e.g., "O+", "A-"
  bloodPressureSystolic?: string; // e.g., "120"
  bloodPressureDiastolic?: string; // e.g., "80"
  usesCpap: boolean;
  chronicConditions: string[]; // e.g., ["Diabetes", "Hypertension"]
  patientId: string;
}

export interface ProcessedHealthData {
  clinics: ProcessedClinic[];
  labs: ProcessedLab[];
  patients: ProcessedPatient[];
  providers: ProcessedProvider[];
  medicalReports: ProcessedMedicalReport[];
  appointments: ProcessedAppointment[];
  medications: ProcessedMedication[];
  encounters: ProcessedEncounter[];
  emergencyContacts: ProcessedEmergencyContact[];
  healthDetails: ProcessedHealthDetails | null;
  metadata: {
    processedAt: string;
    totalClinics: number;
    totalLabs: number;
    totalPatients: number;
    totalProviders: number;
    totalReports: number;
    totalAppointments: number;
    totalMedications: number;
    totalEmergencyContacts: number;
  };
}

// ============================================================================
// FHIR Resource Type Definitions (for processing)
// ============================================================================

interface FHIRResource {
  resourceType: string;
  id: string;
  [key: string]: any;
}

interface FHIRPatient extends FHIRResource {
  resourceType: 'Patient';
  name?: Array<{
    text?: string;
    family?: string;
    given?: string[];
    use?: string;
  }>;
  birthDate?: string;
  gender?: string;
  telecom?: Array<{
    system?: string;
    value?: string;
    use?: string;
  }>;
  address?: Array<{
    line?: string[];
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
    text?: string;
    use?: string;
  }>;
  maritalStatus?: {
    text?: string;
    coding?: Array<{
      display?: string;
    }>;
  };
  contact?: Array<{
    name?: {
      text?: string;
    use?: string;
      family?: string;
      given?: string[];
    };
    relationship?: Array<{
      coding?: Array<{
        code?: string;
        display?: string;
      }>;
    }>;
    telecom?: Array<{
      system?: string;
      value?: string;
    }>;
  }>;
  managingOrganization?: {
    reference?: string;
    display?: string;
  };
}

interface FHIRPractitioner extends FHIRResource {
  resourceType: 'Practitioner';
  name?: Array<{
    text?: string;
    family?: string;
    given?: string[];
    suffix?: string[];
  }>;
  telecom?: Array<{
    system?: string;
    value?: string;
  }>;
  qualification?: Array<{
    code?: {
      text?: string;
    use?: string;
      coding?: Array<{
        display?: string;
      }>;
    };
  }>;
}

interface FHIRDiagnosticReport extends FHIRResource {
  resourceType: 'DiagnosticReport';
  status: string;
  category?: Array<{
    coding?: Array<{
      display?: string;
    }>;
    text?: string;
    use?: string;
  }>;
  code?: {
    coding?: Array<{
      display?: string;
    }>;
    text?: string;
    use?: string;
  };
  subject?: {
    reference?: string;
    display?: string;
  };
  encounter?: {
    reference?: string;
    display?: string;
  };
  effectiveDateTime?: string;
  issued?: string;
  performer?: Array<{
    reference?: string;
    type?: string;
    display?: string;
  }>;
  resultsInterpreter?: Array<{
    reference?: string;
    display?: string;
  }>;
  presentedForm?: Array<{
    contentType?: string;
    url?: string;
    title?: string;
  }>;
  identifier?: Array<{
    value?: string;
  }>;
  conclusionCode?: Array<{
    text?: string;
    use?: string;
  }>;
}

interface FHIREncounter extends FHIRResource {
  resourceType: 'Encounter';
  status?: string;
  class?: {
    display?: string;
  };
  type?: Array<{
    text?: string;
    use?: string;
    coding?: Array<{
      display?: string;
    }>;
  }>;
  period?: {
    start?: string;
    end?: string;
  };
  subject?: {
    reference?: string;
  };
  participant?: Array<{
    individual?: {
      reference?: string;
    };
  }>;
  serviceProvider?: {
    reference?: string;
    display?: string;
  };
}

interface FHIRMedicationStatement extends FHIRResource {
  resourceType: 'MedicationStatement';
  status?: string;
  medicationCodeableConcept?: {
    text?: string;
    use?: string;
    coding?: Array<{
      display?: string;
    }>;
  };
  effectivePeriod?: {
    start?: string;
    end?: string;
  };
  dosage?: Array<{
    text?: string;
    use?: string;
    timing?: {
      repeat?: {
        frequency?: number;
        period?: string;
      };
    };
  }>;
  informationSource?: {
    reference?: string;
    display?: string;
  };
  subject?: {
    reference?: string;
  };
}

interface FHIROrganization extends FHIRResource {
  resourceType: 'Organization';
  name?: string;
  identifier?: Array<{
    value?: string;
  }>;
  telecom?: Array<{
    system?: string;
    value?: string;
  }>;
  address?: Array<{
    line?: string[];
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  }>;
}

interface FHIRObservation extends FHIRResource {
  resourceType: 'Observation';
  code?: {
    text?: string;
    coding?: Array<{
      system?: string;
      code?: string;
      display?: string;
    }>;
  };
  valueQuantity?: {
    value?: number;
    unit?: string;
    system?: string;
    code?: string;
  };
  valueString?: string;
  component?: Array<{
    code?: {
      text?: string;
      coding?: Array<{
        code?: string;
        display?: string;
      }>;
    };
    valueQuantity?: {
      value?: number;
      unit?: string;
    };
  }>;
  effectiveDateTime?: string;
  subject?: {
    reference?: string;
  };
}

interface FHIRCondition extends FHIRResource {
  resourceType: 'Condition';
  code?: {
    text?: string;
    coding?: Array<{
      code?: string;
      display?: string;
    }>;
  };
  clinicalStatus?: {
    coding?: Array<{
      code?: string;
      display?: string;
    }>;
  };
  subject?: {
    reference?: string;
  };
}

interface FHIRDevice extends FHIRResource {
  resourceType: 'Device';
  type?: {
    text?: string;
    coding?: Array<{
      code?: string;
      display?: string;
    }>;
  };
  patient?: {
    reference?: string;
  };
}

// ============================================================================
// Main Processing Functions
// ============================================================================

/**
 * Processes raw FHIR data and returns structured health data
 * This is the main entry point for data processing
 * 
 * @param rawFhirData - Array of FHIR resources
 * @returns Processed health data structured by clinic and patient
 */
export function processFastenHealthData(rawFhirData: FHIRResource[], loincMap?: Map<string, any>): ProcessedHealthData {
  // Separate resources by type
  const patients: FHIRPatient[] = [];
  const practitioners: FHIRPractitioner[] = [];
  const diagnosticReports: FHIRDiagnosticReport[] = [];
  const encounters: FHIREncounter[] = [];
  const medications: FHIRMedicationStatement[] = [];
  const organizations: FHIROrganization[] = [];
  const observations: FHIRObservation[] = [];
  const conditions: FHIRCondition[] = [];
  const devices: FHIRDevice[] = [];

  rawFhirData.forEach((resource: any) => {
    switch (resource.resourceType) {
      case 'Patient':
        patients.push(resource as FHIRPatient);
        break;
      case 'Practitioner':
        practitioners.push(resource as FHIRPractitioner);
        break;
      case 'DiagnosticReport':
        diagnosticReports.push(resource as FHIRDiagnosticReport);
        break;
      case 'Encounter':
        encounters.push(resource as FHIREncounter);
        break;
      case 'MedicationStatement':
        medications.push(resource as FHIRMedicationStatement);
        break;
      case 'Organization':
        organizations.push(resource as FHIROrganization);
        break;
      case 'Observation':
        observations.push(resource as FHIRObservation);
        break;
      case 'Condition':
        conditions.push(resource as FHIRCondition);
        break;
      case 'Device':
        devices.push(resource as FHIRDevice);
        break;
    }
  });

  // Process organizations into clinics and labs
  const { clinics: processedClinics, labs: processedLabs } = processOrganizations(organizations, rawFhirData);

  // Process patients and map to clinics
  const processedPatients = processPatients(patients, processedClinics);

  // Process providers with engagement counts
  const processedProviders = processProviders(practitioners, diagnosticReports, encounters);

  // Process medical reports (pass LOINC map for enrichment when available)
  const processedReports = processMedicalReports(
    diagnosticReports,
    practitioners,
    encounters,
    processedPatients,
    processedClinics,
    loincMap
  );

  // Process appointments
  const processedAppointments = processAppointments(
    diagnosticReports,
    encounters,
    practitioners,
    processedPatients,
    processedClinics
  );

  // Process medications
  const processedMedications = processMedications(
    medications,
    practitioners,
    processedPatients,
    processedClinics
  );

  // Process encounters
  const processedEncounters = processEncounters(
    encounters,
    practitioners,
    processedPatients,
    processedClinics
  );

  // Process emergency contacts from all patients
  const processedEmergencyContacts = processEmergencyContacts(
    processedPatients,
    processedClinics,
    rawFhirData
  );

  // Process health details from observations, conditions, and devices
  const processedHealthDetails = processHealthDetails(
    observations,
    conditions,
    devices,
    processedPatients,
    loincMap
  );

  return {
    clinics: processedClinics,
    labs: processedLabs,
    patients: processedPatients,
    providers: processedProviders,
    medicalReports: processedReports,
    appointments: processedAppointments,
    medications: processedMedications,
    encounters: processedEncounters,
    emergencyContacts: processedEmergencyContacts,
    healthDetails: processedHealthDetails,
    metadata: {
      processedAt: new Date().toISOString(),
      totalClinics: processedClinics.length,
      totalLabs: processedLabs.length,
      totalPatients: processedPatients.length,
      totalProviders: processedProviders.length,
      totalReports: processedReports.length,
      totalAppointments: processedAppointments.length,
      totalMedications: processedMedications.length,
      totalEmergencyContacts: processedEmergencyContacts.length,
    },
  };
}

// ============================================================================
// Individual Processing Functions
// ============================================================================

/**
 * Determines if an organization is a lab or clinic based on name patterns
 */
function isLab(orgName: string): boolean {
  const nameLower = orgName.toLowerCase();
  const labKeywords = [
    'lab',
    'laboratory',
    'diagnostic',
    'pathology',
    'quest',
    'labcorp',
    'testing',
    'specimen',
    'analytical',
    'imaging', // Imaging centers are typically diagnostic/lab services
  ];
  
  return labKeywords.some(keyword => nameLower.includes(keyword));
}

/**
 * Determines if an organization should be excluded (internal systems, interfaces, etc.)
 */
function shouldExcludeOrganization(orgName: string): boolean {
  const nameLower = orgName.toLowerCase();
  const excludeKeywords = [
    'interface',
    'pws interface',
    'system',
    'internal',
    'csv', // Exclude CSV export artifacts like "Cc Csv Sonoma Valley Hospital Sa"
  ];
  
  return excludeKeywords.some(keyword => nameLower.includes(keyword));
}


/**
 * Processes organizations into clinics and labs separately
 */
function processOrganizations(
  organizations: FHIROrganization[],
  allResources: FHIRResource[]
): { clinics: ProcessedClinic[]; labs: ProcessedLab[] } {
  const clinicMap = new Map<string, ProcessedClinic>();
  const labMap = new Map<string, ProcessedLab>();

  // Process explicit organizations
  organizations.forEach(org => {
    const orgId = org.id;
    const orgName = org.name || 'Unknown Organization';
    
    // Skip internal systems and interfaces
    if (shouldExcludeOrganization(orgName)) {
      return;
    }
    
    const address = org.address?.[0];
    const phone = org.telecom?.find(t => t.system === 'phone')?.value;
    const email = org.telecom?.find(t => t.system === 'email')?.value;

    const baseOrg = {
      id: orgId,
      name: orgName,
      identifier: org.identifier?.[0]?.value,
      address: address ? {
        line: address.line,
        city: address.city,
        state: address.state,
        zip: address.postalCode,
        country: address.country,
      } : undefined,
      phone,
      email,
    };

    if (isLab(orgName)) {
      if (!labMap.has(orgId)) {
        labMap.set(orgId, baseOrg);
      }
    } else {
      if (!clinicMap.has(orgId)) {
        clinicMap.set(orgId, {
          ...baseOrg,
          type: 'clinic' as const,
        });
      }
    }
  });

  // Extract organizations from patient managing organizations
  allResources.forEach((resource: any) => {
    if (resource.resourceType === 'Patient' && resource.managingOrganization) {
      const orgRef = resource.managingOrganization.reference;
      if (orgRef) {
        const orgId = orgRef.split('/')[1];
        const orgName = resource.managingOrganization.display || 'Unknown Organization';
        
        // Skip if already excluded or already processed
        if (shouldExcludeOrganization(orgName)) {
          return;
        }
        
        if (!clinicMap.has(orgId) && !labMap.has(orgId)) {
          // Patient managing organizations are typically clinics, not labs
          clinicMap.set(orgId, {
            id: orgId,
            name: orgName,
            type: 'clinic' as const,
          });
        }
      }
    }
  });

  // If no organizations found, create a default clinic
  if (clinicMap.size === 0 && labMap.size === 0) {
    clinicMap.set('default-clinic', {
      id: 'default-clinic',
      name: 'Default Clinic',
      type: 'clinic' as const,
    });
  }

  return {
    clinics: Array.from(clinicMap.values()),
    labs: Array.from(labMap.values()),
  };
}

/**
 * Processes patients and maps them to clinics
 */
function processPatients(
  patients: FHIRPatient[],
  clinics: ProcessedClinic[]
): Array<ProcessedPatient & { managingOrgDisplay?: string }> {
  return patients.map(patient => {
    const nameObj = patient.name?.find(n => n.use === 'official') || patient.name?.[0] || {};
    const fullName = nameObj.text || 
      `${nameObj.given?.join(' ') || ''} ${nameObj.family || ''}`.trim() ||
      'Unknown Patient';

    const firstName = nameObj.given?.[0];
    const lastName = nameObj.family;

    const phone = patient.telecom?.find(t => t.system === 'phone' && t.use === 'home')?.value ||
      patient.telecom?.find(t => t.system === 'phone')?.value ||
      '';

    const email = patient.telecom?.find(t => t.system === 'email')?.value || '';

    const addressObj = patient.address?.find((a: any) => a.use === 'home') || patient.address?.[0];
    const address = addressObj ? {
      line: addressObj.line?.[0],
      city: addressObj.city,
      state: addressObj.state,
      zip: addressObj.postalCode,
      country: addressObj.country,
    } : undefined;

    const maritalStatus = patient.maritalStatus?.text || 
      patient.maritalStatus?.coding?.[0]?.display || '';

    let emergencyContact: ProcessedPatient['emergencyContact'] | undefined;
    const contact = patient.contact?.find(c => 
      c.relationship?.some(r => 
        r.coding?.some(coding => coding.code === 'C' || coding.display?.toLowerCase().includes('emergency'))
      )
    );

    if (contact) {
      const contactName = contact.name?.text || 
        `${contact.name?.given?.join(' ') || ''} ${contact.name?.family || ''}`.trim();
      const relationship = contact.relationship?.[0]?.coding?.[0]?.display || '';
      const contactPhone = contact.telecom?.find(t => t.system === 'phone')?.value || '';

      emergencyContact = {
        name: contactName,
        relationship,
        phone: contactPhone,
      };
    }

    // Map patient to clinic (use managing organization or default to first clinic)
    let clinicId: string = patient.managingOrganization?.reference?.split('/')[1] || 
      clinics[0]?.id || 'default-clinic';
    const managingOrgDisplay = patient.managingOrganization?.display;
    
    // Check if the clinicId exists in the clinics array
    let clinicExists = clinics.some(c => c.id === clinicId);
    
    // If clinic doesn't exist or managing org is excluded, try to find matching clinic by name
    if (!clinicExists || (managingOrgDisplay && shouldExcludeOrganization(managingOrgDisplay))) {
      if (managingOrgDisplay) {
        // Normalize the display name (remove CSV artifacts, extra spaces, etc.)
        const normalizedDisplay = managingOrgDisplay
          .toLowerCase()
          .replace(/^(cc\s+)?csv\s+/i, '')
          .replace(/\s+sa$/i, '')
          .trim();
        
        // Try to find a clinic that matches
        const matchingClinic = clinics.find(c => {
          const clinicNameLower = c.name.toLowerCase();
          // Check if clinic name is contained in the display name or vice versa
          return normalizedDisplay.includes(clinicNameLower) || 
                 clinicNameLower.includes(normalizedDisplay) ||
                 // Also check if removing common words helps match
                 normalizedDisplay.replace(/\s*(hospital|medical|center|clinic)\s*/gi, '').includes(
                   clinicNameLower.replace(/\s*(hospital|medical|center|clinic)\s*/gi, '')
                 );
        });
        
        if (matchingClinic) {
          clinicId = matchingClinic.id;
          clinicExists = true;
        }
      }
    }
    
    // Final fallback
    if (!clinicExists) {
      clinicId = clinics[0]?.id || 'default-clinic';
    }

    return {
      id: patient.id,
      clinicId,
      name: fullName,
      firstName,
      lastName,
      birthDate: patient.birthDate,
      gender: patient.gender,
      phone,
      email,
      address,
      maritalStatus: maritalStatus || undefined,
      emergencyContact,
      managingOrgDisplay,
    };
  });
}

/**
 * Processes practitioners into providers with engagement counts
 */
function processProviders(
  practitioners: FHIRPractitioner[],
  diagnosticReports: FHIRDiagnosticReport[],
  encounters: FHIREncounter[]
): ProcessedProvider[] {
  // Count engagements per practitioner
  const engagementCountMap = new Map<string, number>();
  // Track last visited date per practitioner
  const practitionerLastVisited = new Map<string, Date>();

  diagnosticReports.forEach(report => {
    const reportDate = report.effectiveDateTime || report.issued;
    const reportDateObj = reportDate ? new Date(reportDate) : null;
    
    if (report.performer && report.performer.length > 0) {
      report.performer.forEach(performer => {
        if (performer.reference && (!performer.type || performer.type === 'Practitioner')) {
          const practitionerId = performer.reference.split('/')[1];
          if (practitionerId) {
            engagementCountMap.set(
              practitionerId,
              (engagementCountMap.get(practitionerId) || 0) + 1
            );
            
            // Update last visited date if this report is more recent
            if (reportDateObj && (!practitionerLastVisited.has(practitionerId) || 
                reportDateObj > practitionerLastVisited.get(practitionerId)!)) {
              practitionerLastVisited.set(practitionerId, reportDateObj);
            }
          }
        }
      });
    }

    if (report.resultsInterpreter && report.resultsInterpreter.length > 0) {
      report.resultsInterpreter.forEach(interpreter => {
        if (interpreter.reference) {
          const practitionerId = interpreter.reference.split('/')[1];
          if (practitionerId) {
            engagementCountMap.set(
              practitionerId,
              (engagementCountMap.get(practitionerId) || 0) + 1
            );
            
            // Update last visited date if this report is more recent
            if (reportDateObj && (!practitionerLastVisited.has(practitionerId) || 
                reportDateObj > practitionerLastVisited.get(practitionerId)!)) {
              practitionerLastVisited.set(practitionerId, reportDateObj);
            }
          }
        }
      });
    }
  });

  encounters.forEach(encounter => {
    // Get encounter date from period or use current date as fallback
    const encounterDate = encounter.period?.start || encounter.period?.end;
    const encounterDateObj = encounterDate ? new Date(encounterDate) : null;
    
    if (encounter.participant) {
      encounter.participant.forEach(participant => {
        if (participant.individual?.reference) {
          const practitionerId = participant.individual.reference.split('/')[1];
          if (practitionerId) {
            engagementCountMap.set(
              practitionerId,
              (engagementCountMap.get(practitionerId) || 0) + 1
            );
            
            // Update last visited date if this encounter is more recent
            if (encounterDateObj && (!practitionerLastVisited.has(practitionerId) || 
                encounterDateObj > practitionerLastVisited.get(practitionerId)!)) {
              practitionerLastVisited.set(practitionerId, encounterDateObj);
            }
          }
        }
      });
    }
  });

  return practitioners.map(practitioner => {
    const nameObj = practitioner.name?.[0] || {};
    const fullName = nameObj.text || 
      `${nameObj.given?.join(' ') || ''} ${nameObj.family || ''}`.trim() ||
      'Unknown Provider';

    const firstName = nameObj.given?.[0];
    const lastName = nameObj.family;

    // Extract qualifications
    let qualifications = '';
    if (nameObj.suffix && nameObj.suffix.length > 0) {
      qualifications = nameObj.suffix.join(', ');
    } else if (practitioner.qualification && practitioner.qualification.length > 0) {
      qualifications = practitioner.qualification
        .map(q => q.code?.text || q.code?.coding?.[0]?.display)
        .filter(Boolean)
        .join(', ');
    }

    // Extract specialty from qualifications
    let specialty = '';
    const qualsLower = qualifications.toLowerCase();
    if (qualsLower.includes('cardiology') || qualsLower.includes('cardiac')) {
      specialty = 'Cardiology';
    } else if (qualsLower.includes('neurology') || qualsLower.includes('neuro')) {
      specialty = 'Neurology';
    } else if (qualsLower.includes('pediatric')) {
      specialty = 'Pediatrics';
    } else if (qualsLower.includes('ortho')) {
      specialty = 'Orthopedics';
    }

    const phone = practitioner.telecom?.find(t => t.system === 'phone')?.value || '';
    const email = practitioner.telecom?.find(t => t.system === 'email')?.value || '';
    const lastVisitedDate = practitionerLastVisited.get(practitioner.id);

    // Categorize provider
    const categorization = categorizeProvider({
      qualifications,
      specialty,
      name: fullName,
    });

    return {
      id: practitioner.id,
      name: fullName,
      firstName,
      lastName,
      qualifications: qualifications || undefined,
      specialty: specialty || undefined,
      phone: phone || undefined,
      email: email || undefined,
      engagementCount: engagementCountMap.get(practitioner.id) || 0,
      category: categorization.category,
      subCategory: categorization.subCategory, // Primary subcategory for backward compatibility
      subCategories: categorization.subCategories, // All applicable subcategories
      lastVisited: lastVisitedDate ? lastVisitedDate.toISOString() : undefined,
    };
  }).sort((a, b) => {
    // Sort by last visited date in descending order (most recently visited first), then by engagement count
    const dateA = a.lastVisited ? new Date(a.lastVisited).getTime() : 0;
    const dateB = b.lastVisited ? new Date(b.lastVisited).getTime() : 0;
    
    // If both have dates, sort by date descending
    if (dateA > 0 && dateB > 0) {
      return dateB - dateA; // Descending order (most recent first)
    }
    // If only one has a date, prioritize it
    if (dateA > 0 && dateB === 0) return -1;
    if (dateB > 0 && dateA === 0) return 1;
    
    // If neither has a date, fall back to engagement count
    return b.engagementCount - a.engagementCount;
  });
}

/**
 * Processes diagnostic reports into medical reports
 */
function processMedicalReports(
  diagnosticReports: FHIRDiagnosticReport[],
  practitioners: FHIRPractitioner[],
  encounters: FHIREncounter[],
  patients: ProcessedPatient[],
  clinics: ProcessedClinic[]
  , loincMap?: Map<string, any>
): ProcessedMedicalReport[] {
  const practitionerMap = new Map(practitioners.map(p => [p.id, p]));
  const patientMap = new Map(patients.map(p => [p.id, p]));

  return diagnosticReports
    .sort((a, b) => {
      const dateA = a.effectiveDateTime || a.issued || '';
      const dateB = b.effectiveDateTime || b.issued || '';
      return new Date(dateB).getTime() - new Date(dateA).getTime();
    })
    .map(report => {
      const date = report.effectiveDateTime || report.issued || new Date().toISOString();
      const dateObj = new Date(date);
      const formattedDate = dateObj.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });

      // Get patient and clinic
      const patientId = report.subject?.reference?.split('/')[1];
      const patient = patientId ? patientMap.get(patientId) : undefined;
      const clinicId = patient?.clinicId || clinics[0]?.id || 'default-clinic';

      // Get provider
      let provider: ProcessedMedicalReport['provider'];
      if (report.performer && report.performer.length > 0) {
        const performer = report.performer.find(p => p.type === 'Practitioner') || report.performer[0];
        if (performer.reference) {
          const practitionerId = performer.reference.split('/')[1];
          const practitioner = practitionerMap.get(practitionerId);
          if (practitioner) {
            const nameObj = practitioner.name?.[0] || {};
            const providerName = nameObj.text || 
              `${nameObj.given?.join(' ') || ''} ${nameObj.family || ''}`.trim();
            provider = {
              id: practitionerId,
              name: providerName,
            };
          }
        }
      }

      // Determine category
      let category = 'Medical Records';
      if (report.category && report.category.length > 0) {
        const categoryText = report.category[0].text || report.category[0].coding?.[0]?.display || '';
        const catLower = categoryText.toLowerCase();
        if (catLower.includes('imaging') || catLower.includes('radiology')) {
          category = 'Imaging';
        } else if (catLower.includes('pathology')) {
          category = 'Pathology';
        } else if (catLower.includes('lab') || catLower.includes('laboratory')) {
          category = 'Lab Reports';
        } else {
          category = categoryText || 'Medical Records';
        }
      }

      // Get title - prefer LOINC map shortName when available
      let title = report.code?.text || report.code?.coding?.[0]?.display || 'Medical Report';
      if (loincMap && report.code?.coding && report.code.coding.length > 0) {
        for (const c of report.code.coding) {
          const code = (c as any).code;
          if (code && loincMap.has(code)) {
            const li = loincMap.get(code) as any;
            if (li && li.shortName) {
              title = li.shortName;
              break;
            } else if (li && li.component) {
              title = li.component;
              break;
            }
          }
        }
      }

      // Get file info
      const fileForm = report.presentedForm?.[0];
      const fileType = fileForm?.contentType;
      const fileUrl = fileForm?.url;

      // Get interpreter
      let interpretedBy: string | undefined;
      if (report.resultsInterpreter && report.resultsInterpreter.length > 0) {
        const interpreter = report.resultsInterpreter[0];
        if (interpreter.display) {
          interpretedBy = interpreter.display;
        } else if (interpreter.reference) {
          const practitionerId = interpreter.reference.split('/')[1];
          const practitioner = practitionerMap.get(practitionerId);
          if (practitioner) {
            const nameObj = practitioner.name?.[0] || {};
            interpretedBy = nameObj.text || 
              `${nameObj.given?.join(' ') || ''} ${nameObj.family || ''}`.trim();
          }
        }
      }

      // Get performing facility
      let performingFacility: ProcessedMedicalReport['performingFacility'];
      if (report.performer) {
        const orgPerformer = report.performer.find(p => p.type === 'Organization');
        if (orgPerformer?.display) {
          performingFacility = {
            name: orgPerformer.display,
          };
        }
      }

      // Get clinical history from encounter
      let clinicalHistory: string | undefined;
      if (report.encounter?.reference) {
        const encounterId = report.encounter.reference.split('/')[1];
        const encounter = encounters.find(e => e.id === encounterId);
        if (encounter?.type?.[0]?.text) {
          clinicalHistory = encounter.type[0].text;
        }
      }

      // Get order number
      const orderNumber = report.identifier?.[0]?.value;

      // Determine status
      let status: 'Available' | 'Pending' | 'Completed' = 'Available';
      if (report.status === 'final' || report.status === 'amended') {
        status = 'Completed';
      } else if (report.status === 'preliminary' || report.status === 'registered') {
        status = 'Pending';
      }

      return {
        id: report.id,
        clinicId,
        patientId: patientId || '',
        title,
        category,
        date,
        formattedDate,
        provider,
        status,
        fileType,
        fileUrl,
        interpretedBy,
        signedBy: interpretedBy,
        signedOn: dateObj.toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        }),
        performingFacility,
        clinicalHistory,
        orderNumber,
      };
    });
}

/**
 * Processes diagnostic reports and encounters into appointments
 */
function processAppointments(
  diagnosticReports: FHIRDiagnosticReport[],
  encounters: FHIREncounter[],
  practitioners: FHIRPractitioner[],
  patients: ProcessedPatient[],
  clinics: ProcessedClinic[]
): ProcessedAppointment[] {
  const practitionerMap = new Map(practitioners.map(p => [p.id, p]));
  const patientMap = new Map(patients.map(p => [p.id, p]));
  const encounterMap = new Map(encounters.map(e => [e.id, e]));

  const appointments: ProcessedAppointment[] = [];

  diagnosticReports.forEach(report => {
    if (report.encounter?.reference) {
      const encounterId = report.encounter.reference.split('/')[1];
      const encounter = encounterMap.get(encounterId);
      const date = report.effectiveDateTime || report.issued || new Date().toISOString();
      const dateObj = new Date(date);

      const patientId = report.subject?.reference?.split('/')[1];
      const patient = patientId ? patientMap.get(patientId) : undefined;
      const clinicId = patient?.clinicId || clinics[0]?.id || 'default-clinic';

      // Get provider
      let doctorName = 'Unknown Doctor';
      let doctorSpecialty = 'General';
      let providerId: string | undefined;

      if (report.performer && report.performer.length > 0) {
        const performer = report.performer[0];
        if (performer.display) {
          doctorName = performer.display;
        } else if (performer.reference) {
          const practitionerId = performer.reference.split('/')[1];
          const practitioner = practitionerMap.get(practitionerId);
          if (practitioner) {
            providerId = practitionerId;
            const nameObj = practitioner.name?.[0] || {};
            doctorName = nameObj.text || 
              `${nameObj.given?.join(' ') || ''} ${nameObj.family || ''}`.trim();
            
            // Try to get specialty
            const quals = practitioner.qualification?.[0]?.code?.text || '';
            if (quals.toLowerCase().includes('cardiology')) {
              doctorSpecialty = 'Cardiology';
            } else if (quals.toLowerCase().includes('neurology')) {
              doctorSpecialty = 'Neurology';
            }
          }
        }
      }

      const type = encounter?.type?.[0]?.text || 
        encounter?.class?.display || 
        'Follow-up';

      let status: 'Scheduled' | 'Completed' | 'Cancelled' = 'Completed';
      if (dateObj > new Date()) {
        status = 'Scheduled';
      } else if (encounter?.status === 'cancelled') {
        status = 'Cancelled';
      }

      const diagnosis = report.conclusionCode?.[0]?.text || report.code?.text;

      appointments.push({
        id: report.id,
        clinicId,
        patientId: patientId || '',
        date: dateObj.toISOString().split('T')[0],
        time: dateObj.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        }),
        type,
        status,
        doctorName,
        doctorSpecialty,
        diagnosis,
        providerId,
      });
    }
  });

  // Remove duplicates and sort
  const uniqueAppointments = Array.from(
    new Map(appointments.map(apt => [apt.id, apt])).values()
  ).sort((a, b) => {
    const dateA = new Date(a.date + ' ' + a.time).getTime();
    const dateB = new Date(b.date + ' ' + b.time).getTime();
    return dateB - dateA;
  });

  return uniqueAppointments;
}

/**
 * Processes medication statements
 */
function processMedications(
  medications: FHIRMedicationStatement[],
  practitioners: FHIRPractitioner[],
  patients: ProcessedPatient[],
  clinics: ProcessedClinic[]
): ProcessedMedication[] {
  const practitionerMap = new Map(practitioners.map(p => [p.id, p]));
  const patientMap = new Map(patients.map(p => [p.id, p]));

  return medications.map(med => {
    const patientId = med.subject?.reference?.split('/')[1];
    const patient = patientId ? patientMap.get(patientId) : undefined;
    const clinicId = patient?.clinicId || clinics[0]?.id || 'default-clinic';

    const name = med.medicationCodeableConcept?.text || 
      med.medicationCodeableConcept?.coding?.[0]?.display || 
      'Unknown Medication';

    const dosage = med.dosage?.[0]?.text;
    const frequency = med.dosage?.[0]?.timing?.repeat 
      ? `${med.dosage[0].timing.repeat.frequency || 1} times per ${med.dosage[0].timing.repeat.period || 'day'}`
      : undefined;

    const startDate = med.effectivePeriod?.start;
    const endDate = med.effectivePeriod?.end;

    let status: 'Active' | 'Completed' | 'Stopped' = 'Active';
    if (med.status === 'completed' || (endDate && new Date(endDate) < new Date())) {
      status = 'Completed';
    } else if (med.status === 'stopped' || med.status === 'cancelled') {
      status = 'Stopped';
    }

    let prescriber: ProcessedMedication['prescriber'];
    if (med.informationSource?.reference) {
      const practitionerId = med.informationSource.reference.split('/')[1];
      const practitioner = practitionerMap.get(practitionerId);
      if (practitioner) {
        const nameObj = practitioner.name?.[0] || {};
        const prescriberName = nameObj.text || 
          `${nameObj.given?.join(' ') || ''} ${nameObj.family || ''}`.trim();
        prescriber = {
          id: practitionerId,
          name: prescriberName,
        };
      }
    }

    return {
      id: med.id,
      clinicId,
      patientId: patientId || '',
      name,
      dosage,
      frequency,
      startDate,
      endDate,
      status,
      prescriber,
    };
  });
}

/**
 * Processes emergency contacts from all patients
 * Uses the same clinic names as processed in processOrganizations to ensure consistency
 */
function processEmergencyContacts(
  patients: Array<ProcessedPatient & { managingOrgDisplay?: string }>,
  clinics: ProcessedClinic[],
  allResources: FHIRResource[]
): ProcessedEmergencyContact[] {
  // Create a map of clinic IDs to clinic names from the processed clinics
  // This ensures we use the exact same clinic names as shown in Connected EHRs
  const clinicMap = new Map(clinics.map(c => [c.id, c.name]));
  const emergencyContacts: ProcessedEmergencyContact[] = [];

  patients.forEach(patient => {
    if (patient.emergencyContact && patient.emergencyContact.name && patient.emergencyContact.phone) {
      // Use the clinic name from the processed clinics array (same source as Connected EHRs)
      // This ensures consistency between Connected EHRs and Emergency Contacts
      const clinicName = clinicMap.get(patient.clinicId) || 'Unknown Clinic';

      emergencyContacts.push({
        name: patient.emergencyContact.name,
        relationship: patient.emergencyContact.relationship,
        phone: patient.emergencyContact.phone,
        email: undefined, // Email not typically in FHIR emergency contact
        clinicId: patient.clinicId,
        clinicName: clinicName,
        patientId: patient.id,
      });
    }
  });

  return emergencyContacts;
}

/**
 * Processes health details from observations, conditions, and devices
 */
function processHealthDetails(
  observations: FHIRObservation[],
  conditions: FHIRCondition[],
  devices: FHIRDevice[],
  patients: ProcessedPatient[]
  , loincMap?: Map<string, any>
): ProcessedHealthDetails | null {
  if (patients.length === 0) {
    return null;
  }

  const patientId = patients[0].id; // Use first patient
  let height: string | undefined;
  let weight: string | undefined;
  let bloodType: string | undefined;
  let bloodPressureSystolic: string | undefined;
  let bloodPressureDiastolic: string | undefined;
  const chronicConditions: string[] = [];
  let usesCpap = false;

  // Process observations
  observations.forEach(obs => {
    // Helper: attempt to lookup LOINC info for this observation if map is available
    const getLoincInfoForObservation = (observation: FHIRObservation) => {
      if (!loincMap || !observation.code || !observation.code.coding) return undefined;
      for (const coding of observation.code.coding) {
        const code = coding.code;
        const system = (coding.system || '').toLowerCase();
        if (!code) continue;
        if (system.includes('loinc') || /^\d{1,6}-\d+$/.test(code)) {
          const entry = loincMap.get(code);
          if (entry) return entry;
        }
      }
      return undefined;
    };

    const loincInfo = getLoincInfoForObservation(obs);
    const codeText = obs.code?.text?.toLowerCase() || '';
    const codeDisplay = obs.code?.coding?.[0]?.display?.toLowerCase() || '';
    const combined = codeText + ' ' + codeDisplay + ' ' + (loincInfo?.shortName || '') + ' ' + (loincInfo?.component || '');

    // Height
    if ((combined.includes('height') || codeText.includes('height') || (loincInfo && ((loincInfo.shortName || '').toLowerCase().includes('height') || (loincInfo.component || '').toLowerCase().includes('height')))) && obs.valueQuantity) {
      const value = obs.valueQuantity.value;
      const unit = obs.valueQuantity.unit || 'cm';
      height = `${value} ${unit}`;
    }

    // Weight
    if ((combined.includes('weight') || codeText.includes('weight') || (loincInfo && ((loincInfo.shortName || '').toLowerCase().includes('weight') || (loincInfo.component || '').toLowerCase().includes('weight')))) && obs.valueQuantity) {
      const value = obs.valueQuantity.value;
      const unit = obs.valueQuantity.unit || 'kg';
      weight = `${value} ${unit}`;
    }

    // Blood Pressure
    if (combined.includes('blood pressure') || codeText.includes('blood pressure') || (loincInfo && ((loincInfo.shortName || '').toLowerCase().includes('blood pressure') || (loincInfo.component || '').toLowerCase().includes('systolic') || (loincInfo.component || '').toLowerCase().includes('diastolic')))) {
      if (obs.component && obs.component.length > 0) {
        obs.component.forEach(comp => {
          const compText = comp.code?.text?.toLowerCase() || '';
          const compDisplay = comp.code?.coding?.[0]?.display?.toLowerCase() || '';
          const compCombined = compText + ' ' + compDisplay;
          if (compText.includes('systolic') || compDisplay.includes('systolic') || compCombined.includes('systolic')) {
            bloodPressureSystolic = comp.valueQuantity?.value?.toString();
          }
          if (compText.includes('diastolic') || compDisplay.includes('diastolic') || compCombined.includes('diastolic')) {
            bloodPressureDiastolic = comp.valueQuantity?.value?.toString();
          }
        });
      } else if (obs.valueQuantity) {
        // Single value - assume systolic if no components
        bloodPressureSystolic = obs.valueQuantity.value?.toString();
      }
    }

    // Blood Type
    if ((combined.includes('blood type') || combined.includes('abo') || combined.includes('rh') || (loincInfo && ((loincInfo.shortName || '').toLowerCase().includes('blood type') || (loincInfo.component || '').toLowerCase().includes('blood')))) && obs.valueString) {
      bloodType = obs.valueString;
    } else if ((combined.includes('blood type') || combined.includes('abo')) && obs.valueQuantity) {
      // Some systems store blood type as a coded value
      bloodType = obs.valueQuantity.code || obs.valueQuantity.value?.toString();
    }
  });

  // Process conditions for chronic medical conditions
  const chronicConditionKeywords = [
    'diabetes',
    'kidney disease',
    'renal',
    'congestive heart failure',
    'heart failure',
    'copd',
    'asthma',
    'hypertension',
    'high blood pressure',
    'chronic',
  ];

  conditions.forEach(condition => {
    const status = condition.clinicalStatus?.coding?.[0]?.code;
    // Only include active conditions
    if (status === 'active' || status === 'recurrence' || status === 'relapse') {
      const conditionText = condition.code?.text || condition.code?.coding?.[0]?.display || '';
      const conditionLower = conditionText.toLowerCase();
      
      // Check if it's a chronic condition
      const isChronic = chronicConditionKeywords.some(keyword => conditionLower.includes(keyword));
      if (isChronic && conditionText) {
        chronicConditions.push(conditionText);
      }
    }
  });

  // Process devices for CPAP
  devices.forEach(device => {
    const typeText = device.type?.text?.toLowerCase() || '';
    const typeDisplay = device.type?.coding?.[0]?.display?.toLowerCase() || '';
    if (typeText.includes('cpap') || typeDisplay.includes('cpap') || 
        typeText.includes('continuous positive airway pressure') ||
        typeDisplay.includes('continuous positive airway pressure')) {
      usesCpap = true;
    }
  });

  return {
    height,
    weight,
    bloodType,
    bloodPressureSystolic,
    bloodPressureDiastolic,
    usesCpap,
    chronicConditions,
    patientId,
  };
}

/**
 * Processes encounters
 */
function processEncounters(
  encounters: FHIREncounter[],
  practitioners: FHIRPractitioner[],
  patients: ProcessedPatient[],
  clinics: ProcessedClinic[]
): ProcessedEncounter[] {
  const practitionerMap = new Map(practitioners.map(p => [p.id, p]));
  const patientMap = new Map(patients.map(p => [p.id, p]));

  return encounters.map(encounter => {
    const patientId = encounter.subject?.reference?.split('/')[1];
    const patient = patientId ? patientMap.get(patientId) : undefined;
    const clinicId = patient?.clinicId || clinics[0]?.id || 'default-clinic';

    const providers: Array<{ id: string; name: string }> = [];
    if (encounter.participant) {
      encounter.participant.forEach(participant => {
        if (participant.individual?.reference) {
          const practitionerId = participant.individual.reference.split('/')[1];
          const practitioner = practitionerMap.get(practitionerId);
          if (practitioner) {
            const nameObj = practitioner.name?.[0] || {};
            const providerName = nameObj.text || 
              `${nameObj.given?.join(' ') || ''} ${nameObj.family || ''}`.trim();
            providers.push({
              id: practitionerId,
              name: providerName,
            });
          }
        }
      });
    }

    return {
      id: encounter.id,
      clinicId,
      patientId: patientId || '',
      type: encounter.type?.[0]?.text || encounter.class?.display,
      status: encounter?.status,
      startDate: encounter.period?.start,
      endDate: encounter.period?.end,
      providers: providers.length > 0 ? providers : undefined,
    };
  });
}

// ============================================================================
// Utility Functions for API Integration
// ============================================================================

import { USE_MOCK_DATA, getFastenHealthDataName } from './fasten-health-config';
import { categorizeProvider } from './provider-categorization';
// NOTE: Node-specific modules (fs, path, etc.) and `pdf-parse` are not available
// in the React Native runtime. The LOINC PDF processor is Node-only and should be
// loaded dynamically when running in a Node environment (e.g. scripts or backend).
// We avoid static imports of Node-only modules here so the Metro bundler won't fail.

// Import JSON files at module level (required for React Native/Expo)
// These must be at the top level, not inside async functions
const mockFastenData = require('../data/mock-fasten-health-data.json');
const originalFastenData = require('../data/fasten-health-data.json');

/**
 * Build a LOINC map from included LOINC PDF guide files that are checked into the repo.
 * This helper attempts to dynamically load the Node-only `lib/loincPdfProcessor`
 * module and use it to parse PDFs. If dynamic loading fails (e.g. when running
 * inside the React Native simulator), this function returns an empty Map and logs
 * a warning. Callers should handle an empty result.
 *
 * IMPORTANT: This function is intended for Node scripts or backend use. Do not
 * call it from performance-sensitive UI code in the simulator.
 */
export async function buildLoincMapFromIncludedPdfs(): Promise<Map<string, any>> {
  const pdfFiles = [
    'LOINC-Mapping-Guide-Allergy-Version-1.0.pdf',
    'LOINC-Mapping-Guide-Cell-Markers-Version-1.0.pdf',
    'LOINC-Mapping-Guide-Chemistry-Version-1.0.pdf',
    'LOINC-Mapping-Guide-Drug-and-Toxicology-Version-1.0.pdf',
    'LOINC-Mapping-Guide-Hematology-Serology-Version-1.0.pdf',
    'LOINC-Mapping-Guide-Molecular-Pathology-Version-1.0.pdf',
    'GuideForUsingLoincMicrobiologyTerms1.1.pdf',
  ];

  try {
    // Dynamic import to avoid bundler/static resolution of Node-only modules.
    // This will succeed only in Node environments where fs/path/pdf-parse exist.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const loincModule = await import('../lib/loincPdfProcessor');

    // Build absolute-ish paths relative to the repository root on Node.
    // We avoid `path` import here to keep this file Metro-friendly.
    const projectRoot = __dirname + '/..';
    const pdfPaths = pdfFiles.map((f) => `${projectRoot}/${f}`);

    const loincMap = await loincModule.buildLoincMapFromPdfFiles(pdfPaths);
    return loincMap;
  } catch (err) {
    // Running in the simulator or an environment without Node FS modules.
    // Return an empty map so the app can continue to run.
    // Consumers should detect empty map and skip enrichment.
    // eslint-disable-next-line no-console
    console.warn('LOINC PDF processing is unavailable in this environment:', (err as Error).message);
    return new Map();
  }
}

/**
 * Processes data from a JSON file (for app usage)
 * Can be replaced with API call when moved to backend
 * Supports both original and mock data
 * 
 * Note: filePath parameter is for future API use - in React Native/Expo,
 * we must use static require() paths at module level, not dynamic ones
 */
export async function processFastenHealthDataFromFile(
  filePath?: string
): Promise<ProcessedHealthData> {
  try {
    // In app: load from file using static require paths
    // In API: this would be replaced with database query or API call
    // Note: React Native/Expo requires static require() paths at module level
    
    // IMPORTANT: Check USE_MOCK_DATA at runtime to ensure we use current config
    // This helps ensure we always use the current config value
    // Note: React Native's require() may still cache files, so a full app restart may be needed
    const useMockData = USE_MOCK_DATA;
    
    let fastenData;
    const dataSourceName = useMockData ? 'mock' : 'original';
    
    console.log(`📂 Loading data from ${dataSourceName} file (USE_MOCK_DATA: ${useMockData}, env: ${process.env.EXPO_PUBLIC_USE_MOCK_DATA})`);
    
    // Use the pre-loaded module-level data
    if (useMockData) {
      fastenData = mockFastenData;
      console.log(`📦 Loaded mock data file (${Array.isArray(fastenData) ? fastenData.length : 1} resources)`);
    } else {
      fastenData = originalFastenData;
      console.log(`📦 Loaded original data file (${Array.isArray(fastenData) ? fastenData.length : 1} resources)`);
    }
    
    const rawData = Array.isArray(fastenData) ? fastenData : [fastenData];
    
    console.log(`✅ Processing ${rawData.length} FHIR resources from ${dataSourceName} data`);
    // First, try loading a static JSON LOINC map (preferred for RN).
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    let loincMap: Map<string, any> = new Map();
    try {
      // static JSON mapping produced by scripts/generate-loinc-map.js
      // This allows the RN app to load mappings without Node native modules.
      // If file doesn't exist, the require will throw and we'll fall back.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const loincJson = require('../data/loinc-map.json');
      if (loincJson && typeof loincJson === 'object') {
        loincMap = new Map(Object.entries(loincJson));
        console.log(`📘 Loaded static loinc-map.json (${loincMap.size} entries)`);
      }
    } catch (e) {
      // ignore - will try dynamic PDF parsing next (Node-only)
    }

    if (!loincMap || loincMap.size === 0) {
      // Attempt to build LOINC map from PDFs (Node-only). If unavailable, an empty Map will be returned.
      // This exists as a fallback for backend scripts or when running Node.
      loincMap = await buildLoincMapFromIncludedPdfs().catch(() => new Map());
    }

    return processFastenHealthData(rawData, loincMap);
  } catch (error) {
    console.error('Error processing Fasten Health data from file:', error);
    // Fallback to original data if mock data fails
    if (USE_MOCK_DATA) {
      console.log('⚠️ Mock data failed, falling back to original data...');
      try {
        // Use the pre-loaded module-level data
        const rawData = Array.isArray(originalFastenData) ? originalFastenData : [originalFastenData];
        console.log(`✅ Loaded ${rawData.length} resources from original data (fallback)`);
        return processFastenHealthData(rawData);
      } catch (fallbackError) {
        console.error('Error loading fallback data:', fallbackError);
        throw error;
      }
    }
    throw error;
  }
}

/**
 * Gets processed data for a specific patient
 */
export function getPatientData(
  processedData: ProcessedHealthData,
  patientId: string
): {
  patient: ProcessedPatient | undefined;
  reports: ProcessedMedicalReport[];
  appointments: ProcessedAppointment[];
  medications: ProcessedMedication[];
  encounters: ProcessedEncounter[];
} {
  return {
    patient: processedData.patients.find(p => p.id === patientId),
    reports: processedData.medicalReports.filter(r => r.patientId === patientId),
    appointments: processedData.appointments.filter(a => a.patientId === patientId),
    medications: processedData.medications.filter(m => m.patientId === patientId),
    encounters: processedData.encounters.filter(e => e.patientId === patientId),
  };
}

/**
 * Gets processed data for a specific clinic
 */
export function getClinicData(
  processedData: ProcessedHealthData,
  clinicId: string
): {
  clinic: ProcessedClinic | undefined;
  patients: ProcessedPatient[];
  reports: ProcessedMedicalReport[];
  appointments: ProcessedAppointment[];
  medications: ProcessedMedication[];
} {
  return {
    clinic: processedData.clinics.find(c => c.id === clinicId),
    patients: processedData.patients.filter(p => p.clinicId === clinicId),
    reports: processedData.medicalReports.filter(r => r.clinicId === clinicId),
    appointments: processedData.appointments.filter(a => a.clinicId === clinicId),
    medications: processedData.medications.filter(m => m.clinicId === clinicId),
  };
}

/**
 * Gets all clinics (for connected EHRs view)
 */
export function getClinics(processedData: ProcessedHealthData): ProcessedClinic[] {
  return processedData.clinics;
}

/**
 * Gets all labs (for report filters)
 */
export function getLabs(processedData: ProcessedHealthData): ProcessedLab[] {
  return processedData.labs;
}

/**
 * Gets providers grouped by category and subcategory
 * Useful for API endpoints that need to return categorized providers
 */
export function getProvidersByCategory(
  processedData: ProcessedHealthData
): {
  [category: string]: {
    [subCategory: string]: ProcessedProvider[];
  };
} {
  const grouped: {
    [category: string]: {
      [subCategory: string]: ProcessedProvider[];
    };
  } = {};

  processedData.providers.forEach(provider => {
    const category = provider.category || 'Medical';
    const subCategory = provider.subCategory || 'Others';

    if (!grouped[category]) {
      grouped[category] = {};
    }

    if (!grouped[category][subCategory]) {
      grouped[category][subCategory] = [];
    }

    grouped[category][subCategory].push(provider);
  });

  return grouped;
}

/**
 * Gets providers for a specific category
 * Useful for API endpoints filtering by category
 */
export function getProvidersForCategory(
  processedData: ProcessedHealthData,
  category: string
): ProcessedProvider[] {
  return processedData.providers.filter(
    p => (p.category || 'Medical') === category
  );
}

/**
 * Gets providers for a specific medical subcategory
 * Useful for API endpoints filtering by medical subcategory
 */
export function getProvidersForMedicalSubcategory(
  processedData: ProcessedHealthData,
  subCategory: string
): ProcessedProvider[] {
  return processedData.providers.filter(
    p => (p.category || 'Medical') === 'Medical' && (p.subCategory || 'Others') === subCategory
  );
}

/**
 * Gets all unique categories from processed providers
 * Useful for API endpoints that need to list available categories
 */
export function getAvailableCategories(
  processedData: ProcessedHealthData
): string[] {
  const categories = new Set<string>();
  processedData.providers.forEach(provider => {
    categories.add(provider.category || 'Medical');
  });
  return Array.from(categories).sort();
}

/**
 * Gets all unique medical subcategories from processed providers
 * Useful for API endpoints that need to list available medical subcategories
 */
export function getAvailableMedicalSubcategories(
  processedData: ProcessedHealthData
): string[] {
  const subCategories = new Set<string>();
  processedData.providers
    .filter(p => (p.category || 'Medical') === 'Medical')
    .forEach(provider => {
      subCategories.add(provider.subCategory || 'Others');
    });
  return Array.from(subCategories).sort();
}

/**
 * Gets categorized providers summary for API responses
 * Returns a structured format suitable for API endpoints
 */
export function getCategorizedProvidersSummary(
  processedData: ProcessedHealthData
): {
  categories: Array<{
    name: string;
    count: number;
    subCategories?: Array<{
      name: string;
      count: number;
    }>;
  }>;
  totalProviders: number;
} {
  const grouped = getProvidersByCategory(processedData);
  const categories: Array<{
    name: string;
    count: number;
    subCategories?: Array<{
      name: string;
      count: number;
    }>;
  }> = [];

  Object.keys(grouped).sort().forEach(category => {
    const subCategories: Array<{ name: string; count: number }> = [];
    let categoryCount = 0;

    Object.keys(grouped[category]).sort().forEach(subCategory => {
      const count = grouped[category][subCategory].length;
      categoryCount += count;
      subCategories.push({
        name: subCategory,
        count,
      });
    });

    categories.push({
      name: category,
      count: categoryCount,
      subCategories: category === 'Medical' ? subCategories : undefined,
    });
  });

  return {
    categories,
    totalProviders: processedData.providers.length,
  };
}

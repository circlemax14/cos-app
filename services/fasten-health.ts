/**
 * Fasten Health Data Service
 * 
 * This service parses and transforms FHIR bundle data from Fasten Health
 * into the application's data structures.
 */

import { HealthSummary, MedicalReport, Appointment, DoctorDiagnosis, Medication } from './openai';
export type { Appointment } from './openai';

// FHIR Resource Types
interface FHIRDiagnosticReport {
  resourceType: 'DiagnosticReport';
  id: string;
  status: string;
  category?: Array<{
    coding?: Array<{
      system?: string;
      code?: string;
      display?: string;
    }>;
    text?: string;
  }>;
  code: {
    coding?: Array<{
      system?: string;
      code?: string;
      display?: string;
    }>;
    text?: string;
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
  identifier?: Array<{
    use?: string;
    type?: {
      coding?: Array<{
        system?: string;
        code?: string;
        display?: string;
      }>;
      text?: string;
    };
    system?: string;
    value?: string;
  }>;
  resultsInterpreter?: Array<{
    reference?: string;
    type?: string;
    display?: string;
  }>;
  result?: Array<{
    reference?: string;
    display?: string;
  }>;
  conclusionCode?: Array<{
    coding?: Array<{
      system?: string;
      code?: string;
      display?: string;
    }>;
    text?: string;
  }>;
  presentedForm?: Array<{
    contentType?: string;
    url?: string;
    title?: string;
  }>;
}

interface FHIRObservation {
  resourceType: 'Observation';
  id: string;
  status?: string;
  code?: {
    coding?: Array<{
      system?: string;
      code?: string;
      display?: string;
    }>;
    text?: string;
  };
  valueQuantity?: {
    value?: number;
    unit?: string;
    system?: string;
    code?: string;
  };
  valueString?: string;
  valueCodeableConcept?: {
    coding?: Array<{
      system?: string;
      code?: string;
      display?: string;
    }>;
    text?: string;
  };
  effectiveDateTime?: string;
  interpretation?: Array<{
    coding?: Array<{
      system?: string;
      code?: string;
      display?: string;
    }>;
    text?: string;
  }>;
  component?: Array<{
    code?: {
      coding?: Array<{
        system?: string;
        code?: string;
        display?: string;
      }>;
      text?: string;
    };
    valueQuantity?: {
      value?: number;
      unit?: string;
    };
    valueString?: string;
    valueCodeableConcept?: {
      text?: string;
    };
  }>;
}

interface FHIRPatient {
  resourceType: 'Patient';
  id: string;
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
    text?: string;
    line?: string[];
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
    use?: string;
  }>;
  maritalStatus?: {
    text?: string;
    coding?: Array<{
      code?: string;
      display?: string;
    }>;
  };
  contact?: Array<{
    relationship?: Array<{
      coding?: Array<{
        code?: string;
        display?: string;
      }>;
      text?: string;
    }>;
    name?: {
      text?: string;
      family?: string;
      given?: string[];
    };
    telecom?: Array<{
      system?: string;
      value?: string;
      use?: string;
    }>;
  }>;
}

interface FHIRPractitioner {
  resourceType: 'Practitioner';
  id: string;
  name?: Array<{
    text?: string;
    family?: string;
    given?: string[];
    suffix?: string[];
  }>;
  telecom?: Array<{
    system?: string;
    value?: string;
    use?: string;
  }>;
}

interface FHIREncounter {
  resourceType: 'Encounter';
  id: string;
  status?: string;
  class?: {
    code?: string;
    display?: string;
  };
  type?: Array<{
    coding?: Array<{
      system?: string;
      code?: string;
      display?: string;
    }>;
    text?: string;
  }>;
  period?: {
    start?: string;
    end?: string;
  };
  participant?: Array<{
    individual?: {
      reference?: string;
      display?: string;
    };
  }>;
}

interface FHIRMedicationStatement {
  resourceType: 'MedicationStatement';
  id: string;
  status?: string;
  medicationCodeableConcept?: {
    coding?: Array<{
      system?: string;
      code?: string;
      display?: string;
    }>;
    text?: string;
  };
  dosage?: Array<{
    text?: string;
    timing?: {
      repeat?: {
        frequency?: number;
        period?: number;
        periodUnit?: string;
      };
    };
    doseAndRate?: Array<{
      doseQuantity?: {
        value?: number;
        unit?: string;
      };
    }>;
  }>;
  effectivePeriod?: {
    start?: string;
    end?: string;
  };
}

type FHIRResource = 
  | FHIRDiagnosticReport 
  | FHIRObservation 
  | FHIRPatient 
  | FHIRPractitioner 
  | FHIREncounter
  | FHIRMedicationStatement;

import { USE_MOCK_DATA, getFastenHealthDataName } from './fasten-health-config';
import { categorizeProvider } from './provider-categorization';

/**
 * Loads and parses the Fasten Health JSON bundle file
 * The file is now a JSON array of FHIR resources
 * Supports both original and mock data
 */
export async function loadFastenHealthData(): Promise<FHIRResource[]> {
  try {
    // Import the JSON file as a module
    // This works in React Native/Expo when the file is a proper JSON array
    const dataFile = USE_MOCK_DATA 
      ? require('../data/mock-fasten-health-data.json')
      : require('../data/fasten-health-data.json');
    
    const fastenData = dataFile;
    
    // Ensure it's an array
    if (Array.isArray(fastenData)) {
      console.log(`✅ Loaded ${fastenData.length} FHIR resources from ${getFastenHealthDataName()} data`);
      return fastenData as FHIRResource[];
    }
    
    // If it's a single object, wrap it in an array
    if (fastenData && typeof fastenData === 'object') {
      console.log(`✅ Loaded 1 FHIR resource from ${getFastenHealthDataName()} data`);
      return [fastenData as FHIRResource];
    }
    
    console.warn('Fasten Health data is not in expected format');
    return [];
  } catch (error) {
    console.error('Error loading Fasten Health data:', error);
    // Fallback to original data if mock data fails
    if (USE_MOCK_DATA) {
      console.log('Falling back to original data...');
      try {
        const originalData = require('../data/fasten-health-data.json');
        if (Array.isArray(originalData)) {
          return originalData as FHIRResource[];
        }
      } catch (fallbackError) {
        console.error('Error loading fallback data:', fallbackError);
      }
    }
    return [];
  }
}

/**
 * Transforms FHIR DiagnosticReport into MedicalReport format
 */
function transformDiagnosticReport(report: FHIRDiagnosticReport, observations: Map<string, FHIRObservation>): MedicalReport {
  const date = report.effectiveDateTime || report.issued || new Date().toISOString();
  const dateStr = new Date(date).toISOString().split('T')[0];
  
  // Determine report type from category
  let type = 'Lab Report';
  if (report.category && report.category.length > 0) {
    const categoryText = report.category[0].text || report.category[0].coding?.[0]?.display || '';
    if (categoryText.toLowerCase().includes('imaging') || categoryText.toLowerCase().includes('radiology')) {
      type = 'Imaging';
    } else if (categoryText.toLowerCase().includes('pathology')) {
      type = 'Pathology';
    } else if (categoryText.toLowerCase().includes('lab') || categoryText.toLowerCase().includes('laboratory')) {
      type = 'Lab Report';
    } else {
      type = categoryText || 'Medical Report';
    }
  }
  
  // Get report name from code (prefer static LOINC mapping if available)
  let reportName = report.code?.text || report.code?.coding?.[0]?.display || 'Medical Report';
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const loincJson = require('../data/loinc-map.json');
    if (loincJson && report.code?.coding) {
      for (const c of report.code.coding) {
        const code = c.code;
        if (code && loincJson[code]) {
          const li = loincJson[code];
          reportName = li.shortName || li.component || reportName;
          break;
        }
      }
    }
  } catch (e) {
    // ignore when static map not present
  }
  
  // Extract findings from observations
  const findings: string[] = [];
  if (report.result) {
    report.result.forEach(result => {
      if (result.reference) {
        const obsId = result.reference.split('/')[1];
        const observation = observations.get(obsId);
        if (observation) {
          // Helper: try to get a LOINC label for an observation or component
          interface LoincableResource {
            code?: { coding?: Array<{ code?: string; system?: string; display?: string }> };
            coding?: Array<{ code?: string; system?: string; display?: string }>;
          }
          const getLoincLabel = (obsOrComp: LoincableResource) => {
            try {
              // eslint-disable-next-line @typescript-eslint/no-var-requires
              const loincJson = require('../data/loinc-map.json');
              if (!loincJson) return undefined;
              const codings = obsOrComp.code?.coding || obsOrComp.coding || [];
              for (const coding of codings) {
                const code = coding.code;
                if (code && loincJson[code]) {
                  const li = loincJson[code];
                  return li.shortName || li.component || undefined;
                }
              }
            } catch (e) {
              // ignore
            }
            return undefined;
          };
          // Extract value from observation
          if (observation.valueQuantity) {
            const value = observation.valueQuantity.value;
            const unit = observation.valueQuantity.unit || '';
            const codeText = getLoincLabel(observation) || observation.code?.text || observation.code?.coding?.[0]?.display || '';
            if (value !== undefined) {
              findings.push(`${codeText}: ${value} ${unit}`.trim());
            }
          } else if (observation.valueString) {
            const codeText = getLoincLabel(observation) || observation.code?.text || observation.code?.coding?.[0]?.display || '';
            findings.push(`${codeText}: ${observation.valueString}`);
          } else if (observation.component) {
            // Handle component observations
            observation.component.forEach(comp => {
              const compText = getLoincLabel(comp) || comp.code?.text || comp.code?.coding?.[0]?.display || '';
              if (comp.valueQuantity) {
                const value = comp.valueQuantity.value;
                const unit = comp.valueQuantity.unit || '';
                if (value !== undefined) {
                  findings.push(`${compText}: ${value} ${unit}`.trim());
                }
              } else if (comp.valueString) {
                findings.push(`${compText}: ${comp.valueString}`);
              } else if (comp.valueCodeableConcept?.text) {
                findings.push(`${compText}: ${comp.valueCodeableConcept.text}`);
              }
            });
          }
        }
      }
    });
  }
  
  // Create summary from conclusion code or report name
  let summary = reportName;
  if (report.conclusionCode && report.conclusionCode.length > 0) {
    summary = report.conclusionCode[0].text || report.conclusionCode[0].coding?.[0]?.display || reportName;
  }
  
  return {
    date: dateStr,
    type,
    summary: `${reportName} - ${summary}`,
    findings: findings.length > 0 ? findings : [`${reportName} completed`],
  };
}

/**
 * Transforms FHIR resources into HealthSummary format
 */
export async function transformFastenHealthData(): Promise<HealthSummary> {
  const resources = await loadFastenHealthData();
  
  // Separate resources by type
  const diagnosticReports: FHIRDiagnosticReport[] = [];
  const observations: Map<string, FHIRObservation> = new Map();
  const patients: FHIRPatient[] = [];
  const practitioners: Map<string, FHIRPractitioner> = new Map();
  const encounters: Map<string, FHIREncounter> = new Map();
  const medications: FHIRMedicationStatement[] = [];
  
  resources.forEach((resource) => {
    switch (resource.resourceType) {
      case 'DiagnosticReport':
        diagnosticReports.push(resource as FHIRDiagnosticReport);
        break;
      case 'Observation':
        observations.set(resource.id, resource as FHIRObservation);
        break;
      case 'Patient':
        patients.push(resource as FHIRPatient);
        break;
      case 'Practitioner':
        practitioners.set(resource.id, resource as FHIRPractitioner);
        break;
      case 'Encounter':
        encounters.set(resource.id, resource as FHIREncounter);
        break;
      case 'MedicationStatement':
        medications.push(resource as FHIRMedicationStatement);
        break;
    }
  });
  
  // Transform diagnostic reports to medical reports
  const medicalReports: MedicalReport[] = diagnosticReports
    .sort((a, b) => {
      const dateA = a.effectiveDateTime || a.issued || '';
      const dateB = b.effectiveDateTime || b.issued || '';
      return new Date(dateB).getTime() - new Date(dateA).getTime();
    })
    .map(report => transformDiagnosticReport(report, observations))
    .slice(0, 20); // Limit to most recent 20 reports
  
  // Transform encounters to appointments
  const appointments: Appointment[] = [];
  diagnosticReports.forEach(report => {
    if (report.encounter?.reference) {
      const encounterId = report.encounter.reference.split('/')[1];
      const encounter = encounters.get(encounterId);
      const date = report.effectiveDateTime || report.issued || new Date().toISOString();
      const dateObj = new Date(date);
      
      // Get practitioner info
      let doctorName = 'Unknown Doctor';
      let doctorSpecialty = 'General';
      if (report.performer && report.performer.length > 0) {
        const performer = report.performer[0];
        if (performer.display) {
          doctorName = performer.display;
        } else if (performer.reference) {
          const practitionerId = performer.reference.split('/')[1];
          const practitioner = practitioners.get(practitionerId);
          if (practitioner?.name?.[0]) {
            doctorName = practitioner.name[0].text || 
              `${practitioner.name[0].given?.join(' ') || ''} ${practitioner.name[0].family || ''}`.trim();
          }
        }
      }
      
      // Determine appointment type from encounter
      let type = 'Follow-up';
      if (encounter?.type?.[0]?.text) {
        type = encounter.type[0].text;
      } else if (encounter?.class?.display) {
        type = encounter.class.display;
      }
      
      // Determine status
      let status = 'Completed';
      if (dateObj > new Date()) {
        status = 'Scheduled';
      }
      
      appointments.push({
        id: report.id,
        date: dateObj.toISOString().split('T')[0],
        time: dateObj.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
        type,
        status,
        doctorName,
        doctorSpecialty: report.category?.[0]?.text || 'General',
        diagnosis: report.conclusionCode?.[0]?.text || report.code?.text || undefined,
      });
    }
  });
  
  // Remove duplicates and sort appointments
  const uniqueAppointments = Array.from(
    new Map(appointments.map(apt => [apt.id, apt])).values()
  ).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  
  // Transform medications
  const transformedMedications: Medication[] = medications
    .filter(med => med.status === 'active' || med.status === 'completed')
    .map(med => {
      const name = med.medicationCodeableConcept?.text || 
        med.medicationCodeableConcept?.coding?.[0]?.display || 
        'Unknown Medication';
      
      const dosage = med.dosage?.[0]?.doseAndRate?.[0]?.doseQuantity 
        ? `${med.dosage[0].doseAndRate[0].doseQuantity.value}${med.dosage[0].doseAndRate[0].doseQuantity.unit || ''}`
        : med.dosage?.[0]?.text || 'As prescribed';
      
      const frequency = med.dosage?.[0]?.timing?.repeat
        ? `${med.dosage[0].timing.repeat.frequency || 1} times per ${med.dosage[0].timing.repeat.periodUnit || 'day'}`
        : med.dosage?.[0]?.text || 'As prescribed';
      
      return {
        name,
        dosage,
        frequency,
        purpose: 'Prescribed medication',
      };
    });
  
  // Create doctor diagnoses from diagnostic reports
  const doctorDiagnoses: DoctorDiagnosis[] = [];
  diagnosticReports.forEach(report => {
    if (report.conclusionCode && report.conclusionCode.length > 0) {
      let doctorName = 'Unknown Doctor';
      if (report.performer && report.performer.length > 0) {
        const practitionerRef = report.performer[0].reference;
        if (practitionerRef) {
          const practitionerId = practitionerRef.split('/')[1];
          const practitioner = practitioners.get(practitionerId);
          if (practitioner?.name?.[0]) {
            doctorName = practitioner.name[0].text || 
              `${practitioner.name[0].given?.join(' ') || ''} ${practitioner.name[0].family || ''}`.trim();
          }
        }
      }
      
      const date = report.effectiveDateTime || report.issued || new Date().toISOString();
      const diagnosis = report.conclusionCode[0].text || report.conclusionCode[0].coding?.[0]?.display || '';
      
      doctorDiagnoses.push({
        doctorName,
        doctorSpecialty: report.category?.[0]?.text || 'General',
        date: new Date(date).toISOString().split('T')[0],
        diagnosis,
        notes: report.code?.text || undefined,
      });
    }
  });
  
  // Remove duplicate diagnoses
  const uniqueDiagnoses = Array.from(
    new Map(doctorDiagnoses.map(d => [`${d.doctorName}-${d.date}-${d.diagnosis}`, d])).values()
  ).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  
  // Create treatment plan (simplified - in real app, this would come from CarePlan resources)
  const treatmentPlan = {
    plan: 'Comprehensive health monitoring and management',
    duration: 'Ongoing',
    goals: [
      'Monitor and manage chronic conditions',
      'Maintain optimal health metrics',
      'Prevent complications',
      'Improve overall wellness',
    ],
  };
  
  return {
    treatmentPlan,
    medicalReports,
    medications: transformedMedications.length > 0 ? transformedMedications : [],
    appointments: uniqueAppointments.length > 0 ? uniqueAppointments : undefined,
    doctorDiagnoses: uniqueDiagnoses.length > 0 ? uniqueDiagnoses : undefined,
  };
}

/**
 * Report interface matching the reports screen
 */
export interface Report {
  id: number;
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

/**
 * Transforms FHIR DiagnosticReport into Report format for the reports screen
 */
function transformDiagnosticReportToReport(
  report: FHIRDiagnosticReport,
  index: number,
  practitioners: Map<string, FHIRPractitioner>,
  encounters: Map<string, FHIREncounter>
): Report {
  const date = report.effectiveDateTime || report.issued || new Date().toISOString();
  const dateObj = new Date(date);
  const formattedDate = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  
  // Determine category
  let category = 'Medical Records';
  if (report.category && report.category.length > 0) {
    const categoryText = report.category[0].text || report.category[0].coding?.[0]?.display || '';
    if (categoryText.toLowerCase().includes('imaging') || categoryText.toLowerCase().includes('radiology')) {
      category = 'Imaging';
    } else if (categoryText.toLowerCase().includes('pathology')) {
      category = 'Pathology';
    } else if (categoryText.toLowerCase().includes('lab') || categoryText.toLowerCase().includes('laboratory')) {
      category = 'Lab Reports';
    } else {
      category = categoryText || 'Medical Records';
    }
  }
  
  // Get title from code (prefer static LOINC mapping when available)
  let title = report.code?.text || report.code?.coding?.[0]?.display || 'Medical Report';
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const loincJson = require('../data/loinc-map.json');
    if (loincJson && report.code?.coding) {
      for (const c of report.code.coding) {
        const code = c.code;
        if (code && loincJson[code]) {
          const li = loincJson[code];
          title = li.shortName || li.component || title;
          break;
        }
      }
    }
  } catch (e) {
    // ignore - static map may not be present
  }
  
  // Get provider from performer
  let provider = 'Unknown Provider';
  if (report.performer && report.performer.length > 0) {
    const performerRef = report.performer.find(p => p.type === 'Organization') || report.performer[0];
    if (performerRef?.display) {
      provider = performerRef.display;
    } else if (performerRef?.reference) {
      const practitionerId = performerRef.reference.split('/')[1];
      const practitioner = practitioners.get(practitionerId);
      if (practitioner?.name?.[0]) {
        provider = practitioner.name[0].text || 
          `${practitioner.name[0].given?.join(' ') || ''} ${practitioner.name[0].family || ''}`.trim();
      }
    }
  }
  
  // Determine status
  let status: 'Available' | 'Pending' | 'Completed' = 'Available';
  if (report.status === 'final') {
    status = 'Completed';
  } else if (report.status === 'preliminary' || report.status === 'registered') {
    status = 'Pending';
  }
  
  // Get accession number from identifier
  let accessionNumber: string | undefined;
  if (report.identifier && report.identifier.length > 0) {
    const fillerId = report.identifier.find((id) =>
      id.type?.coding?.[0]?.code === 'FILL' ||
      id.system?.includes('accession-number')
    );
    if (fillerId?.value) {
      accessionNumber = fillerId.value;
    }
  }
  
  // Get order number from identifier
  let orderNumber: string | undefined;
  if (report.identifier && report.identifier.length > 0) {
    const placerId = report.identifier.find((id) =>
      id.type?.coding?.[0]?.code === 'PLAC'
    );
    if (placerId?.value) {
      orderNumber = placerId.value;
    }
  }
  
  // Get impression from conclusion code
  let impression: string | undefined;
  if (report.conclusionCode && report.conclusionCode.length > 0) {
    impression = report.conclusionCode[0].text || report.conclusionCode[0].coding?.[0]?.display;
  }
  
  // Get interpreted by from resultsInterpreter or performer
  let interpretedBy: string | undefined;
  if (report.resultsInterpreter && report.resultsInterpreter.length > 0) {
    const interpreter = report.resultsInterpreter[0];
    if (interpreter.display) {
      interpretedBy = interpreter.display;
    } else if (interpreter.reference) {
      const practitionerId = interpreter.reference.split('/')[1];
      const practitioner = practitioners.get(practitionerId);
      if (practitioner?.name?.[0]) {
        interpretedBy = practitioner.name[0].text || 
          `${practitioner.name[0].given?.join(' ') || ''} ${practitioner.name[0].family || ''}`.trim();
      }
    }
  } else if (report.performer && report.performer.length > 0) {
    const practitionerRef = report.performer.find(p => p.type === 'Practitioner');
    if (practitionerRef?.display) {
      interpretedBy = practitionerRef.display;
    }
  }
  
  // Get signed info
  const signedBy = interpretedBy;
  const signedOn = report.issued ? new Date(report.issued).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }) : undefined;
  
  // Get performing facility
  let performingFacility: Report['performingFacility'] | undefined;
  if (report.performer) {
    const orgPerformer = report.performer.find(p => p.type === 'Organization');
    if (orgPerformer?.display) {
      performingFacility = {
        name: orgPerformer.display,
        address: '',
        city: '',
        state: '',
        zip: '',
      };
    }
  }
  
  // Get clinical history from encounter
  let clinicalHistory: string | undefined;
  if (report.encounter?.reference) {
    const encounterId = report.encounter.reference.split('/')[1];
    const encounter = encounters.get(encounterId);
    if (encounter?.type?.[0]?.text) {
      clinicalHistory = encounter.type[0].text;
    }
  }
  
  // Determine file type
  let fileType: string | undefined;
  if (report.presentedForm && report.presentedForm.length > 0) {
    const contentType = report.presentedForm[0].contentType;
    if (contentType?.includes('pdf')) {
      fileType = 'PDF';
    } else if (contentType?.includes('dicom') || contentType?.includes('image')) {
      fileType = 'DICOM';
    }
  } else {
    // Default based on category
    fileType = category === 'Imaging' ? 'DICOM' : 'PDF';
  }
  
  return {
    id: index + 1,
    title,
    category,
    provider,
    date: formattedDate,
    status,
    description: title,
    fileType,
    exam: title,
    clinicalHistory,
    technique: category === 'Imaging' ? 'Standard imaging protocol' : undefined,
    findings: impression, // Using impression as findings for now
    impression,
    interpretedBy,
    signedBy,
    signedOn,
    accessionNumber,
    orderNumber,
    performingFacility,
  };
}

/**
 * Gets diagnostic reports transformed for the reports screen
 */
export async function getFastenDiagnosticReports(): Promise<Report[]> {
  const resources = await loadFastenHealthData();
  
  // Separate resources by type
  const diagnosticReports: FHIRDiagnosticReport[] = [];
  const practitioners: Map<string, FHIRPractitioner> = new Map();
  const encounters: Map<string, FHIREncounter> = new Map();
  
  resources.forEach((resource) => {
    switch (resource.resourceType) {
      case 'DiagnosticReport':
        diagnosticReports.push(resource as FHIRDiagnosticReport);
        break;
      case 'Practitioner':
        practitioners.set(resource.id, resource as FHIRPractitioner);
        break;
      case 'Encounter':
        encounters.set(resource.id, resource as FHIREncounter);
        break;
    }
  });

  // Sort by date (most recent first)
  diagnosticReports.sort((a, b) => {
    const dateA = a.effectiveDateTime || a.issued || '';
    const dateB = b.effectiveDateTime || b.issued || '';
    return new Date(dateB).getTime() - new Date(dateA).getTime();
  });
  
  // Transform to Report format
  return diagnosticReports.map((report, index) => 
    transformDiagnosticReportToReport(report, index, practitioners, encounters)
  );
}

/**
 * Provider interface for home screen
 */
export interface Provider {
  id: string;
  name: string;
  qualifications?: string;
  specialty?: string;
  image?: number | { uri: string }; // For React Native image require or URI (currently not available in FHIR data)
  photoUrl?: string; // URL to profile photo if available
  phone?: string;
  email?: string;
  category?: string; // Main category (Medical, Mental Health, Family, etc.)
  subCategory?: string; // Primary subcategory for Medical providers (PCP, All Specialists, etc.) - for backward compatibility
  subCategories?: string[]; // All applicable subcategories (allows multiple)
  lastVisited?: string; // ISO date string of the most recent encounter/appointment with this provider
}

/**
 * Patient interface
 */
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
  photoUrl?: string; // URL to profile photo if available
  emergencyContact?: {
    name?: string;
    relationship?: string;
    phone?: string;
  };
}

/**
 * Gets practitioners transformed for the home screen
 */
export async function getFastenPractitioners(): Promise<Provider[]> {
  const resources = await loadFastenHealthData();
  
  const practitioners: FHIRPractitioner[] = [];
  const diagnosticReports: FHIRDiagnosticReport[] = [];
  const encounters: Map<string, FHIREncounter> = new Map();
  
  resources.forEach((resource) => {
    switch (resource.resourceType) {
      case 'Practitioner':
        practitioners.push(resource as FHIRPractitioner);
        break;
      case 'DiagnosticReport':
        diagnosticReports.push(resource as FHIRDiagnosticReport);
        break;
      case 'Encounter':
        encounters.set(resource.id, resource as FHIREncounter);
        break;
    }
  });
  
  // Count engagements (diagnostic reports/encounters) per practitioner
  const practitionerEngagementCount: Map<string, number> = new Map();
  // Track last visited date per practitioner
  const practitionerLastVisited: Map<string, Date> = new Map();
  
  diagnosticReports.forEach(report => {
    const reportDate = report.effectiveDateTime || report.issued;
    const reportDateObj = reportDate ? new Date(reportDate) : null;
    
    // Count performers that are practitioners (not organizations)
    if (report.performer && report.performer.length > 0) {
      report.performer.forEach(performer => {
        // Only count if it's a Practitioner type or if type is not specified (assume Practitioner)
        if (performer.reference && (!performer.type || performer.type === 'Practitioner')) {
          const practitionerId = performer.reference.split('/')[1];
          if (practitionerId) {
            const currentCount = practitionerEngagementCount.get(practitionerId) || 0;
            practitionerEngagementCount.set(practitionerId, currentCount + 1);
            
            // Update last visited date if this report is more recent
            if (reportDateObj && (!practitionerLastVisited.has(practitionerId) || 
                reportDateObj > practitionerLastVisited.get(practitionerId)!)) {
              practitionerLastVisited.set(practitionerId, reportDateObj);
            }
          }
        }
      });
    }
    
    // Also count resultsInterpreter if it references a practitioner
    if (report.resultsInterpreter && report.resultsInterpreter.length > 0) {
      report.resultsInterpreter.forEach(interpreter => {
        if (interpreter.reference) {
          const practitionerId = interpreter.reference.split('/')[1];
          if (practitionerId) {
            const currentCount = practitionerEngagementCount.get(practitionerId) || 0;
            practitionerEngagementCount.set(practitionerId, currentCount + 1);
            
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
  
  // Also count encounters that reference practitioners
  encounters.forEach(encounter => {
    // Get encounter date from period or use current date as fallback
    const encounterDate = encounter.period?.start || encounter.period?.end;
    const encounterDateObj = encounterDate ? new Date(encounterDate) : null;
    
    // Check if encounter has participant references to practitioners
    if (encounter.participant) {
      encounter.participant.forEach((participant) => {
        if (participant.individual?.reference) {
          const practitionerId = participant.individual.reference.split('/')[1];
          if (practitionerId) {
            const currentCount = practitionerEngagementCount.get(practitionerId) || 0;
            practitionerEngagementCount.set(practitionerId, currentCount + 1);
            
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
  
  // Transform practitioners to Provider format with engagement count
  const providersWithEngagement = practitioners.map((practitioner, index) => {
    const nameObj = practitioner.name?.[0] || {};
    const fullName = nameObj.text || 
      `${nameObj.given?.join(' ') || ''} ${nameObj.family || ''}`.trim() ||
      `Provider ${index + 1}`;
    
    // Extract qualifications from suffix or name
    let qualifications = '';
    if (nameObj.suffix && nameObj.suffix.length > 0) {
      qualifications = nameObj.suffix.join(', ');
    } else if (fullName.includes('MD')) {
      qualifications = 'MD';
    } else if (fullName.includes('DO')) {
      qualifications = 'DO';
    } else if (fullName.includes('PA')) {
      qualifications = 'PA-C';
    } else if (fullName.includes('NP')) {
      qualifications = 'NP';
    }
    
    // Try to extract specialty from qualifications or name
    let specialty = '';
    if (fullName.toLowerCase().includes('cardiology') || fullName.toLowerCase().includes('cardiac')) {
      specialty = 'Cardiology';
    } else if (fullName.toLowerCase().includes('neurology') || fullName.toLowerCase().includes('neuro')) {
      specialty = 'Neurology';
    } else if (fullName.toLowerCase().includes('pediatric')) {
      specialty = 'Pediatrics';
    } else if (fullName.toLowerCase().includes('ortho')) {
      specialty = 'Orthopedics';
    }
    
    // Extract contact info
    const phone = practitioner.telecom?.find(t => t.system === 'phone')?.value || '';
    const email = practitioner.telecom?.find(t => t.system === 'email')?.value || '';
    
    const engagementCount = practitionerEngagementCount.get(practitioner.id) || 0;
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
      qualifications: qualifications || 'Healthcare Provider',
      specialty: specialty || 'General',
      phone,
      email,
      category: categorization.category,
      subCategory: categorization.subCategory, // Primary subcategory for backward compatibility
      subCategories: categorization.subCategories, // All applicable subcategories
      engagementCount, // Add engagement count for sorting
      lastVisited: lastVisitedDate ? lastVisitedDate.toISOString() : undefined,
    };
  });
  
  // Sort by last visited date in descending order (most recently visited first), then by engagement count
  return providersWithEngagement.sort((a, b) => {
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
    const countA = a.engagementCount || 0;
    const countB = b.engagementCount || 0;
    return countB - countA; // Descending order
  });
}

/**
 * Gets a specific practitioner by ID with full details
 */
export async function getFastenPractitionerById(practitionerId: string): Promise<Provider | null> {
  const resources = await loadFastenHealthData();
  
  const practitioner = resources.find((r) =>
    r.resourceType === 'Practitioner' && r.id === practitionerId
  ) as FHIRPractitioner | undefined;
  
  if (!practitioner) {
    return null;
  }
  
  const nameObj = practitioner.name?.[0] || {};
  const fullName = nameObj.text || 
    `${nameObj.given?.join(' ') || ''} ${nameObj.family || ''}`.trim() ||
    'Unknown Provider';
  
  // Extract qualifications from suffix or name
  let qualifications = '';
  if (nameObj.suffix && nameObj.suffix.length > 0) {
    qualifications = nameObj.suffix.join(', ');
  } else if (fullName.includes('MD')) {
    qualifications = 'MD';
  } else if (fullName.includes('DO')) {
    qualifications = 'DO';
  } else if (fullName.includes('PA')) {
    qualifications = 'PA-C';
  } else if (fullName.includes('NP')) {
    qualifications = 'NP';
  }
  
  // Try to extract specialty from qualifications or name
  let specialty = '';
  if (fullName.toLowerCase().includes('cardiology') || fullName.toLowerCase().includes('cardiac')) {
    specialty = 'Cardiology';
  } else if (fullName.toLowerCase().includes('neurology') || fullName.toLowerCase().includes('neuro')) {
    specialty = 'Neurology';
  } else if (fullName.toLowerCase().includes('pediatric')) {
    specialty = 'Pediatrics';
  } else if (fullName.toLowerCase().includes('ortho')) {
    specialty = 'Orthopedics';
  }
  
  // Extract contact info
  const phone = practitioner.telecom?.find(t => t.system === 'phone')?.value || '';
  const email = practitioner.telecom?.find(t => t.system === 'email')?.value || '';
  
  // Categorize provider
  const categorization = categorizeProvider({
    qualifications,
    specialty,
    name: fullName,
  });
  
  return {
    id: practitioner.id,
    name: fullName,
    qualifications: qualifications || 'Healthcare Provider',
    specialty: specialty || 'General',
    phone,
    email,
    category: categorization.category,
    subCategory: categorization.subCategory, // Primary subcategory for backward compatibility
    subCategories: categorization.subCategories, // All applicable subcategories
  };
}

/**
 * Gets unique practitioners grouped by category/specialty for departments
 * Categories providers by their qualifications and specialty
 */
export async function getFastenPractitionersByDepartment(): Promise<Array<{
  id: string;
  name: string;
  doctors: Provider[];
}>> {
  const providers = await getFastenPractitioners();
  
  // Group by category - use specialty if available, otherwise group by provider type
  const categoryMap = new Map<string, Provider[]>();
  
  providers.forEach(provider => {
    let category = provider.specialty || 'General';
    
    // If specialty is General, try to categorize by qualifications
    if (category === 'General') {
      const quals = (provider.qualifications || '').toLowerCase();
      const name = provider.name.toLowerCase();
      
      if (quals.includes('md') || name.includes('md')) {
        category = 'Physicians';
      } else if (quals.includes('pa') || name.includes('pa')) {
        category = 'Physician Assistants';
      } else if (quals.includes('np') || name.includes('np')) {
        category = 'Nurse Practitioners';
      } else if (quals.includes('rn') || name.includes('nurse')) {
        category = 'Nurses';
      } else {
        category = 'Healthcare Providers';
      }
    }
    
    if (!categoryMap.has(category)) {
      categoryMap.set(category, []);
    }
    categoryMap.get(category)!.push(provider);
  });
  
  // Convert to array format
  const departments: Array<{ id: string; name: string; doctors: Provider[] }> = [];
  
  categoryMap.forEach((doctors, category) => {
    // Sort doctors within each department by lastVisited in descending order
    const sortedDoctors = [...doctors].sort((a, b) => {
      const dateA = a.lastVisited ? new Date(a.lastVisited).getTime() : 0;
      const dateB = b.lastVisited ? new Date(b.lastVisited).getTime() : 0;
      
      // If both have dates, sort by date descending
      if (dateA > 0 && dateB > 0) {
        return dateB - dateA; // Descending order (most recent first)
      }
      // If only one has a date, prioritize it
      if (dateA > 0 && dateB === 0) return -1;
      if (dateB > 0 && dateA === 0) return 1;
      
      // If neither has a date, maintain original order
      return 0;
    });
    
    departments.push({
      id: category.toLowerCase().replace(/\s+/g, '-'),
      name: category,
      doctors: sortedDoctors, // Show all providers, sorted by lastVisited
    });
  });
  
  // Sort by category name
  departments.sort((a, b) => a.name.localeCompare(b.name));
  
  return departments;
}

/**
 * Gets patient data from Fasten Health JSON
 */
export async function getFastenPatient(): Promise<Patient | null> {
  const resources = await loadFastenHealthData();
  
  // Find patient resource
  const patientResource = resources.find((r) => r.resourceType === 'Patient') as FHIRPatient | undefined;
  
  if (!patientResource) {
    return null;
  }
  
  // Extract name
  const nameObj = patientResource.name?.find(n => n.use === 'official') || patientResource.name?.[0] || {};
  const fullName = nameObj.text || 
    `${nameObj.given?.join(' ') || ''} ${nameObj.family || ''}`.trim() ||
    'Unknown Patient';
  
  const firstName = nameObj.given?.[0] || '';
  const lastName = nameObj.family || '';
  
  // Extract contact info
  const phone = patientResource.telecom?.find(t => t.system === 'phone' && t.use === 'home')?.value ||
    patientResource.telecom?.find(t => t.system === 'phone')?.value ||
    '';
  
  const email = patientResource.telecom?.find(t => t.system === 'email')?.value || '';
  
  // Extract address
  const addressObj = patientResource.address?.find(a => a.use === 'home') || patientResource.address?.[0];
  const addressLine = addressObj?.line?.[0] || '';
  const city = addressObj?.city || '';
  const state = addressObj?.state || '';
  const zipCode = addressObj?.postalCode || '';
  const country = addressObj?.country || '';
  const fullAddress = addressObj?.text || addressLine;
  
  // Extract marital status
  const maritalStatus = patientResource.maritalStatus?.text || 
    patientResource.maritalStatus?.coding?.[0]?.display || '';
  
  // Extract emergency contact
  let emergencyContact: Patient['emergencyContact'] | undefined;
  const contact = patientResource.contact?.find(c => 
    c.relationship?.some(r => 
      r.coding?.some(coding => coding.code === 'C' || coding.display?.toLowerCase().includes('emergency'))
    )
  );
  
  if (contact) {
    const contactName = contact.name?.text || 
      `${contact.name?.given?.join(' ') || ''} ${contact.name?.family || ''}`.trim();
    const relationship = contact.relationship?.[0]?.text || 
      contact.relationship?.[0]?.coding?.[0]?.display || '';
    const contactPhone = contact.telecom?.find(t => t.system === 'phone')?.value || '';
    
    emergencyContact = {
      name: contactName,
      relationship,
      phone: contactPhone,
    };
  }
  
  return {
    id: patientResource.id,
    name: fullName,
    firstName,
    lastName,
    email,
    phone,
    dateOfBirth: patientResource.birthDate,
    gender: patientResource.gender ? 
      patientResource.gender.charAt(0).toUpperCase() + patientResource.gender.slice(1) : 
      undefined,
    address: addressLine,
    city,
    state,
    zipCode,
    country,
    maritalStatus,
    emergencyContact,
  };
}

/**
 * Treatment Plan interface for doctor detail page
 */
export interface TreatmentPlanItem {
  id: string;
  title: string;
  status: 'Active' | 'Completed';
  date: string;
  diagnosis: string;
  description: string;
  medications: string[];
}

/**
 * Progress Note interface for doctor detail page
 */
export interface ProgressNote {
  id: string;
  date: string;
  time: string;
  author: string;
  note: string;
}

/**
 * Appointment interface for doctor detail page
 */
export interface ProviderAppointment {
  id: string;
  date: string;
  time: string;
  type: string;
  status: 'Confirmed' | 'Pending' | 'Completed';
}

/**
 * Gets diagnosis and treatment plans for a specific provider
 */
export async function getProviderDiagnosesAndTreatmentPlans(practitionerId: string): Promise<TreatmentPlanItem[]> {
  const resources = await loadFastenHealthData();
  
  const diagnosticReports: FHIRDiagnosticReport[] = [];
  const practitioners: Map<string, FHIRPractitioner> = new Map();
  const medications: FHIRMedicationStatement[] = [];
  
  resources.forEach((resource) => {
    switch (resource.resourceType) {
      case 'DiagnosticReport':
        diagnosticReports.push(resource as FHIRDiagnosticReport);
        break;
      case 'Practitioner':
        practitioners.set(resource.id, resource as FHIRPractitioner);
        break;
      case 'MedicationStatement':
        medications.push(resource as FHIRMedicationStatement);
        break;
    }
  });

  // Filter reports by practitioner
  const providerReports = diagnosticReports.filter(report => {
    if (report.performer && report.performer.length > 0) {
      const performer = report.performer[0];
      if (performer.reference) {
        const reportPractitionerId = performer.reference.split('/')[1];
        return reportPractitionerId === practitionerId;
      }
    }
    return false;
  });
  
  // Sort reports by date descending (most recent first)
  providerReports.sort((a, b) => {
    const dateA = a.effectiveDateTime || a.issued || new Date().toISOString();
    const dateB = b.effectiveDateTime || b.issued || new Date().toISOString();
    return new Date(dateB).getTime() - new Date(dateA).getTime();
  });
  
  // Transform to treatment plans
  const treatmentPlans: TreatmentPlanItem[] = [];
  
  providerReports.forEach((report, index) => {
    const date = report.effectiveDateTime || report.issued || new Date().toISOString();
    const dateObj = new Date(date);
    const isActive = dateObj > new Date(Date.now() - 90 * 24 * 60 * 60 * 1000); // Active if within last 90 days
    
    let diagnosis = report.conclusionCode?.[0]?.text || 
                    report.conclusionCode?.[0]?.coding?.[0]?.display || 
                    report.code?.text || 
                    'No diagnosis recorded';
    
    let description = report.code?.text || 
                      report.category?.[0]?.text || 
                      'Treatment plan details';
    
    // Prefer static LOINC mapping labels when available to normalize diagnosis/description
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const loincJson = require('../data/loinc-map.json');
      if (loincJson && report.code?.coding) {
        for (const c of report.code.coding) {
          const code = c.code;
          if (code && loincJson[code]) {
            const li = loincJson[code];
            // prefer shortName, then component, then property
            const mappedLabel = li.shortName || li.component || li.property;
            if (mappedLabel) {
              // Use mapped label for diagnosis if diagnosis is missing or generic
              if (!diagnosis || diagnosis === 'No diagnosis recorded') {
                diagnosis = mappedLabel;
              }
              // Use mapped label as description if description is generic or equals raw code text
              if (!description || description === 'Treatment plan details' || description === report.code?.text) {
                description = mappedLabel;
              }
            }
          }
        }
      }
    } catch (e) {
      // ignore if static map not present
    }
    
    // Get medications from medication statements (simplified - in real app would link by encounter)
    const reportMedications = medications
      .filter(med => med.status === 'active')
      .slice(0, 3) // Limit to 3 medications per plan
      .map(med => {
        const name = med.medicationCodeableConcept?.text || 
                    med.medicationCodeableConcept?.coding?.[0]?.display || 
                    'Unknown Medication';
        const dosage = med.dosage?.[0]?.doseAndRate?.[0]?.doseQuantity 
          ? `${med.dosage[0].doseAndRate[0].doseQuantity.value}${med.dosage[0].doseAndRate[0].doseQuantity.unit || ''}`
          : '';
        return dosage ? `${name} ${dosage}` : name;
      });
    
    const formattedDate = dateObj.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });
    
    // Determine if this is the most recent report
    const isMostRecent = index === 0;
    const previousEndDate = index === 1 && providerReports.length > 1 
      ? new Date(providerReports[0].effectiveDateTime || providerReports[0].issued || new Date().toISOString())
          .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : '';
    
    treatmentPlans.push({
      id: report.id,
      title: isMostRecent ? 'Current Diagnosis & Treatment Plan' : 'Previous Diagnosis & Treatment Recommendations',
      status: isActive ? 'Active' : 'Completed',
      date: isMostRecent 
        ? `Started ${formattedDate}` 
        : previousEndDate 
          ? `${formattedDate} - ${previousEndDate}`
          : formattedDate,
      diagnosis,
      description,
      medications: reportMedications.length > 0 ? reportMedications : ['No medications recorded'],
    });
  });
  
  // Already sorted by date descending (most recent first)
  return treatmentPlans;
}

/**
 * Gets progress notes for a specific provider
 */
export async function getProviderProgressNotes(practitionerId: string): Promise<ProgressNote[]> {
  const resources = await loadFastenHealthData();
  
  const diagnosticReports: FHIRDiagnosticReport[] = [];
  const practitioners: Map<string, FHIRPractitioner> = new Map();
  
  resources.forEach((resource) => {
    switch (resource.resourceType) {
      case 'DiagnosticReport':
        diagnosticReports.push(resource as FHIRDiagnosticReport);
        break;
      case 'Practitioner':
        practitioners.set(resource.id, resource as FHIRPractitioner);
        break;
    }
  });

  // Get practitioner name
  const practitioner = practitioners.get(practitionerId);
  const practitionerName = practitioner?.name?.[0]?.text || 
                          (practitioner?.name?.[0] 
                            ? `${practitioner.name[0].given?.join(' ') || ''} ${practitioner.name[0].family || ''}`.trim()
                            : 'Unknown Provider');
  
  // Filter reports by practitioner
  const providerReports = diagnosticReports.filter(report => {
    if (report.performer && report.performer.length > 0) {
      const performer = report.performer[0];
      if (performer.reference) {
        const reportPractitionerId = performer.reference.split('/')[1];
        return reportPractitionerId === practitionerId;
      }
    }
    return false;
  });
  
  // Sort reports by date descending (most recent first) BEFORE formatting
  providerReports.sort((a, b) => {
    const dateA = a.effectiveDateTime || a.issued || new Date().toISOString();
    const dateB = b.effectiveDateTime || b.issued || new Date().toISOString();
    return new Date(dateB).getTime() - new Date(dateA).getTime();
  });
  
  // Transform to progress notes (already sorted)
  const progressNotes: ProgressNote[] = providerReports.map(report => {
    const date = report.effectiveDateTime || report.issued || new Date().toISOString();
    const dateObj = new Date(date);
    
    const formattedDate = dateObj.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });
    
    const formattedTime = dateObj.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit', 
      hour12: true 
    });
    
    let note = report.code?.text || 
               report.conclusionCode?.[0]?.text || 
               report.category?.[0]?.text || 
               'Progress note recorded';
    // Prefer static LOINC mapping label when present
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const loincJson = require('../data/loinc-map.json');
      if (loincJson && report.code?.coding) {
        for (const c of report.code.coding) {
          const code = c.code;
          if (code && loincJson[code]) {
            const li = loincJson[code];
            const mapped = li.shortName || li.component || li.property;
            if (mapped) {
              note = mapped;
              break;
            }
          }
        }
      }
    } catch (e) {
      // ignore
    }
    
    return {
      id: report.id,
      date: formattedDate,
      time: formattedTime,
      author: practitionerName,
      note,
    };
  });
  
  // Already sorted by date descending (most recent first)
  return progressNotes;
}

/**
 * Gets appointments for a specific provider
 */
export async function getProviderAppointments(practitionerId: string): Promise<ProviderAppointment[]> {
  const resources = await loadFastenHealthData();
  
  const diagnosticReports: FHIRDiagnosticReport[] = [];
  const encounters: Map<string, FHIREncounter> = new Map();
  
  resources.forEach((resource) => {
    switch (resource.resourceType) {
      case 'DiagnosticReport':
        diagnosticReports.push(resource as FHIRDiagnosticReport);
        break;
      case 'Encounter':
        encounters.set(resource.id, resource as FHIREncounter);
        break;
    }
  });

  // Filter reports by practitioner and get linked encounters
  const providerAppointments: ProviderAppointment[] = [];
  
  diagnosticReports.forEach(report => {
    // Check if report is from this practitioner
    let isProviderReport = false;
    if (report.performer && report.performer.length > 0) {
      const performer = report.performer[0];
      if (performer.reference) {
        const reportPractitionerId = performer.reference.split('/')[1];
        isProviderReport = reportPractitionerId === practitionerId;
      }
    }
    
    if (isProviderReport && report.encounter?.reference) {
      const encounterId = report.encounter.reference.split('/')[1];
      const encounter = encounters.get(encounterId);
      
      if (encounter) {
        const date = report.effectiveDateTime || report.issued || new Date().toISOString();
        const dateObj = new Date(date);
        
        const formattedDate = dateObj.toLocaleDateString('en-US', { 
          month: 'short', 
          day: 'numeric', 
          year: 'numeric' 
        });
        
        const formattedTime = dateObj.toLocaleTimeString('en-US', { 
          hour: 'numeric', 
          minute: '2-digit', 
          hour12: true 
        });
        
        const type = encounter.type?.[0]?.text || 
                    encounter.class?.display || 
                    'Follow-up';
        
        let status: 'Confirmed' | 'Pending' | 'Completed' = 'Completed';
        if (dateObj > new Date()) {
          status = 'Confirmed';
        } else if (encounter.status === 'planned' || encounter.status === 'arrived') {
          status = 'Pending';
        }
        
        providerAppointments.push({
          id: report.id,
          date: formattedDate,
          time: formattedTime,
          type,
          status,
        });
      }
    }
  });
  
  // Remove duplicates and sort by date descending (most recent first)
  const uniqueAppointments = Array.from(
    new Map(providerAppointments.map(apt => [apt.id, apt])).values()
  ).sort((a, b) => {
    const dateA = new Date(a.date + ' ' + a.time).getTime();
    const dateB = new Date(b.date + ' ' + b.time).getTime();
    return dateB - dateA;
  });
  
  return uniqueAppointments;
}

/**
 * Gets current medications from Fasten Health
 */
export async function getFastenMedications(): Promise<Medication[]> {
  const resources = await loadFastenHealthData();
  
  const medications: FHIRMedicationStatement[] = [];
  
  resources.forEach((resource) => {
    if (resource.resourceType === 'MedicationStatement') {
      medications.push(resource as FHIRMedicationStatement);
    }
  });
  
  // Transform medications - only get active ones
  const transformedMedications: Medication[] = medications
    .filter(med => med.status === 'active')
    .map(med => {
      const name = med.medicationCodeableConcept?.text || 
        med.medicationCodeableConcept?.coding?.[0]?.display || 
        'Unknown Medication';
      
      const dosage = med.dosage?.[0]?.doseAndRate?.[0]?.doseQuantity 
        ? `${med.dosage[0].doseAndRate[0].doseQuantity.value}${med.dosage[0].doseAndRate[0].doseQuantity.unit || ''}`
        : med.dosage?.[0]?.text || 'As prescribed';
      
      const frequency = med.dosage?.[0]?.timing?.repeat
        ? `${med.dosage[0].timing.repeat.frequency || 1} times per ${med.dosage[0].timing.repeat.periodUnit || 'day'}`
        : med.dosage?.[0]?.text || 'As prescribed';
      
      // Try to extract purpose from medication name or use default
      let purpose = 'Prescribed medication';
      const nameLower = name.toLowerCase();
      if (nameLower.includes('metformin') || nameLower.includes('glucophage')) {
        purpose = 'Diabetes management';
      } else if (nameLower.includes('lisinopril') || nameLower.includes('ace inhibitor')) {
        purpose = 'Blood pressure control';
      } else if (nameLower.includes('aspirin')) {
        purpose = 'Cardiovascular protection';
      } else if (nameLower.includes('statin') || nameLower.includes('atorvastatin') || nameLower.includes('simvastatin')) {
        purpose = 'Cholesterol management';
      } else if (nameLower.includes('insulin')) {
        purpose = 'Blood sugar control';
      }
      
      return {
        name,
        dosage,
        frequency,
        purpose,
      };
    });
  
  // Sort by name for consistency
  return transformedMedications.sort((a, b) => a.name.localeCompare(b.name));
}


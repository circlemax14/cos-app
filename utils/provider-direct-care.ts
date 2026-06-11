import type { Provider } from '@/services/api/types';

/**
 * SCRUM-265 #6: classifies whether a provider is a *direct-care* clinician
 * the patient interacts with face-to-face (PCP, specialist, therapist) vs
 * an indirect-care role (pharmacist, lab tech, radiologist) that should
 * still show in the list but be rendered inactive — adding a pharmacist
 * to the Circle of Support doesn't match how patients think about care
 * relationships, and clicking through to their detail card produces no
 * useful data.
 *
 * Combined with the `hasData` flag from the providers API, this drives
 * the `inactive` prop on DoctorCard.
 */

const INDIRECT_CARE_KEYWORDS = [
  'pharmac',     // Pharmacy / Pharmacist / Pharmacology
  'radiolog',    // Radiology / Radiologist (often imaging-only)
  'patholog',    // Pathology / Pathologist (lab-only)
  'laborator',   // Laboratory medicine
  'anesthesiol', // Anesthesiology
  'nuclear medicine',
];

export type ProviderInactiveReason = 'indirect-care';

export function providerInactiveReason(p: Provider): ProviderInactiveReason | null {
  // SCRUM-279 (2026-06-11 build 41): no-records gate removed — Ken
  // reported he couldn't add real providers to his circle because the
  // backend was returning hasData:false / recordCount:0 for many real
  // doctors (data may have arrived later, or never indexed). Only
  // hard-block indirect-care specialties (pharmacy / lab / etc.) — the
  // detail screen handles empty clinical data gracefully on its own.
  const haystack = `${p.specialty ?? ''} ${p.qualifications ?? ''} ${p.subCategory ?? ''} ${(p.subCategories ?? []).join(' ')}`.toLowerCase();
  if (INDIRECT_CARE_KEYWORDS.some((kw) => haystack.includes(kw))) {
    return 'indirect-care';
  }
  return null;
}

export function inactiveLabel(reason: ProviderInactiveReason): string {
  switch (reason) {
    case 'indirect-care':
      return 'Support role';
  }
}

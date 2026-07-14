import { getCategoryIcon, getSubCategoryIcon } from './category-icons';

/**
 * Category groups for Circle of Support
 * Structure: Category -> Sub-categories -> Providers
 *
 * Four active categories, arranged to span the biopsychosocial spectrum:
 *  1. Care Manager   – EHR-linked agencies (coordination axis)
 *  2. Medical        – EHR-linked practitioners (biological axis)
 *  3. Psychological  – mental-health supports (manual add; provider-
 *                      categorization.ts still routes EHR psychiatrists
 *                      to Medical > Others until Track B teaches it
 *                      about this category)
 *  4. Social         – family, friends, neighbors, community, faith
 *                      (fully manual — FHIR doesn't model these)
 *  (Integrative – Non-EHR providers – temporarily disabled)
 */

export interface SubCategory {
  id: string;
  name: string;
  keywords: string[]; // Keywords to match providers to this sub-category
  icon?: string; // Optional icon name
}

export interface Category {
  id: string;
  name: string;
  subCategories: SubCategory[];
  icon?: string; // Optional icon name
}

export const SUPPORT_CATEGORIES: Category[] = [
  {
    id: 'care-manager',
    name: 'Care Manager',
    icon: getCategoryIcon('care-manager'),
    subCategories: [],
  },
  {
    id: 'medical',
    name: 'Medical',
    icon: getCategoryIcon('medical'),
    subCategories: [
      { id: 'pcp', name: 'PCP', icon: getSubCategoryIcon('pcp'), keywords: ['primary care', 'family medicine', 'family practice', 'general practice', 'internal medicine', 'general practitioner', 'gp', 'family physician', 'primary physician', 'md', 'do', 'physician', 'naturopath', 'naturopathic', 'chiropractor', 'chiropractic', 'dc'] },
      { id: 'all-specialists', name: 'All Specialists', icon: getSubCategoryIcon('all-specialists'), keywords: ['specialist', 'specialty', 'cardiology', 'cardiac', 'neurology', 'neurological', 'dermatology', 'dermatologist', 'endocrinology', 'endocrinologist', 'gastroenterology', 'gastroenterologist', 'hematology', 'hematologist', 'oncology', 'oncologist', 'nephrology', 'nephrologist', 'pulmonology', 'pulmonologist', 'rheumatology', 'rheumatologist', 'urology', 'urologist', 'gynecology', 'gynecologist', 'obstetrics', 'obstetrician', 'pediatrics', 'pediatrician', 'orthopedics', 'orthopedic', 'ortho', 'ophthalmology', 'ophthalmologist', 'otolaryngology', 'ent', 'allergy', 'allergist', 'immunology', 'immunologist', 'infectious disease', 'radiology', 'radiologist', 'pathology', 'pathologist', 'anesthesiology', 'anesthesiologist'] },
      { id: 'surgical-specialists', name: 'Surgical Specialists', icon: getSubCategoryIcon('surgical-specialists'), keywords: ['surgeon', 'surgery', 'surgical', 'cardiothoracic', 'neurosurgery', 'orthopedic surgery', 'plastic surgery', 'general surgery', 'vascular surgery', 'urological surgery', 'gynecological surgery', 'otolaryngology', 'ophthalmology'] },
      { id: 'registered-nurses', name: 'Registered Nurses', icon: getSubCategoryIcon('registered-nurses'), keywords: ['registered nurse', 'rn', 'nurse', 'nursing', 'r.n.', 'r.n'] },
      { id: 'nurse-practitioners', name: 'Nurse Practitioners', icon: getSubCategoryIcon('nurse-practitioners'), keywords: ['nurse practitioner', 'np', 'n.p.', 'n.p', 'aprn', 'apn', 'fnp', 'anp', 'pnp'] },
      { id: 'physician-assistants', name: 'Physician Assistants', icon: getSubCategoryIcon('physician-assistants'), keywords: ['physician assistant', 'pa', 'pa-c', 'pa c', "physician's assistant"] },
      { id: 'physical-occupational-therapists', name: 'Physical/Occupational Therapists', icon: getSubCategoryIcon('physical-occupational-therapists'), keywords: ['physical therapist', 'pt', 'occupational therapist', 'ot', 'physical therapy', 'occupational therapy', 'physiotherapy', 'physiotherapist', 'rehabilitation', 'rehab'] },
      { id: 'others', name: 'Others', icon: getSubCategoryIcon('others'), keywords: ['healthcare', 'provider', 'practitioner', 'medical'] },
    ],
  },
  // SCRUM-579 (2026-07-13, Ken feedback batch): BPS uniformity on
  // Circle of Support. Ken wants Circle populated across all three
  // BPS domains — Medical + Care Manager cover the biological /
  // coordination axes; Psychological + Social close out the psy +
  // soc axes. Sub-categories carry keyword hints for a follow-up
  // where provider-categorization.ts learns about the new
  // categories; today all EHR providers still land in Medical, so
  // Psy + Soc start empty and users manually add supports.
  {
    id: 'psychological',
    name: 'Psychological',
    icon: getCategoryIcon('mental-health'),
    subCategories: [
      { id: 'psychiatrist', name: 'Psychiatrist', icon: getSubCategoryIcon('psychiatrist'), keywords: ['psychiatrist', 'psychiatry', 'psychiatric'] },
      { id: 'psychologist', name: 'Psychologist', icon: getSubCategoryIcon('psychologist'), keywords: ['psychologist', 'psychology', 'clinical psychologist', 'psyd'] },
      { id: 'therapist', name: 'Therapist / Counselor', icon: getSubCategoryIcon('mft'), keywords: ['therapist', 'counselor', 'lmft', 'mft', 'marriage and family therapist', 'lpc', 'licensed professional counselor', 'psychotherapist'] },
      { id: 'social-worker', name: 'Clinical Social Worker', icon: getSubCategoryIcon('lcsw'), keywords: ['clinical social worker', 'lcsw', 'msw', 'social worker'] },
      { id: 'support-group', name: 'Support Group', icon: getSubCategoryIcon('aa'), keywords: ['support group', 'aa', 'alcoholics anonymous', 'na', 'narcotics anonymous', 'recovery group', 'peer support'] },
      { id: 'others-psychological', name: 'Others', icon: getSubCategoryIcon('others'), keywords: ['mental health', 'behavioral health'] },
    ],
  },
  {
    id: 'social',
    name: 'Social',
    icon: getCategoryIcon('family'),
    subCategories: [
      { id: 'family', name: 'Family', icon: getSubCategoryIcon('siblings'), keywords: [] },
      { id: 'friend', name: 'Friend', icon: getSubCategoryIcon('friends'), keywords: [] },
      { id: 'neighbor', name: 'Neighbor', icon: getSubCategoryIcon('friends'), keywords: [] },
      { id: 'community', name: 'Community', icon: getSubCategoryIcon('groups'), keywords: [] },
      { id: 'faith-community', name: 'Faith Community', icon: getSubCategoryIcon('church'), keywords: [] },
      { id: 'others-social', name: 'Others', icon: getSubCategoryIcon('others'), keywords: [] },
    ],
  },
  // TODO: Re-enable when Integrative feature is ready
  // {
  //   id: 'integrative',
  //   name: 'Integrative',
  //   icon: getCategoryIcon('integrative'),
  //   // Integrative providers come from user-uploaded files (non-EHR).
  //   // Managed by services/non-ehr-processor.ts, not tracked in sub-categories here.
  //   subCategories: [],
  // },
];

/**
 * Get all sub-categories for a given category ID
 */
export function getSubCategoriesByCategoryId(categoryId: string): SubCategory[] {
  const category = SUPPORT_CATEGORIES.find(cat => cat.id === categoryId);
  return category?.subCategories || [];
}

/**
 * Get category by ID
 */
export function getCategoryById(categoryId: string): Category | undefined {
  return SUPPORT_CATEGORIES.find(cat => cat.id === categoryId);
}

/**
 * Get sub-category by ID
 */
export function getSubCategoryById(categoryId: string, subCategoryId: string): SubCategory | undefined {
  const category = getCategoryById(categoryId);
  return category?.subCategories.find(sub => sub.id === subCategoryId);
}

/**
 * Match a provider to sub-categories based on keywords.
 * Uses the categorization system from provider-categorization.ts.
 * Returns all applicable subcategories (a provider can belong to multiple).
 *
 * @returns Array of category-subcategory pairs, or null if no match
 */
export function matchProviderToSubCategory(
  providerName: string,
  providerSpecialty?: string,
  providerQualifications?: string
): { categoryId: string; subCategoryId: string }[] | null {
  // Import the categorization function dynamically to avoid circular dependencies
  const { categorizeProvider } = require('@/services/provider-categorization');

  const categorization = categorizeProvider({
    qualifications: providerQualifications,
    specialty: providerSpecialty,
    name: providerName,
  });

  // Map the new category names to category IDs
  const categoryIdMap: Record<string, string> = {
    'Medical': 'medical',
  };

  // Map the new subcategory names to subcategory IDs
  const subCategoryIdMap: Record<string, string> = {
    'PCP': 'pcp',
    'All Specialists': 'all-specialists',
    'Surgical Specialists': 'surgical-specialists',
    'Registered Nurses': 'registered-nurses',
    'Nurse Practitioners': 'nurse-practitioners',
    'Physician Assistants': 'physician-assistants',
    'Physical/Occupational Therapists': 'physical-occupational-therapists',
    'Others': 'others',
  };

  const categoryId = categoryIdMap[categorization.category] || 'medical';

  // Get all applicable subcategories
  const subCategories: string[] = categorization.subCategories ||
    (categorization.subCategory ? [categorization.subCategory] : ['Others']);

  // Return array of all category-subcategory pairs
  return subCategories.map((subCategory: string) => ({
    categoryId,
    subCategoryId: subCategoryIdMap[subCategory] || 'others',
  }));
}

/**
 * Match a provider to a single primary sub-category (for backward compatibility).
 * Returns the first/primary subcategory.
 */
export function matchProviderToPrimarySubCategory(
  providerName: string,
  providerSpecialty?: string,
  providerQualifications?: string
): { categoryId: string; subCategoryId: string } | null {
  const matches = matchProviderToSubCategory(providerName, providerSpecialty, providerQualifications);
  return matches && matches.length > 0 ? matches[0] : null;
}

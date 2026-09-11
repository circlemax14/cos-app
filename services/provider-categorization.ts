/**
 * Provider Categorization Configuration
 * 
 * This file defines the categorization system for health providers and related services.
 * Designed for elderly users to easily access their health providers.
 * 
 * Categories are based on the dtaa file structure:
 * - Mental Health
 * - Family
 * - Social/Leisure
 * - Faith
 * - Services
 * - Medical (with subcategories)
 */

/**
 * Main provider categories
 */
export type ProviderCategory = 
  | 'Mental Health'
  | 'Family'
  | 'Social/Leisure'
  | 'Faith'
  | 'Services'
  | 'Medical';

/**
 * Medical subcategories for detailed provider classification
 */
export type MedicalSubcategory =
  | 'PCP' // Primary Care Practitioner
  | 'All Specialists' // Organ specialists from different departments
  | 'Surgical Specialists' // All surgeons
  | 'Registered Nurses'
  | 'Nurse Practitioners'
  | 'Physician Assistants'
  | 'Physical/Occupational Therapists'
  | 'Others'; // Everyone else in medical category

export type NonMedicalSubcategory =
  | 'Psychiatrist'
  | 'Psychologist'
  | 'MFT'
  | 'LCSW'
  | 'AA'
  | 'Substance Abuse Counselors'
  | 'Spouse'
  | 'Children'
  | 'Siblings'
  | 'Parents'
  | 'Cousins'
  | 'Nephews'
  | 'Niece'
  | 'Friends'
  | 'Groups'
  | 'Exercise'
  | 'Yoga'
  | 'Music'
  | 'Concerts'
  | 'Education'
  | 'Priest'
  | 'Rabbi'
  | 'Minister'
  | 'Church'
  | 'Synagogue'
  | 'Meals'
  | 'Caregivers'
  | 'Aids'
  | 'Housekeeper'
  | 'Maintenance'
  | 'Delivery'
  | 'Yard';

export type ProviderSubcategory = MedicalSubcategory | NonMedicalSubcategory;

/**
 * Provider categorization configuration
 */
export interface ProviderCategorizationConfig {
  category: ProviderCategory;
  subCategory?: ProviderSubcategory; // Primary subcategory (for backward compatibility)
  subCategories?: ProviderSubcategory[]; // All applicable subcategories (allows multiple)
}

/**
 * Keywords and patterns for identifying PCP (Primary Care Practitioner)
 */
const PCP_KEYWORDS = [
  'primary care',
  'family medicine',
  'family practice',
  'general practice',
  'internal medicine',
  'general practitioner',
  'gp',
  'family physician',
  'primary physician',
  'md', // Medical Doctor
  'do', // Doctor of Osteopathy
  'physician',
  'naturopath',
  'naturopathic',
  'chiropractor',
  'chiropractic',
  'dc', // Doctor of Chiropractic
];

/**
 * Keywords for Nurse Practitioners
 */
const NURSE_PRACTITIONER_KEYWORDS = [
  'nurse practitioner',
  'np',
  'n.p.',
  'n.p',
  'aprn', // Advanced Practice Registered Nurse
  'apn', // Advanced Practice Nurse
  'fnp', // Family Nurse Practitioner
  'anp', // Adult Nurse Practitioner
  'pnp', // Pediatric Nurse Practitioner
];

/**
 * Keywords and patterns for identifying Surgical Specialists
 */
const SURGICAL_SPECIALIST_KEYWORDS = [
  'surgeon',
  'surgery',
  'surgical',
  'cardiothoracic',
  'neurosurgery',
  'orthopedic surgery',
  'plastic surgery',
  'general surgery',
  'vascular surgery',
  'urological surgery',
  'gynecological surgery',
  'otolaryngology', // ENT surgery
  'ophthalmology', // Eye surgery
];

/**
 * Keywords and patterns for identifying All Specialists (organ specialists)
 */
const SPECIALIST_KEYWORDS = [
  'specialist',
  'specialty',
  'cardiology',
  'cardiac',
  'neurology',
  'neurological',
  'dermatology',
  'dermatologist',
  'endocrinology',
  'endocrinologist',
  'gastroenterology',
  'gastroenterologist',
  'hematology',
  'hematologist',
  'oncology',
  'oncologist',
  'nephrology',
  'nephrologist',
  'pulmonology',
  'pulmonologist',
  'rheumatology',
  'rheumatologist',
  'urology',
  'urologist',
  'gynecology',
  'gynecologist',
  'obstetrics',
  'obstetrician',
  'pediatrics',
  'pediatrician',
  'psychiatry',
  'psychiatrist',
  'psychology',
  'psychologist',
  'orthopedics',
  'orthopedic',
  'ortho',
  'ophthalmology',
  'ophthalmologist',
  'otolaryngology',
  'ent',
  'allergy',
  'allergist',
  'immunology',
  'immunologist',
  'infectious disease',
  'radiology',
  'radiologist',
  'pathology',
  'pathologist',
  'anesthesiology',
  'anesthesiologist',
];

/**
 * Keywords for Registered Nurses
 */
const REGISTERED_NURSE_KEYWORDS = [
  'registered nurse',
  'rn',
  'nurse',
  'nursing',
  'r.n.',
  'r.n',
];

/**
 * Keywords for Physician Assistants
 */
const PHYSICIAN_ASSISTANT_KEYWORDS = [
  'physician assistant',
  'pa',
  'pa-c',
  'pa c',
  'physician\'s assistant',
];

/**
 * Keywords for Physical/Occupational Therapists
 */
const THERAPIST_KEYWORDS = [
  'physical therapist',
  'pt',
  'occupational therapist',
  'ot',
  'physical therapy',
  'occupational therapy',
  'physiotherapy',
  'physiotherapist',
  'rehabilitation',
  'rehab',
];

/**
 * Keywords for Mental Health providers
 */
const MENTAL_HEALTH_KEYWORDS = [
  'psychiatrist',
  'psychologist',
  'mft', // Marriage and Family Therapist
  'lcsw', // Licensed Clinical Social Worker
  'substance abuse',
  'addiction',
  'counselor',
  'counsellor',
  'therapy',
  'therapist',
  'mental health',
  'behavioral health',
  'psychiatric',
  'psychology',
];

const MENTAL_HEALTH_SUBCATEGORIES: Array<{ name: NonMedicalSubcategory; keywords: string[] }> = [
  { name: 'Psychiatrist', keywords: ['psychiatrist', 'psychiatry'] },
  { name: 'Psychologist', keywords: ['psychologist', 'psychology'] },
  { name: 'MFT', keywords: ['mft', 'marriage', 'family therapist'] },
  { name: 'LCSW', keywords: ['lcsw', 'social worker', 'licensed clinical'] },
  { name: 'AA', keywords: ['aa', 'alcoholics anonymous'] },
  { name: 'Substance Abuse Counselors', keywords: ['substance abuse', 'addiction', 'counselor', 'counsellor'] },
];

const FAMILY_SUBCATEGORIES: Array<{ name: NonMedicalSubcategory; keywords: string[] }> = [
  { name: 'Spouse', keywords: ['spouse', 'partner', 'husband', 'wife'] },
  { name: 'Children', keywords: ['children', 'child', 'son', 'daughter'] },
  { name: 'Siblings', keywords: ['sibling', 'brother', 'sister'] },
  { name: 'Parents', keywords: ['parent', 'mother', 'father', 'mom', 'dad'] },
  { name: 'Cousins', keywords: ['cousin'] },
  { name: 'Nephews', keywords: ['nephew'] },
  { name: 'Niece', keywords: ['niece'] },
];

const SOCIAL_SUBCATEGORIES: Array<{ name: NonMedicalSubcategory; keywords: string[] }> = [
  { name: 'Friends', keywords: ['friend'] },
  { name: 'Groups', keywords: ['group', 'community'] },
  { name: 'Exercise', keywords: ['exercise', 'fitness', 'trainer'] },
  { name: 'Yoga', keywords: ['yoga', 'yogi'] },
  { name: 'Music', keywords: ['music', 'musician'] },
  { name: 'Concerts', keywords: ['concert'] },
  { name: 'Education', keywords: ['education', 'teacher', 'tutor'] },
];

const FAITH_SUBCATEGORIES: Array<{ name: NonMedicalSubcategory; keywords: string[] }> = [
  { name: 'Priest', keywords: ['priest', 'catholic'] },
  { name: 'Rabbi', keywords: ['rabbi', 'jewish'] },
  { name: 'Minister', keywords: ['minister', 'pastor', 'clergy'] },
  { name: 'Church', keywords: ['church', 'christian'] },
  { name: 'Synagogue', keywords: ['synagogue', 'temple'] },
];

const SERVICES_SUBCATEGORIES: Array<{ name: NonMedicalSubcategory; keywords: string[] }> = [
  { name: 'Meals', keywords: ['meal', 'food', 'nutrition'] },
  { name: 'Caregivers', keywords: ['caregiver', 'care'] },
  { name: 'Aids', keywords: ['aid', 'assistant', 'helper'] },
  { name: 'Housekeeper', keywords: ['housekeeper', 'cleaning'] },
  { name: 'Maintenance', keywords: ['maintenance', 'repair'] },
  { name: 'Delivery', keywords: ['delivery', 'deliver'] },
  { name: 'Yard', keywords: ['yard', 'landscaping', 'gardening'] },
];

/**
 * COS-968 — "pa" inside "Padma".
 *
 * Ken, 2026-09-10: the provider pages "don't filter it in a meaningful way".
 * One reason is that every keyword here was matched with `combined.includes`,
 * against a string that concatenates qualifications, specialty AND NAME. So
 * the two-letter credentials matched inside ordinary words:
 *
 *   PADMA DASARI MD      -> 'pa'  -> filed under Physician Assistants
 *   Paul D Espy MD       -> 'pa'  -> Physician Assistants
 *   SCOTT DANIEL CASEY MD-> 'ot'  -> Physical/Occupational Therapists  ("scott")
 *
 * All three are real rows from production. A patient looking for their
 * surgeon under Physicians simply does not find them.
 *
 * The fix belongs here rather than at the eight call sites: every keyword
 * list routes through one predicate, so one guard covers all of them.
 *
 * Long or multi-word keywords ("physician assistant", "rehabilitation") are
 * specific enough to substring-match safely and keep doing so — restricting
 * those to word boundaries would lose "physiotherapist" inside longer
 * specialty strings. Only the short credential tokens are tightened.
 */
export function matchesKeyword(haystack: string, keyword: string): boolean {
  if (keyword.length > 4 || keyword.includes(' ')) return haystack.includes(keyword);
  // `.` and `-` appear in credentials ("r.n.", "pa-c") and are not word
  // characters, so the boundary is "not a letter" rather than \b.
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z])${escaped}($|[^a-z])`, 'i').test(haystack);
}

const matchSubcategories = (
  combined: string,
  subcategories: Array<{ name: NonMedicalSubcategory; keywords: string[] }>
): NonMedicalSubcategory[] =>
  subcategories
    .filter(sub => sub.keywords.some(keyword => matchesKeyword(combined, keyword)))
    .map(sub => sub.name);

const INCLUDE_NON_MEDICAL_CATEGORIES = false;

/**
 * Categorizes a provider based on their qualifications, specialty, and name
 * A provider can belong to multiple subcategories (e.g., an MD can be both PCP and Specialist)
 * 
 * @param provider - Provider information including qualifications, specialty, and name
 * @returns Provider categorization with category and all applicable subcategories
 */
export function categorizeProvider(provider: {
  qualifications?: string;
  specialty?: string;
  name?: string;
}): ProviderCategorizationConfig {
  const quals = (provider.qualifications || '').toLowerCase();
  const specialty = (provider.specialty || '').toLowerCase();
  const name = (provider.name || '').toLowerCase();
  const combined = `${quals} ${specialty} ${name}`.toLowerCase();

  if (INCLUDE_NON_MEDICAL_CATEGORIES) {
    const mentalMatches = matchSubcategories(combined, MENTAL_HEALTH_SUBCATEGORIES);
    if (mentalMatches.length > 0) {
      return {
        category: 'Mental Health',
        subCategory: mentalMatches[0],
        subCategories: mentalMatches,
      };
    }

    const familyMatches = matchSubcategories(combined, FAMILY_SUBCATEGORIES);
    if (familyMatches.length > 0) {
      return {
        category: 'Family',
        subCategory: familyMatches[0],
        subCategories: familyMatches,
      };
    }

    const socialMatches = matchSubcategories(combined, SOCIAL_SUBCATEGORIES);
    if (socialMatches.length > 0) {
      return {
        category: 'Social/Leisure',
        subCategory: socialMatches[0],
        subCategories: socialMatches,
      };
    }

    const faithMatches = matchSubcategories(combined, FAITH_SUBCATEGORIES);
    if (faithMatches.length > 0) {
      return {
        category: 'Faith',
        subCategory: faithMatches[0],
        subCategories: faithMatches,
      };
    }

    const servicesMatches = matchSubcategories(combined, SERVICES_SUBCATEGORIES);
    if (servicesMatches.length > 0) {
      return {
        category: 'Services',
        subCategory: servicesMatches[0],
        subCategories: servicesMatches,
      };
    }
  }

  // Check for Medical category providers
  const isMedical =
    // Same word-boundary rule as matchesKeyword: these run against `quals`
    // alone, but a qualification string like "Padiatrics" would still trip
    // a bare `includes('pa')`.
    ['md', 'do', 'np', 'pa', 'rn', 'pt', 'ot', 'dc'].some((c) => matchesKeyword(quals, c)) ||
    name.includes('doctor') ||
    name.includes('physician') ||
    name.includes('nurse') ||
    name.includes('therapist') ||
    specialty.length > 0 ||
    quals.length > 0;

  if (isMedical) {
    // Collect ALL applicable subcategories (not just one)
    const applicableSubCategories: MedicalSubcategory[] = [];

    // Check for Nurse Practitioners first (before Registered Nurses, as NP is more specific)
    if (NURSE_PRACTITIONER_KEYWORDS.some(keyword => matchesKeyword(combined, keyword)) &&
        !PHYSICIAN_ASSISTANT_KEYWORDS.some(keyword => matchesKeyword(combined, keyword)) &&
        !THERAPIST_KEYWORDS.some(keyword => matchesKeyword(combined, keyword))) {
      applicableSubCategories.push('Nurse Practitioners');
    }
    
    // Check for Registered Nurses (mutually exclusive with NP, PAs, and therapists)
    if (REGISTERED_NURSE_KEYWORDS.some(keyword => matchesKeyword(combined, keyword)) &&
        !NURSE_PRACTITIONER_KEYWORDS.some(keyword => matchesKeyword(combined, keyword)) &&
        !PHYSICIAN_ASSISTANT_KEYWORDS.some(keyword => matchesKeyword(combined, keyword)) &&
        !THERAPIST_KEYWORDS.some(keyword => matchesKeyword(combined, keyword))) {
      applicableSubCategories.push('Registered Nurses');
    }
    
    // Check for Physician Assistants (mutually exclusive with nurses/therapists)
    if (PHYSICIAN_ASSISTANT_KEYWORDS.some(keyword => matchesKeyword(combined, keyword)) &&
        !REGISTERED_NURSE_KEYWORDS.some(keyword => matchesKeyword(combined, keyword)) &&
        !NURSE_PRACTITIONER_KEYWORDS.some(keyword => matchesKeyword(combined, keyword)) &&
        !THERAPIST_KEYWORDS.some(keyword => matchesKeyword(combined, keyword))) {
      applicableSubCategories.push('Physician Assistants');
    }
    
    // Check for Physical/Occupational Therapists (mutually exclusive with nurses/PAs)
    if (THERAPIST_KEYWORDS.some(keyword => matchesKeyword(combined, keyword)) &&
        !REGISTERED_NURSE_KEYWORDS.some(keyword => matchesKeyword(combined, keyword)) &&
        !NURSE_PRACTITIONER_KEYWORDS.some(keyword => matchesKeyword(combined, keyword)) &&
        !PHYSICIAN_ASSISTANT_KEYWORDS.some(keyword => matchesKeyword(combined, keyword))) {
      applicableSubCategories.push('Physical/Occupational Therapists');
    }
    
    // For MD/DO and other medical professionals, they can be multiple things:
    // Check for Surgical Specialists (can overlap with All Specialists)
    if (SURGICAL_SPECIALIST_KEYWORDS.some(keyword => matchesKeyword(combined, keyword))) {
      applicableSubCategories.push('Surgical Specialists');
    }
    
    // Check for All Specialists (organ specialists - can overlap with PCP and Surgical)
    if (SPECIALIST_KEYWORDS.some(keyword => matchesKeyword(combined, keyword))) {
      applicableSubCategories.push('All Specialists');
    }
    
    // Check for PCP (Primary Care Practitioner - can overlap with Specialists)
    // An MD can be both a PCP and a Specialist (e.g., Family Medicine doctor who also specializes)
    if (PCP_KEYWORDS.some(keyword => matchesKeyword(combined, keyword))) {
      applicableSubCategories.push('PCP');
    }

    // If no specific subcategory matched, default to Others
    if (applicableSubCategories.length === 0) {
      applicableSubCategories.push('Others');
    }

    // Primary subcategory is the first one (for backward compatibility)
    // Priority: Registered Nurses > Physician Assistants > Therapists > Surgical > Specialists > PCP > Others
    const primarySubCategory = applicableSubCategories[0];

    return {
      category: 'Medical',
      subCategory: primarySubCategory, // For backward compatibility
      subCategories: applicableSubCategories, // All applicable subcategories
    };
  }

  return {
    category: 'Medical',
    subCategory: 'Others',
    subCategories: ['Others'],
  };
}

/**
 * Gets all available categories
 */
export function getAllCategories(): ProviderCategory[] {
  return [
    'Mental Health',
    'Family',
    'Social/Leisure',
    'Faith',
    'Services',
    'Medical',
  ];
}

/**
 * Gets all medical subcategories
 */
export function getAllMedicalSubcategories(): MedicalSubcategory[] {
  return [
    'PCP',
    'All Specialists',
    'Surgical Specialists',
    'Registered Nurses',
    'Nurse Practitioners',
    'Physician Assistants',
    'Physical/Occupational Therapists',
    'Others',
  ];
}

/**
 * Groups providers by category and subcategory
 * Handles providers that belong to multiple subcategories
 */
export function groupProvidersByCategory<T extends { category?: string; subCategory?: string; subCategories?: string[] }>(
  providers: T[]
): Map<string, Map<string, T[]>> {
  const grouped = new Map<string, Map<string, T[]>>();

  providers.forEach(provider => {
    const category = provider.category || 'Medical';
    
    // Get all subcategories (use subCategories array if available, otherwise use single subCategory)
    const subCategories = provider.subCategories && provider.subCategories.length > 0
      ? provider.subCategories
      : [provider.subCategory || 'Others'];

    if (!grouped.has(category)) {
      grouped.set(category, new Map());
    }

    const categoryMap = grouped.get(category)!;
    
    // Add provider to ALL applicable subcategories
    subCategories.forEach(subCategory => {
      if (!categoryMap.has(subCategory)) {
        categoryMap.set(subCategory, []);
      }
      categoryMap.get(subCategory)!.push(provider);
    });
  });

  return grouped;
}

/**
 * Gets providers by category
 */
export function getProvidersByCategory<T extends { category?: string }>(
  providers: T[],
  category: ProviderCategory
): T[] {
  return providers.filter(p => p.category === category);
}

/**
 * Gets providers by medical subcategory
 */
export function getProvidersByMedicalSubcategory<T extends { category?: string; subCategory?: string }>(
  providers: T[],
  subCategory: MedicalSubcategory
): T[] {
  return providers.filter(
    p => p.category === 'Medical' && p.subCategory === subCategory
  );
}

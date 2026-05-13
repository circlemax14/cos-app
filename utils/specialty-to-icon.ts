/**
 * Map a free-text specialty string (typically from FHIR Practitioner.speciality
 * or our own provider record) to one of our specialty icon names.
 *
 * The keyword tables intentionally mirror the matching logic in
 * `provider-categories.ts` — if a string categorizes there as a known
 * specialty, this returns the matching icon name; otherwise it returns null
 * and the caller falls back to the generic entity-type icon.
 */

// Order matters: more-specific patterns first. Each entry uses substring
// matches scoped to known roots so e.g. "rheumatology" doesn't accidentally
// match "dermatology".
const KEYWORD_TABLE = [
  // pediatrics precedes cardiology so a "Pediatric Cardiology" string maps to
  // the pediatrics icon (general pediatric care wins for the child-patient case).
  { icon: 'pediatrics',               needles: ['pediatric', 'pediatrics', 'pediatrician'] },
  { icon: 'cardiology',               needles: ['cardiology', 'cardiologist', 'cardiac', 'cardiothoracic'] },
  { icon: 'dermatology',              needles: ['dermatology', 'dermatologist'] },
  { icon: 'neurology',                needles: ['neurology', 'neurologist', 'neurological', 'neurosurgery'] },
  { icon: 'orthopedics',              needles: ['orthopedic', 'orthopedics', 'orthopaedic'] },
  { icon: 'oncology',                 needles: ['oncology', 'oncologist'] },
  { icon: 'gastroenterology',         needles: ['gastroenterology', 'gastroenterologist'] },
  { icon: 'ob-gyn',                   needles: ['ob/gyn', 'obgyn', 'obstetrics', 'obstetrician', 'gynecology', 'gynecologist'] },
  { icon: 'ent',                      needles: ['otolaryngology', 'ent', 'ear nose'] },
  { icon: 'ophthalmology',            needles: ['ophthalmology', 'ophthalmologist'] },
  { icon: 'psychiatry',               needles: ['psychiatry', 'psychiatrist', 'psychology'] },
  { icon: 'endocrinology',            needles: ['endocrinology', 'endocrinologist'] },
  { icon: 'pulmonology',              needles: ['pulmonology', 'pulmonologist', 'pulmonary'] },
  { icon: 'radiology',                needles: ['radiology', 'radiologist'] },
  { icon: 'lab-imaging',              needles: ['pathology', 'pathologist', 'lab technician', 'laboratory'] },
  { icon: 'surgical',                 needles: ['general surgery', 'plastic surgery', 'surgeon', 'surgical', 'vascular surgery'] },
  { icon: 'internal-family-medicine', needles: ['internal medicine', 'family medicine', 'family doctor', 'family practice', 'primary care', 'general practitioner'] },
] as const

export type IconName = (typeof KEYWORD_TABLE)[number]['icon']

export function specialtyToIcon(specialty: string | null | undefined): IconName | null {
  if (!specialty) return null
  const haystack = specialty.toLowerCase().trim()
  if (!haystack) return null
  for (const { icon, needles } of KEYWORD_TABLE) {
    if (needles.some((n) => haystack.includes(n))) {
      return icon
    }
  }
  return null
}

import { specialtyToIcon } from '../specialty-to-icon'

describe('specialtyToIcon', () => {
  describe('null / empty handling', () => {
    it('returns null for null input', () => {
      expect(specialtyToIcon(null)).toBeNull()
    })

    it('returns null for undefined input', () => {
      expect(specialtyToIcon(undefined)).toBeNull()
    })

    it('returns null for empty string', () => {
      expect(specialtyToIcon('')).toBeNull()
    })

    it('returns null for whitespace-only string', () => {
      expect(specialtyToIcon('   ')).toBeNull()
    })

    it('returns null for unknown specialty', () => {
      expect(specialtyToIcon('Witch Doctor')).toBeNull()
    })
  })

  describe('direct specialty mapping (representative subset)', () => {
    it('cardiology', () => {
      expect(specialtyToIcon('Cardiology')).toBe('cardiology')
      expect(specialtyToIcon('Cardiologist')).toBe('cardiology')
      expect(specialtyToIcon('Cardiac Care')).toBe('cardiology')
      expect(specialtyToIcon('Cardiothoracic Surgery')).toBe('cardiology')
    })

    it('dermatology', () => {
      expect(specialtyToIcon('Dermatology')).toBe('dermatology')
      expect(specialtyToIcon('Dermatologist')).toBe('dermatology')
    })

    it('neurology', () => {
      expect(specialtyToIcon('Neurology')).toBe('neurology')
      expect(specialtyToIcon('Neurosurgery')).toBe('neurology')
    })

    it('ob-gyn', () => {
      expect(specialtyToIcon('OB/GYN')).toBe('ob-gyn')
      expect(specialtyToIcon('Obstetrics')).toBe('ob-gyn')
      expect(specialtyToIcon('Gynecology')).toBe('ob-gyn')
    })

    it('lab-imaging covers pathology + lab roles', () => {
      expect(specialtyToIcon('Pathology')).toBe('lab-imaging')
      expect(specialtyToIcon('Lab technician')).toBe('lab-imaging')
    })

    it('internal-family-medicine covers primary care + family practice', () => {
      expect(specialtyToIcon('Internal Medicine')).toBe('internal-family-medicine')
      expect(specialtyToIcon('Family Medicine')).toBe('internal-family-medicine')
      expect(specialtyToIcon('Primary Care')).toBe('internal-family-medicine')
      expect(specialtyToIcon('General Practitioner')).toBe('internal-family-medicine')
    })
  })

  describe('case and whitespace handling', () => {
    it('matches regardless of case', () => {
      expect(specialtyToIcon('CARDIOLOGY')).toBe('cardiology')
      expect(specialtyToIcon('cardiology')).toBe('cardiology')
      expect(specialtyToIcon('CaRdIoLoGy')).toBe('cardiology')
    })

    it('trims leading and trailing whitespace', () => {
      expect(specialtyToIcon('  Cardiology  ')).toBe('cardiology')
      expect(specialtyToIcon('\tCardiology\n')).toBe('cardiology')
    })
  })

  describe('precedence rules — order matters in KEYWORD_TABLE', () => {
    it('nursing wins over pediatrics for "Pediatric Nurse Practitioner"', () => {
      // Nursing is the first entry so role wins over patient population.
      expect(specialtyToIcon('Pediatric Nurse Practitioner')).toBe('nursing')
    })

    it('nursing wins over cardiology for "Cardiac Care Nurse"', () => {
      expect(specialtyToIcon('Cardiac Care Nurse')).toBe('nursing')
    })

    it('pediatrics wins over cardiology for "Pediatric Cardiology"', () => {
      // Pediatrics precedes cardiology in the table so general pediatric
      // care wins for the child-patient case.
      expect(specialtyToIcon('Pediatric Cardiology')).toBe('pediatrics')
    })

    it('dermatology does not collide with rheumatology (no rheumatology entry, returns null)', () => {
      // rheumatology should NOT match dermatology even though both end in
      // "atology" — the table uses full-keyword matches not loose suffix.
      expect(specialtyToIcon('Rheumatology')).toBeNull()
    })
  })

  describe('nursing role-related variants', () => {
    it('matches "Nurse Practitioner"', () => {
      expect(specialtyToIcon('Nurse Practitioner')).toBe('nursing')
    })

    it('matches "Registered Nurse"', () => {
      expect(specialtyToIcon('Registered Nurse')).toBe('nursing')
    })

    it('matches "Physician Assistant"', () => {
      expect(specialtyToIcon('Physician Assistant')).toBe('nursing')
    })

    it('matches "PA-C"', () => {
      expect(specialtyToIcon('PA-C')).toBe('nursing')
    })
  })
})

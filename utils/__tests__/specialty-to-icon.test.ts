import { describe, it, expect } from '@jest/globals'
import { specialtyToIcon } from '../specialty-to-icon'

describe('specialtyToIcon', () => {
  it('returns cardiology for cardiology-shaped strings', () => {
    expect(specialtyToIcon('Cardiology')).toBe('cardiology')
    expect(specialtyToIcon('Cardiology, MD')).toBe('cardiology')
    expect(specialtyToIcon('Cardiologist')).toBe('cardiology')
  })

  it('returns neurology for neurology-shaped strings', () => {
    expect(specialtyToIcon('Neurology')).toBe('neurology')
    expect(specialtyToIcon('Neurologist')).toBe('neurology')
  })

  it('returns ophthalmology for eye-doctor strings', () => {
    expect(specialtyToIcon('Ophthalmology')).toBe('ophthalmology')
    expect(specialtyToIcon('Ophthalmologist')).toBe('ophthalmology')
  })

  it('returns ob-gyn for obstetrics/gynecology strings', () => {
    expect(specialtyToIcon('OB/GYN')).toBe('ob-gyn')
    expect(specialtyToIcon('Gynecologist')).toBe('ob-gyn')
    expect(specialtyToIcon('Obstetrics and Gynecology')).toBe('ob-gyn')
  })

  it('returns surgical for generic surgeons not in a specific specialty', () => {
    expect(specialtyToIcon('General Surgery')).toBe('surgical')
    expect(specialtyToIcon('Plastic Surgery')).toBe('surgical')
  })

  it('returns lab-imaging for radiology and pathology', () => {
    expect(specialtyToIcon('Radiology')).toBe('radiology')
    expect(specialtyToIcon('Pathology')).toBe('lab-imaging')
  })

  it('returns null for unknown specialties', () => {
    expect(specialtyToIcon('Witch Doctor')).toBe(null)
    expect(specialtyToIcon('')).toBe(null)
    expect(specialtyToIcon('  ')).toBe(null)
  })

  it('is case-insensitive and trims', () => {
    expect(specialtyToIcon('  CARDIOLOGY  ')).toBe('cardiology')
  })

  it('does not over-match the gastro prefix', () => {
    expect(specialtyToIcon('Gastric Bypass Surgeon')).toBe('surgical')
    expect(specialtyToIcon('gastroparesis specialist')).toBe(null)
  })

  it('locks in the specificity tie-breaks: cardiology over surgical, pediatrics over cardiology', () => {
    // Cardiothoracic surgeon → cardiology (cardiology row comes first; cardiology
    // is the canonical specialty for a cardiothoracic surgeon).
    expect(specialtyToIcon('Cardiothoracic Surgery')).toBe('cardiology')
    // Pediatric cardiologist → pediatrics (pediatrician sees children; the
    // pediatrics row precedes cardiology so general pediatric care wins).
    expect(specialtyToIcon('Pediatric Cardiology')).toBe('pediatrics')
    // Orthopedic surgeon → orthopedics (not generic 'surgical').
    expect(specialtyToIcon('Orthopedic Surgery')).toBe('orthopedics')
  })
})

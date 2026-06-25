/**
 * Pure helpers for Medication Forms (COS-372 — "Consumable vs Injectable").
 *
 * Part A of the medication-forms-and-pickup design: a medication is either a
 * `consumable` (pills/tablets/mL taken on a daily-times schedule) or an
 * `injectable` (pens/vials/doses taken on a cadence such as weekly). The
 * backend already accepts `form` on add/edit and `cadence` / `startDate` on
 * setSupply; this module owns the small amount of presentation logic the UI
 * needs so it can be unit-tested without the React Native runtime.
 *
 * KILL-SWITCH (`MED_FORMS_ENABLED`): default OFF. While off, the meds UI is
 * byte-for-byte today's — no form control, no cadence picker, consumable units
 * everywhere, every med treated as a consumable. Flip to `true` + ship an OTA
 * to dark-launch the feature. Centralized here so the components, the review
 * modal, and the tests all share one source of truth.
 *
 * Everything here is PURE — no imports from `react-native` or any RN module —
 * so it's safe to `import` from a node:test unit test.
 *
 * No PHI flows through these helpers (form/cadence are non-identifying).
 */

/**
 * Client kill-switch. Default OFF so the feature is dark until intentionally
 * flipped. When OFF, callers MUST behave exactly as they did before this
 * feature: no segmented form control, no cadence picker, consumable units,
 * "Take"/daily-times everywhere, and every med treated as a consumable.
 */
export const MED_FORMS_ENABLED = false;

/** How a medication is taken. Defaults to 'consumable' when unspecified. */
export type MedicationForm = 'consumable' | 'injectable';

/** Dosing cadence for an injectable. Consumables stay on daily-times. */
export type MedicationCadence = 'daily' | 'weekly' | 'biweekly' | 'monthly';

/** The default form for any med whose `form` is missing (back-compat). */
export const DEFAULT_MED_FORM: MedicationForm = 'consumable';

/** The default cadence for an injectable whose `cadence` is missing. */
export const DEFAULT_MED_CADENCE: MedicationCadence = 'daily';

/**
 * Normalize a possibly-missing/unknown form to a concrete one. Anything that
 * isn't a recognized form (including `null`/`undefined` from an older backend)
 * collapses to the default 'consumable' — the pre-feature behavior.
 */
export function normalizeForm(form: string | null | undefined): MedicationForm {
  return form === 'injectable' ? 'injectable' : DEFAULT_MED_FORM;
}

/**
 * Normalize a possibly-missing/unknown cadence to a concrete one. Unknown or
 * absent values collapse to the default 'daily'.
 */
export function normalizeCadence(cadence: string | null | undefined): MedicationCadence {
  switch (cadence) {
    case 'weekly':
    case 'biweekly':
    case 'monthly':
    case 'daily':
      return cadence;
    default:
      return DEFAULT_MED_CADENCE;
  }
}

/**
 * Supply unit label for a med form. Consumables are counted in
 * "pills/tablets/mL"; injectables in "pens/vials/doses". Unknown forms fall
 * back to the consumable label (the pre-feature wording).
 */
export function supplyUnitLabel(form: string | null | undefined): string {
  return normalizeForm(form) === 'injectable' ? 'pens/vials/doses' : 'pills/tablets/mL';
}

/** Short, human-readable label for a med form, used by the review-modal tag. */
export function formTagLabel(form: string | null | undefined): string {
  return normalizeForm(form) === 'injectable' ? 'Injectable' : 'Oral';
}

/** Human-readable label for a dosing cadence (for the injectable picker). */
export function cadenceLabel(cadence: string | null | undefined): string {
  switch (normalizeCadence(cadence)) {
    case 'weekly':
      return 'Weekly';
    case 'biweekly':
      return 'Every 2 weeks';
    case 'monthly':
      return 'Monthly';
    case 'daily':
    default:
      return 'Daily';
  }
}

/** Ordered cadence options for the injectable cadence picker. */
export const CADENCE_OPTIONS: MedicationCadence[] = ['daily', 'weekly', 'biweekly', 'monthly'];

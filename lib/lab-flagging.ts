import type { LabResultValue } from '../services/api/types';

/*
 * COS-1162 — ONE classifier decides both the badge and the count.
 *
 * It used to be two. `isFlagged` matched a fixed set of display strings while
 * `flagStyle` switched on a DIFFERENT set that also handled 'a', 'aa', 'hh'
 * and 'll'. So a result coded 'A' painted a visible orange "Abnormal" badge
 * and was simultaneously excluded from the "N flagged" count, the red pill and
 * the accessibility label. Deriving both from this function makes disagreeing
 * impossible rather than merely unlikely.
 *
 * Priority is deliberate:
 *
 *  1. alertLevel — the server's panic-value verdict (COS-1120), computed from
 *     the LOINC and the RAW unit, neither of which reaches us. It has been on
 *     the wire since 2026-09-25 and nothing read it. Measured on the shared
 *     datastore: 7 observations qualify, ALL potassium at 6.2-6.9 mmol/L —
 *     hyperkalaemia at arrest-risk levels — and ALL SEVEN carry no
 *     interpretation element at all, so the old string match returned false and
 *     they rendered as ordinary grey rows.
 *
 *  2. interpretationCode — the HL7 code, which does not vary per EHR.
 *
 *  3. the display string, only when there is no code. 89% of this record
 *     (2419 of 2717 laboratory Observations) has no interpretation element at
 *     all, so this tier is a fallback for older sources, not the main path.
 *
 * ABSENT IS NOT NORMAL. Returning null here means "nothing marked this", which
 * covers an unknown LOINC, an unrecognised unit and a silent source — it does
 * not mean the value is fine, and nothing may render it as reassurance.
 */

/** HL7 v3 ObservationInterpretation codes that mean out-of-range. */
const ABNORMAL_CODES: Record<string, 'high' | 'low' | 'abnormal'> = {
  H: 'high',
  HH: 'high',
  HU: 'high',
  L: 'low',
  LL: 'low',
  LU: 'low',
  A: 'abnormal',
  AA: 'abnormal',
};

/** Display strings, used ONLY when the source sent no code. */
const FLAGGED_INTERPRETATIONS: Record<string, 'high' | 'low' | 'abnormal'> = {
  high: 'high',
  'above high normal': 'high',
  h: 'high',
  hh: 'high',
  low: 'low',
  'below low normal': 'low',
  l: 'low',
  ll: 'low',
  abnormal: 'abnormal',
  a: 'abnormal',
  aa: 'abnormal',
  critical: 'abnormal',
};

export type FlagKind = 'critical' | 'high' | 'low' | 'abnormal';

const FLAG_STYLES: Record<FlagKind, { fg: string; bg: string; label: string }> = {
  critical: { fg: '#DC2626', bg: '#DC262620', label: 'Critical' },
  high: { fg: '#DC2626', bg: '#DC262620', label: 'High' },
  low: { fg: '#2563EB', bg: '#2563EB20', label: 'Low' },
  abnormal: { fg: '#D97706', bg: '#D9770620', label: 'Abnormal' },
};

export function classifyFlag(v: LabResultValue): FlagKind | null {
  if (v.alertLevel === 'critical') return 'critical';

  const code = v.interpretationCode?.trim().toUpperCase();
  if (code) {
    // A code that is present and NORMAL is a real answer — do not fall through
    // to the free text, which is what produced the double-matching before.
    return ABNORMAL_CODES[code] ?? null;
  }

  const raw = v.interpretation?.trim().toLowerCase();
  if (!raw) return null;
  return FLAGGED_INTERPRETATIONS[raw] ?? null;
}

export function isFlagged(v: LabResultValue): boolean {
  return classifyFlag(v) !== null;
}

/**
 * Badge for one result. Derived from classifyFlag so the badge and the
 * "N flagged" count can never disagree — see the note above.
 */
export function flagStyle(v: LabResultValue): { fg: string; bg: string; label: string } | null {
  const kind = classifyFlag(v);
  return kind ? FLAG_STYLES[kind] : null;
}

/**
 * AICS-3 — only text a MODEL wrote may be labelled "AI-generated".
 *
 * The summary endpoints also return fixed, human-written strings through the
 * same fields, and today nothing in the response tells the two apart
 * (cos-backend origin/main 1250d1d):
 *
 *  - RISK_ITEM_SUMMARY  (src/services/assessment-history-summary.service.ts)
 *    sent INSTEAD of model prose when PHQ-9 item 9 (self-harm) is endorsed on
 *    any take, with `available: true`, on both the instrument and the domain
 *    summary. Captioning it "AI-generated … informational only" right above
 *    the crisis card tells the patient that the one message meant to send them
 *    to a person is just model output.
 *  - NO_RANGE_SUMMARY   (same file) Brief-COPE / FICA / HOPE, `available: true`.
 *  - the generation-failed apology (src/services/health-trend-summary.service.ts),
 *    returned with HTTP 200 and no error flag.
 *
 * MIRROR of those three constants: keep them in step (the first two are marked
 * "wording pending Ken's approval"). A drifted mirror fails toward the old bug
 * (label shown), so change both sides together.
 * ponytail: string match until the backend sends `aiGenerated`; once it does,
 * that flag wins below and the mirror can be deleted.
 */
export const FIXED_SUMMARY_TEXTS: readonly string[] = [
  "One of your answers is worth talking through with a person, so we haven't written an automatic summary here. " +
    "The support options shown with your result are there whenever you want them, and it's a good idea to share how you've been feeling with your care team.",
  "This check-in doesn't have an overall score, so we don't write an automatic summary for it. " +
    'Your answers are kept with your check-ins, and you can talk them over with your care team any time.',
  'We could not put your summary together just now. Your data is safe — please try again in a moment.',
];

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
const FIXED = new Set(FIXED_SUMMARY_TEXTS.map(norm));

/** True only for prose a model produced, i.e. what may carry an AI caption. */
export function isModelWritten(
  s: { summary?: unknown; available?: unknown; aiGenerated?: unknown } | null | undefined,
): boolean {
  if (!s || typeof s.summary !== 'string' || !s.summary.trim()) return false;
  if (typeof s.aiGenerated === 'boolean') return s.aiGenerated;
  if (s.available === false) return false;
  return !FIXED.has(norm(s.summary));
}

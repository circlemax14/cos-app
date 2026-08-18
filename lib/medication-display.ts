/**
 * How a medication row reads.
 *
 * ─── THE PROBLEM THIS FIXES ──────────────────────────────────────────
 *
 * The card had its hierarchy inverted. The loudest element after the drug name
 * was a bordered, coloured, bold chip reading "FROM RECORDS" — provenance,
 * i.e. a fact about our data pipeline. The dose and the schedule, which is the
 * only thing on the card a patient has to ACT on, were the smallest and
 * greyest text there.
 *
 * A second chip read "ORAL" on every row, because almost every medication is
 * oral. A badge that is identical on every row carries no information and
 * costs a line of visual space on each one.
 *
 * So: what the patient must do gets the weight, and what we know about where
 * the record came from becomes a quiet line at the bottom.
 *
 * Pure and import-free so `node --test` can run it — see
 * feedback_node_test_no_alias_imports.
 */

/**
 * "08:00" → "8am". Times are stored 24-hour and were rendered raw, so a
 * four-times-daily antibiotic read as "08:00, 14:00, 20:00, 02:00" — a string
 * a patient has to decode rather than read.
 *
 * Anything unparseable is passed through untouched: showing the stored value
 * is better than dropping a dose time on the floor.
 */
export function formatTimeLabel(raw: string): string {
  const m = /^\s*(\d{1,2}):(\d{2})\s*$/.exec(raw ?? '')
  if (!m) return (raw ?? '').trim()

  const h = Number(m[1])
  const min = Number(m[2])
  if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59) return raw.trim()

  const suffix = h < 12 ? 'am' : 'pm'
  const hour12 = h % 12 === 0 ? 12 : h % 12
  // Drop ":00" — "8am" reads faster than "8:00am", and the minutes only
  // matter when they are not zero.
  return min === 0 ? `${hour12}${suffix}` : `${hour12}:${String(min).padStart(2, '0')}${suffix}`
}

/** The full schedule line: "8am · 2pm · 8pm · 2am". */
export function formatTimes(times: readonly string[] | null | undefined): string {
  if (!Array.isArray(times) || times.length === 0) return ''
  return times
    .map(formatTimeLabel)
    .filter((t) => t !== '')
    .join(' · ')
}

/**
 * Where the row came from, in words rather than in a shouting chip.
 *
 * Lower case on purpose. This is a footnote, and setting it in caps inside a
 * bordered pill is what made it compete with the drug name.
 */
export function provenanceLabel(isEhr: boolean): string {
  return isEhr ? 'from your health records' : 'added by you'
}

/**
 * The form tag, but ONLY when it says something.
 *
 * "Oral" is true of nearly every medication, so printing it on every row is
 * noise. An injectable is worth calling out — it changes how the patient takes
 * it. Returns null when there is nothing worth the space.
 */
export function formTagIfNotable(isInjectable: boolean): string | null {
  return isInjectable ? 'injectable' : null
}

/**
 * The class mark.
 *
 * ONLY PSYCHIATRIC IS MARKED, and that is a statement about confidence rather
 * than about layout. classifyMedication is deliberately one-sided: it names
 * psychiatric on a confident match against a curated ATC N05/N06 list and
 * returns 'medical' for everything else, INCLUDING psychiatric drugs it does
 * not happen to know. 'medical' is therefore a default, not a finding.
 *
 * Marking both kinds would dress that default up as a conclusion — the app
 * telling a patient "this one is medical" when what it actually knows is
 * "this one is not in my psychiatric list". Marking only what we detected
 * removes a claim we cannot support, and as a side effect removes a mark from
 * most rows, which is most of the noise.
 */
export function classMark(cls: string): { show: boolean; label: string } {
  return cls === 'psychiatric'
    ? { show: true, label: 'psychiatric' }
    : { show: false, label: '' }
}

/**
 * The one-line summary under the name: dose and how often.
 *
 * Falls back to an explicit "No dose set" rather than an empty line — a blank
 * where the instruction should be reads as a rendering bug, and a patient with
 * a medication whose dose we never captured needs to see that.
 */
export function doseLine(dose?: string | null, frequency?: string | null): string {
  const parts = [dose, frequency].map((p) => (p ?? '').trim()).filter((p) => p !== '')
  return parts.length > 0 ? parts.join(' · ') : 'No dose set'
}

/**
 * "Next scheduled" — the one thing a patient opens this screen to find out.
 *
 * ─── WHAT IT DELIBERATELY IS NOT ─────────────────────────────────────
 *
 * NOT "Up next", NOT "Due now", NOT "Take now", and there is NO check circle.
 * The medication API exposes add / edit / remove / setTracked / setSupply /
 * snoozeRefill and nothing else — there is no dose-taken event anywhere in the
 * contract. A tick here would be a 44pt button wired to nothing, and every
 * word implying "due" or "taken" would be a claim the data cannot support.
 * So the band reports the SCHEDULE, which is all we actually know.
 *
 * NOT A GRADIENT. `expo-linear-gradient` is not a dependency (verified
 * 2026-08-18), and adding it would change the native fingerprint — meaning a
 * new binary, an App Store review, and a runtimeVersion bump that would make
 * the accompanying OTA reach nobody. A flat fill is what keeps this shippable
 * tonight.
 *
 * NOT TAPPABLE in v1. Tapping would need to scroll to the row, which needs a
 * ScrollView ref this screen does not have, threaded through five mount sites.
 * The band names the medication and its dose inline, so there is nothing to
 * navigate to in order to learn the fact.
 *
 * ─── AND IT OFTEN RENDERS NOTHING ────────────────────────────────────
 *
 * When no active medication has a computable next dose — which is every
 * EHR-only account, since those rows carry no dose times — this returns null.
 * No shell, no empty state, no "add your dose times" prompt. A permanent nag
 * on a screen someone opened to read their medication list is worse than an
 * absent band.
 */

import React from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { formatTimeLabel, doseLine } from '@/lib/medication-display'
import { nextScheduled, relativeToDose, type BandMed } from '@/lib/medication-schedule'

/** Flat, because a gradient would cost a binary. */
const BAND_BG = '#0F766E'

export interface NextScheduledBandProps {
  meds: readonly BandMed[]
  getScaledFontSize: (n: number) => number
  getScaledFontWeight: (n: number) => string
  /** Injected in tests; defaults to now. */
  now?: Date
}

function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function NextScheduledBand({
  meds,
  getScaledFontSize,
  getScaledFontWeight,
  now,
}: NextScheduledBandProps): React.JSX.Element | null {
  // Recomputed on render rather than on a timer. A relative phrase that never
  // ticks is fine; one that keeps ticking after the app is backgrounded is a
  // lie, and an interval on a list screen is a battery cost for no gain.
  const at = now ?? new Date()
  const model = nextScheduled(meds, at)
  if (!model) return null

  const nameLine =
    model.overflow > 0 ? `${model.names.join(', ')} +${model.overflow} more` : model.names.join(', ')

  const when = (() => {
    if (model.time) {
      const abs = formatTimeLabel(model.time)
      const rel = relativeToDose(model.time, at, model.tomorrow)
      if (model.tomorrow) return `Tomorrow · ${abs}`
      return rel ? `${abs} · ${rel}` : abs
    }
    if (model.cadence && model.cadenceDate) {
      return `${model.cadence} · ${formatDate(model.cadenceDate)}`
    }
    return null
  })()

  const earlier =
    model.earlierToday.length > 0
      ? `Also scheduled earlier today: ${model.earlierToday.map(formatTimeLabel).join(', ')}`
      : null

  // One accessible group. Read as a sentence rather than five fragments.
  const spoken = [
    'Next scheduled.',
    nameLine + '.',
    model.single ? `${doseLine(model.single.dose, model.single.frequency)}.` : '',
    when ? `${when}.` : '',
    earlier ? `${earlier}.` : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <View style={styles.band} accessible accessibilityLabel={spoken}>
      <Text
        style={[styles.eyebrow, { fontSize: getScaledFontSize(13), fontWeight: getScaledFontWeight(700) as never }]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        NEXT SCHEDULED
      </Text>

      {/* DIRECTION D'S HERO ROW: a monogram beside the name, matching the
          tiles in the list below so the same medication is recognisable in
          both places.

          NO CHECK CIRCLE. D draws one and it cannot work — the medication API
          has add / edit / remove / setTracked / setSupply / snoozeRefill and
          NO dose-taken event. A 38pt circle that looks tappable and records
          nothing is worse than an unbalanced hero. The time takes its place
          on the right, which is the fact the circle was sitting next to. */}
      <View style={styles.heroRow}>
        {/* ONLY WHEN ONE MEDICATION IS DUE. With two, the tile showed the
            first one's initial beside BOTH names — "C" next to "cephalexin,
            metformin" — which reads as a claim about the pair. A monogram
            identifies one thing or it identifies nothing. */}
        {model.names.length === 1 ? (
          <View style={styles.heroMono}>
            <Text
              style={{ color: '#FFFFFF', fontSize: getScaledFontSize(18), fontWeight: getScaledFontWeight(700) as never }}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              {(model.names[0] ?? '?').trim().charAt(0).toUpperCase() || '?'}
            </Text>
          </View>
        ) : null}
        <Text
          style={[styles.name, { fontSize: getScaledFontSize(20), fontWeight: getScaledFontWeight(700) as never, flex: 1, minWidth: 0 }]}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {nameLine}
        </Text>
      </View>

      {/* The dose line only when exactly ONE medication is due at that time —
          with several, a single dose would be attributed to all of them. */}
      {model.single ? (
        <Text
          style={[styles.dose, { fontSize: getScaledFontSize(15) }]}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {doseLine(model.single.dose, model.single.frequency)}
        </Text>
      ) : null}

      {when ? (
        <Text
          style={[styles.when, { fontSize: getScaledFontSize(17), fontWeight: getScaledFontWeight(600) as never }]}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {when}
        </Text>
      ) : null}

      {/* SCHEDULED, never "missed" and never "taken". Without this line the
          band silently rolls past an 8am dose and nothing on the screen
          acknowledges that 8am happened at all. */}
      {earlier ? (
        <Text
          style={[styles.earlier, { fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(600) as never }]}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {earlier}
        </Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  band: {
    backgroundColor: BAND_BG,
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 16,
    marginBottom: 14,
  },
  // No numberOfLines anywhere: every line wraps. At a large accessibility
  // text size a clamped band would hide the medication's own name.
  eyebrow: { color: 'rgba(255,255,255,0.8)', letterSpacing: 0.5 },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10 },
  // Matches styles.medIcon in the list so the same medication reads as the
  // same object in both places.
  heroMono: {
    width: 46,
    height: 46,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  name: { color: '#FFFFFF' },
  dose: { color: 'rgba(255,255,255,0.9)', marginTop: 4 },
  when: { color: '#FFFFFF', marginTop: 8 },
  earlier: { color: 'rgba(255,255,255,0.85)', marginTop: 8 },
})

export default NextScheduledBand

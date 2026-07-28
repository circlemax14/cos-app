/**
 * WellbeingMapGlimpse (COS-479, chunk: hero + map-glimpse layout).
 *
 * A ~150pt-tall strip that lives above the fold on the redesigned
 * biopsychosocial home screen. Renders a compact 3-circle Venn preview
 * (Body / Mind / Life) that visually rhymes with the full labeled Venn
 * on /Home/wellbeing-map, and routes there when tapped anywhere on the
 * strip. Purely presentational — no data, no queries, no derivation.
 *
 * iOS 26.5 PRIMITIVE ENVELOPE (strict):
 *   View, Text, Pressable, MaterialIcons, StyleSheet only.
 *   NO Modal, NO Animated, NO LayoutAnimation, NO Portal, NO gradient,
 *   NO blur, NO ActivityIndicator, NO rotate transforms, NO SVG.
 * The full wellbeing map DOES use react-native-svg — this glimpse
 * deliberately does not, so it can render at cold-mount with zero
 * animation/native-fingerprint risk on iOS 26.5. The overlapping
 * "shared shades" of a real Venn are approximated by three static
 * View circles with translucent backgrounds + colored borders; they
 * stack via absolute positioning inside a relative container, and the
 * paint order lets their edges blend visually where they overlap.
 *
 * PALETTE (matches app/Home/wellbeing-map.tsx line 44-58 exactly so the
 * mini and full Venns read as one system — biological green, psy
 * purple, social amber). Renamed for the senior surface as Body / Mind
 * / Life per Ken's approved copy.
 *
 * ACCESSIBILITY:
 *   - Single Pressable with role=button, plain-English label, and a hint
 *     that names the destination. VoiceOver reads the whole strip as
 *     one element.
 *   - Every decorative primitive inside the Venn is hidden from a11y
 *     (accessibilityElementsHidden + importantForAccessibility). The
 *     one-word labels ("Body", "Mind", "Life") sitting inside each
 *     circle are decorative — the outer Pressable's a11yLabel already
 *     communicates the destination.
 */

import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { router } from 'expo-router'

// ── Palette (mirrors app/Home/wellbeing-map.tsx, lines 44-58) ──────────
// Kept as module-const literals so this file has zero cross-repo
// coupling and iOS 26.5 cold-mount stays trivially predictable.

const BIO_STROKE = '#199C4F'
const BIO_FILL = 'rgba(25,156,79,0.28)'
const MIND_STROKE = '#7B3FE4'
const MIND_FILL = 'rgba(123,63,228,0.28)'
const LIFE_STROKE = '#C97600'
const LIFE_FILL = 'rgba(201,118,0,0.28)'

// Circles are large enough to hold a one-word label yet small enough
// that the three fit inside a 110pt-tall strip on the narrowest iPhone
// SE (320pt viewport). Overlap tuned so the intersecting slices read as
// a single wellbeing organism, not three separate dots.
const CIRCLE_SIZE = 62
const CIRCLE_RADIUS = CIRCLE_SIZE / 2

// Venn container geometry — width covers the three-circle silhouette,
// height is the ~110pt the design brief calls for.
const VENN_W = 118
const VENN_H = 110

// Absolute positions inside the Venn container (top-left of each
// circle's bounding box).
const BIO_LEFT = 0
const BIO_TOP = 0
const MIND_LEFT = VENN_W - CIRCLE_SIZE // right-aligned
const MIND_TOP = 0
const LIFE_LEFT = (VENN_W - CIRCLE_SIZE) / 2 // centered
const LIFE_TOP = VENN_H - CIRCLE_SIZE

export function WellbeingMapGlimpse(): React.JSX.Element {
  const onPress = React.useCallback(() => {
    // expo-router imperative navigation — mirrors the existing pattern
    // in BpsWellbeingScoreCard.tsx (line 56) so we don't introduce a
    // second navigation primitive on this screen.
    router.push('/Home/wellbeing-map')
  }, [])

  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel="Your wellbeing map. Explore all 26 areas of your wellbeing"
      accessibilityHint="Opens the full wellbeing map"
      style={({ pressed }) => [styles.strip, pressed && styles.stripPressed]}
    >
      {/* Header row: label + chevron */}
      <View style={styles.headerRow}>
        <Text style={styles.headerLabel} numberOfLines={1}>
          Your wellbeing map
        </Text>
        <MaterialIcons
          name="chevron-right"
          size={18}
          color="#687076"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
      </View>

      {/* Mini Venn — three overlapping circles, decorative */}
      <View
        style={styles.vennWrap}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <View style={styles.venn}>
          {/* Bio (green) — top-left */}
          <View
            style={[
              styles.circle,
              {
                left: BIO_LEFT,
                top: BIO_TOP,
                backgroundColor: BIO_FILL,
                borderColor: BIO_STROKE,
              },
            ]}
          >
            <Text style={[styles.circleLabel, { color: BIO_STROKE }]} numberOfLines={1}>
              Body
            </Text>
          </View>

          {/* Mind (purple) — top-right */}
          <View
            style={[
              styles.circle,
              {
                left: MIND_LEFT,
                top: MIND_TOP,
                backgroundColor: MIND_FILL,
                borderColor: MIND_STROKE,
              },
            ]}
          >
            <Text style={[styles.circleLabel, { color: MIND_STROKE }]} numberOfLines={1}>
              Mind
            </Text>
          </View>

          {/* Life (amber) — bottom-center */}
          <View
            style={[
              styles.circle,
              {
                left: LIFE_LEFT,
                top: LIFE_TOP,
                backgroundColor: LIFE_FILL,
                borderColor: LIFE_STROKE,
              },
            ]}
          >
            <Text style={[styles.circleLabel, { color: LIFE_STROKE }]} numberOfLines={1}>
              Life
            </Text>
          </View>
        </View>
      </View>

      {/* Footer hint: "Explore all 26 areas ›" */}
      <View style={styles.footerRow}>
        <Text style={styles.footerLabel} numberOfLines={1}>
          Explore all 26 areas
        </Text>
        <MaterialIcons
          name="chevron-right"
          size={14}
          color="#687076"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
      </View>
    </Pressable>
  )
}

export default WellbeingMapGlimpse

const styles = StyleSheet.create({
  strip: {
    // ~150pt tall envelope (header + venn + footer + gaps).
    // Keeps the strip a stable-height above-the-fold element so the
    // hero score above it doesn't shift on cold mount.
    paddingVertical: 8,
    paddingHorizontal: 4,
    alignItems: 'center',
  },
  stripPressed: {
    opacity: 0.6,
  },
  headerRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginBottom: 6,
  },
  headerLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: '#11181C',
    letterSpacing: 0,
  },
  vennWrap: {
    height: VENN_H,
    width: VENN_W,
    alignItems: 'center',
    justifyContent: 'center',
  },
  venn: {
    position: 'relative',
    width: VENN_W,
    height: VENN_H,
  },
  circle: {
    position: 'absolute',
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    borderRadius: CIRCLE_RADIUS,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0,
  },
  footerRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
    paddingHorizontal: 4,
  },
  footerLabel: {
    fontSize: 13,
    fontWeight: '400',
    color: '#687076',
    marginRight: 2,
  },
})

/**
 * components/home/WellbeingMapPreview.tsx — ADR-0003 Phase 1
 *
 * Redesigned Home's above-the-fold entry point to the full wellbeing
 * map. Structurally the same 3-circle Venn glimpse as the shipped
 * WellbeingMapGlimpse (components/health-plan/senior/), but:
 *
 *   1. MEMOIZED — the parent Home re-renders on every AppState / query
 *      cache tick; without React.memo, we re-paint six absolute-positioned
 *      Views for no reason on every parent render. This component's
 *      props are stable (currently: none), so memo() is trivially safe.
 *   2. accessibilityLabel names ALL 8 wellbeing dimensions (the map
 *      taxonomy expanded from 3 → 8 in COS-444/445 — see
 *      memory:project_wellbeing_map_bps_platform) so VoiceOver hears
 *      the full destination instead of just "Body, Mind, Life".
 *   3. Q12 DECIDED — no `?section=` query param. Ken's dogfood showed
 *      the map's own default focus is more useful than a Home-supplied
 *      deep link (which was often stale after a rotation-triggered
 *      re-render). We navigate to the plain map route and let its
 *      internal state pick the initial focus.
 *
 * PRIMITIVE ENVELOPE (iOS 26.5): View / Text / Pressable / MaterialIcons /
 * StyleSheet only. No SVG, no gradient, no blur, no ActivityIndicator.
 */

import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { router } from 'expo-router'

// ── Palette (mirrors app/Home/wellbeing-map.tsx lines 44-58 and
//    WellbeingMapGlimpse.tsx so the two glimpses read as one system).
const BIO_STROKE = '#199C4F'
const BIO_FILL = 'rgba(25,156,79,0.28)'
const MIND_STROKE = '#7B3FE4'
const MIND_FILL = 'rgba(123,63,228,0.28)'
const LIFE_STROKE = '#C97600'
const LIFE_FILL = 'rgba(201,118,0,0.28)'

const CIRCLE_SIZE = 62
const CIRCLE_RADIUS = CIRCLE_SIZE / 2
const VENN_W = 118
const VENN_H = 110

const BIO_LEFT = 0
const BIO_TOP = 0
const MIND_LEFT = VENN_W - CIRCLE_SIZE
const MIND_TOP = 0
const LIFE_LEFT = (VENN_W - CIRCLE_SIZE) / 2
const LIFE_TOP = VENN_H - CIRCLE_SIZE

/**
 * The 8 wellbeing map dimensions, verbatim from Ken's approved
 * taxonomy. Rendered into the a11y label so VoiceOver names the
 * whole destination — a sighted user sees the 3-circle simplification;
 * a VO user hears the truth: "explore all 8 areas".
 *
 * Kept as a module-const array (not a template literal) so the
 * label formation is a cheap join, not string interpolation on every
 * render.
 */
const MAP_DIMENSIONS = [
  'Body',
  'Mind',
  'Life',
  'Sleep',
  'Movement',
  'Nutrition',
  'Connection',
  'Purpose',
] as const

const A11Y_LABEL = `Your wellbeing map. Explore all 8 areas: ${MAP_DIMENSIONS.join(
  ', ',
)}.`

function WellbeingMapPreviewBase(): React.JSX.Element {
  const onPress = React.useCallback(() => {
    // Q12 DECIDED: no `?section=` query param. Plain route → map picks
    // its own initial focus. Rationale in file header.
    router.push('/Home/wellbeing-map')
  }, [])

  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={A11Y_LABEL}
      accessibilityHint="Opens the full wellbeing map"
      style={({ pressed }) => [styles.strip, pressed && styles.stripPressed]}
    >
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

      <View
        style={styles.vennWrap}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <View style={styles.venn}>
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
            <Text
              style={[styles.circleLabel, { color: BIO_STROKE }]}
              numberOfLines={1}
            >
              Body
            </Text>
          </View>

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
            <Text
              style={[styles.circleLabel, { color: MIND_STROKE }]}
              numberOfLines={1}
            >
              Mind
            </Text>
          </View>

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
            <Text
              style={[styles.circleLabel, { color: LIFE_STROKE }]}
              numberOfLines={1}
            >
              Life
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.footerRow}>
        <Text style={styles.footerLabel} numberOfLines={1}>
          Explore all 8 areas
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

/**
 * Props are currently empty — memoization is on the identity of the
 * component itself. If props are added later (e.g. a compact/expanded
 * variant), the memo comparator here becomes a real fn.
 */
export const WellbeingMapPreview = React.memo(WellbeingMapPreviewBase)
WellbeingMapPreview.displayName = 'WellbeingMapPreview'

export default WellbeingMapPreview

const styles = StyleSheet.create({
  strip: {
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

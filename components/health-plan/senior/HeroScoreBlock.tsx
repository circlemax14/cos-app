/**
 * HeroScoreBlock (COS-479 — Direction 1: Hero Score + One Thing Today)
 *
 * Above-the-fold hero block for the BPS plan surface. Renders, top-to-bottom:
 *   1. Greeting (15pt weight 300, subtext color)
 *   2. 96pt composite wellbeing number (weight 300, tabular-nums)
 *   3. Plain-English caption from lib/wellbeing-caption.ts
 *   4. Three domain "dots" row: Bio / Mind / Life — each a Pressable that
 *      scrolls the parent to the DetailsAccordion.
 *
 * Kill switch: this file only renders when BPS_HERO_LAYOUT_ENABLED is true
 * in BiopsychosocialPlanScreen.tsx (default false). Setting the switch to
 * false renders bit-identical output to the current shipped screen — the
 * a11y-shipped chunks 82-124 continue to render verbatim inside the
 * DetailsAccordion.
 *
 * iOS 26.5 primitive envelope (hard rule):
 *   Allowed:    View / Text / Pressable / MaterialIcons / StyleSheet
 *   Prohibited: Modal, Animated, LayoutAnimation, Portal, gradient, blur,
 *               ActivityIndicator, rotate transforms on cold-mount paths.
 *
 * a11y contract:
 *   - Hero number container is one accessible node with a single utterance:
 *     "Your wellbeing score is {N} out of 100. {caption}"
 *   - Inner Text nodes carry accessibilityElementsHidden=true so VoiceOver
 *     does not fragment the score across three children.
 *   - Each dot Pressable is a button with a label announcing the domain,
 *     the trend, and the tap affordance.
 *
 * Data contract (compute-once, chunks 59/60):
 *   - Component MUST accept composite / priorComposite / domainTrends as
 *     props from the parent-hoisted useWellbeingDerivation() pass. Do NOT
 *     call any React Query hook or deriveWellbeing() from inside this
 *     component — the parent runs the derivation exactly once per render.
 *
 * OTA-safe (pure JS, no native fingerprint change, existing icon set only).
 */
import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'

import { composePlainCaption } from '@/lib/wellbeing-caption'

// Match BpsWellbeingScoreCard's ColorMap shape so this component drops
// into BiopsychosocialPlanScreen's already-cast `colors` prop with zero
// extra casting at the call site.
type ColorMap = Record<string, string>

/**
 * Trend arrow shape shared with the parent's wellbeing derivation.
 * Kept local (not imported from lib/wellbeing-score) so this file has
 * no coupling to the pure derivation module — the parent shapes the
 * prop and we render it.
 */
export type DotTrend = 'up' | 'down' | 'flat'

export interface HeroScoreBlockProps {
  /** First name for the greeting. Missing / empty → "Good morning." */
  userFirstName?: string
  /** Composite wellbeing score (0–100). Undefined → hero shows "—". */
  composite?: number
  /**
   * Prior-week composite score, used ONLY to derive the plain-English
   * caption. Undefined = first-ever score, per composePlainCaption
   * semantics.
   */
  priorComposite?: number
  /**
   * Per-domain trend arrows for the three-dot row. Parent derives these
   * from the additive `WellbeingDerivation.domainTrends` field. Absent
   * per-domain signal MUST fall back to 'flat' so this component never
   * renders a bare dot with no arrow.
   */
  domainTrends: { bio: DotTrend; mind: DotTrend; social: DotTrend }
  /**
   * Fires when ANY of the three domain dots is tapped. Parent scrolls
   * the ScrollView to the DetailsAccordion — the tap is a single
   * "show me the details" affordance, not a per-domain deep link.
   */
  onDotsPress: () => void
  /** Cast-through props from the parent (mirrors BpsWellbeingScoreCard). */
  colors: ColorMap
  getScaledFontSize: (n: number) => number
  getScaledFontWeight: (n: number) => string | number
}

// -------------------------------------------------------------------
// Static palette + copy tables. Kept as module consts so cold-mount
// does not allocate on every render.
// -------------------------------------------------------------------

/**
 * Dot-row copy uses "Bio / Mind / Life" per the Ken-approved Direction 1
 * spec. NOTE this is intentionally different from DOMAIN_LABEL
 * ('BIO' / 'MIND' / 'SOCIAL & FAITH') and DOMAIN_CALLOUT_NAME — do NOT
 * mutate the shipped constants in lib/wellbeing-score.ts. Chunks 62/63
 * ship consumers (BpsWellbeingScoreCard pills, BpsPlanFocusBanner) that
 * reason from those labels; new copy lives here.
 */
const DOT_LABEL = { bio: 'Bio', mind: 'Mind', social: 'Life' } as const

/**
 * Dot colors sourced from app/Home/wellbeing-map.tsx so the mini Venn
 * downstream reads as one system with the labeled Venn on the map screen.
 *   Bio    #199C4F   (green — biological)
 *   Mind   #7B3FE4   (purple — psychological)
 *   Life   #C97600   (amber — social)
 */
const DOT_COLOR = { bio: '#199C4F', mind: '#7B3FE4', social: '#C97600' } as const

/**
 * Trend → MaterialIcons glyph. Explicit narrow return so this file
 * only ever passes glyphs known to be present in the shipped MaterialIcons
 * subset (arrow-upward / arrow-downward / arrow-forward — all confirmed
 * in-use elsewhere in the repo).
 */
function trendGlyph(t: DotTrend): 'arrow-upward' | 'arrow-downward' | 'arrow-forward' {
  if (t === 'up') return 'arrow-upward'
  if (t === 'down') return 'arrow-downward'
  return 'arrow-forward'
}

/** Trend → VoiceOver word (folds into the dot's accessibilityLabel). */
function trendWord(t: DotTrend): 'up' | 'down' | 'steady' {
  if (t === 'up') return 'up'
  if (t === 'down') return 'down'
  return 'steady'
}

/**
 * Time-of-day greeting. Kept local (rather than importing greetingForNow
 * from BiopsychosocialPlanScreen) so this component stays self-contained
 * and testable in isolation.
 */
function greetingForNow(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

// -------------------------------------------------------------------
// Component
// -------------------------------------------------------------------

export function HeroScoreBlock({
  userFirstName,
  composite,
  priorComposite,
  domainTrends,
  onDotsPress,
  colors,
  getScaledFontSize,
  getScaledFontWeight,
}: HeroScoreBlockProps): React.JSX.Element {
  // Palette — mirror BpsWellbeingScoreCard's fallback chain so a11y-shipped
  // color contrast survives any theme drift.
  const text = colors.text ?? '#11181C'
  const subtext = colors.subtext ?? '#687076'

  // Greeting copy. Spec: firstName missing → "Good morning." (no comma).
  // We keep the greeting time-aware locally so an evening open reads
  // naturally instead of always saying "Good morning".
  const greeting = greetingForNow()
  const trimmedFirstName = (userFirstName ?? '').trim()
  const greetingText = trimmedFirstName
    ? `${greeting}, ${trimmedFirstName}.`
    : `${greeting}.`

  // Hero number. "—" (em dash) when composite is missing so the layout
  // still shows a focal glyph in the 96pt slot — matches the shipped
  // chunk 59 CLS discipline (never leave the focal row empty).
  const hasComposite = typeof composite === 'number' && Number.isFinite(composite)
  const heroText = hasComposite ? String(Math.round(composite as number)) : '—'

  // Caption — plain-English single sentence, deterministic on inputs.
  const captionText = composePlainCaption(composite, priorComposite)

  // Single-utterance a11y label so VoiceOver reads score + caption as
  // one sentence. When composite is missing we still surface the caption
  // ("Here is today's number.") so the block reads as intentional, not
  // as a loading placeholder.
  const heroA11yLabel = hasComposite
    ? `Your wellbeing score is ${Math.round(composite as number)} out of 100. ${captionText}`
    : `Your wellbeing score is not available yet. ${captionText}`

  return (
    <View style={styles.container}>
      {/* Greeting — 15pt weight 300, subtext color. Default a11y role
          (text). Ken's warm palette dictates a light weight here so the
          hero number below owns the focal energy. */}
      <Text
        accessibilityRole="text"
        style={{
          color: subtext,
          fontSize: getScaledFontSize(15),
          fontWeight: getScaledFontWeight(300) as any,
          textAlign: 'center',
          marginBottom: 8,
        }}
      >
        {greetingText}
      </Text>

      {/* Hero number + caption folded into ONE accessible node.
          - View is `accessible` with role=header so VoiceOver hits the
            block as a single stop and reads the score + caption in one
            breath.
          - The 96pt Text uses adjustsFontSizeToFit + numberOfLines={1}
            so a11y text-scaling on iPhone SE at 130% cannot overflow the
            row (chunk 59 pattern, BpsWellbeingScoreCard lines 720-731).
          - letterSpacing -1.5 keeps the numerals tight at display size.
          - fontVariant tabular-nums keeps 87 → 88 → 96 from shifting
            column widths day to day. */}
      <View
        accessible
        accessibilityRole="header"
        accessibilityLabel={heroA11yLabel}
        style={styles.heroBlock}
      >
        <Text
          adjustsFontSizeToFit
          numberOfLines={1}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{
            color: text,
            fontSize: getScaledFontSize(96),
            lineHeight: getScaledFontSize(100),
            fontWeight: getScaledFontWeight(300) as any,
            letterSpacing: -1.5,
            fontVariant: ['tabular-nums'],
            textAlign: 'center',
          }}
        >
          {heroText}
        </Text>

        {/* Caption — 17pt weight 400, subtext color, centered.
            accessibilityElementsHidden because the caption is already
            folded into the parent hero label above. */}
        <Text
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{
            color: subtext,
            fontSize: getScaledFontSize(17),
            lineHeight: getScaledFontSize(22),
            fontWeight: getScaledFontWeight(400) as any,
            textAlign: 'center',
            marginTop: 6,
            paddingHorizontal: 12,
          }}
        >
          {captionText}
        </Text>
      </View>

      {/* Three-dot domain row. Each dot is its own Pressable so
          VoiceOver can enumerate the three domains individually, but all
          three route to the SAME onDotsPress callback (the "show details"
          affordance is unified — dots communicate direction, not deep
          links). Row is horizontally centered and wraps as a safety net
          for large text scale. */}
      <View
        style={styles.dotsRow}
        accessibilityRole="none"
      >
        {(['bio', 'mind', 'social'] as const).map((key) => {
          const label = DOT_LABEL[key]
          const color = DOT_COLOR[key]
          const trend = domainTrends[key]
          const glyph = trendGlyph(trend)
          const word = trendWord(trend)
          return (
            <Pressable
              key={key}
              onPress={onDotsPress}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel={`${label} area, trending ${word}. Tap to see details.`}
              style={({ pressed }) => [
                styles.dotPressable,
                { opacity: pressed ? 0.6 : 1 },
              ]}
            >
              {/* Colored dot — 8pt static View with borderRadius:full.
                  No gradient, no shadow, no blur. */}
              <View
                style={[styles.colorDot, { backgroundColor: color }]}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              />
              <Text
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                style={{
                  color: text,
                  fontSize: getScaledFontSize(15),
                  fontWeight: getScaledFontWeight(500) as any,
                  marginLeft: 6,
                  marginRight: 4,
                }}
              >
                {label}
              </Text>
              <MaterialIcons
                name={glyph}
                size={getScaledFontSize(16)}
                color={text}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              />
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

export default HeroScoreBlock

// -------------------------------------------------------------------
// StyleSheet — static primitives only. No transforms, no shadows on
// cold-mount paths, no blur.
// -------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    alignItems: 'stretch',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
  },
  heroBlock: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 14,
    // horizontal gap approximation via child margins (RN gap works on
    // recent RN but we sidestep it to stay conservative on iOS 26.5).
  },
  dotPressable: {
    // 44x44 minimum tap target achieved via padding, per Apple HIG +
    // the TouchTargets.minimum constant in constants/design-system.ts.
    minHeight: 44,
    minWidth: 44,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 4,
  },
  colorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
})

/**
 * SubdomainChip (COS-430) — renders one NovoPsych biopsychosocial subdomain
 * tag on a goal card, coloured by its primary domain (biological / psychological
 * / social) and shown with a dashed border when the subdomain sits at a Venn
 * overlap (Stress Reactivity, Coping).
 *
 * Purely presentational — pass a `key` string (the persisted enum from
 * `MeasurableGoal.subdomains[]`); the component looks it up in `BPS_SUBDOMAINS`.
 * Unknown keys render `null`, so a future backend adding a subdomain an older
 * app doesn't recognize never breaks a screen.
 *
 * Reuses the app's design tokens (colors passed in, `Radii`, `getScaledFontSize`
 * from the accessibility store) — no new theme, no reanimated, no Modal. Same
 * iOS-26.5-safe primitives as legacy `PlanScreenRedesignedV2` uses.
 */
import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Radii } from '@/constants/design-system'
import { getSubdomain, type BpsDomain } from '@/lib/bps-subdomains'

type ColorMap = Record<string, string>

/**
 * Domain-specific chip colours. Kept in this file (not the design-system
 * `Colors`) because they are specific to the BPS domains — mirrors the
 * `SECTION_STYLE` accent scheme in `SectionCard.tsx`.
 */
const DOMAIN_STYLE: Record<
  BpsDomain,
  { bg: string; fg: string; border: string; darkBg: string; darkFg: string; darkBorder: string }
> = {
  biological: {
    bg: '#E8F7EE',
    fg: '#199C4F',
    border: '#199C4F',
    darkBg: '#0F2E1A',
    darkFg: '#34C759',
    darkBorder: '#34C759',
  },
  psychological: {
    bg: '#F0E7FE',
    fg: '#7B3FE4',
    border: '#7B3FE4',
    darkBg: '#2A1B48',
    darkFg: '#BF9DFB',
    darkBorder: '#BF9DFB',
  },
  social: {
    bg: '#FFF0DC',
    fg: '#C97600',
    border: '#C97600',
    darkBg: '#3A2A0C',
    darkFg: '#FFB84D',
    darkBorder: '#FFB84D',
  },
}

export interface SubdomainChipProps {
  /** The persisted enum key from `BPS_SUBDOMAINS`. */
  subdomainKey: string
  /** App theme colors — `colors.background` is used to pick light/dark chip variant. */
  colors: ColorMap
  /** From `useAccessibility()` — respects the user's font-size preference. */
  getScaledFontSize: (n: number) => number
}

export function SubdomainChip({ subdomainKey, colors, getScaledFontSize }: SubdomainChipProps) {
  const sub = getSubdomain(subdomainKey)
  if (!sub) return null

  // Detect dark mode from the resolved theme's background lightness. Same
  // detection pattern used by `SectionCard.tsx` (alpha() suffix on hex).
  const isDark = isLikelyDarkBg(colors.background)
  const style = DOMAIN_STYLE[sub.domain]
  const bg = isDark ? style.darkBg : style.bg
  const fg = isDark ? style.darkFg : style.fg
  const borderColor = sub.crossDomain ? (isDark ? style.darkBorder : style.border) : 'transparent'

  return (
    <View
      style={[
        styles.chip,
        {
          backgroundColor: bg,
          borderColor,
          borderStyle: sub.crossDomain ? 'dashed' : 'solid',
        },
      ]}
      accessible
      accessibilityLabel={`Addresses ${sub.label}`}
    >
      <Text
        style={{
          color: fg,
          fontSize: getScaledFontSize(11),
          fontWeight: '600',
          lineHeight: 14,
        }}
      >
        {sub.label}
      </Text>
    </View>
  )
}

/**
 * A row-flowing container that renders one chip per known subdomain key. When
 * `subdomainKeys` is empty or all-unknown, renders `null` — so goal cards for
 * legacy (untagged) goals don't get an empty extra row.
 */
export function SubdomainChipRow(props: {
  subdomainKeys: readonly string[] | undefined
  colors: ColorMap
  getScaledFontSize: (n: number) => number
}) {
  const { subdomainKeys, colors, getScaledFontSize } = props
  const keys = (subdomainKeys ?? []).map((k) => k).filter((k) => getSubdomain(k) != null)
  if (keys.length === 0) return null
  return (
    <View style={styles.row}>
      {keys.map((k) => (
        <SubdomainChip key={k} subdomainKey={k} colors={colors} getScaledFontSize={getScaledFontSize} />
      ))}
    </View>
  )
}

/**
 * Heuristic: cos-app's design system doesn't expose an explicit `isDark`
 * boolean at this call site. The theme's `background` is `#FFFFFF` in light
 * mode and a very dark hex in dark mode, so we can safely distinguish by the
 * red-channel value (≥0x80 = light). If `colors.background` is missing or
 * malformed, default to light — matching the app's default appearance.
 */
function isLikelyDarkBg(bg: string | undefined): boolean {
  if (!bg || typeof bg !== 'string') return false
  const hex = bg.startsWith('#') ? bg.slice(1) : bg
  if (hex.length < 2) return false
  const r = parseInt(hex.slice(0, 2), 16)
  return Number.isFinite(r) && r < 0x80
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 6,
    gap: 6,
  },
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radii.sm ?? 6,
    borderWidth: 1,
  },
})

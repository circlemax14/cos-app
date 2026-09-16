import React from 'react';
import { View, Text, StyleSheet, type TextStyle } from 'react-native';
import { Colors } from '@/constants/theme';
import { Spacing, Radii } from '@/constants/design-system';
import { useAccessibility } from '@/stores/accessibility-store';

/**
 * COS-967 — Ken's multi-coloured bar, built only where the colours are true.
 *
 * Ken, 2026-09-10: "that one big green bar... it'd be nice to have the
 * different colours, so they know it's coming from the different places."
 *
 * ─── WHY IT IS NOT THREE FIXED SEGMENTS ──────────────────────────────
 *
 * The obvious build is a bar with three coloured stops — clinic, check-ins,
 * device — and it would be a lie on most accounts today. Two facts:
 *
 *   1. `TrendDataPoint` (cos-backend/src/types/insights.ts) has `date`,
 *      `value`, `unit` and NO `source` field. Provenance is not recorded on
 *      a trend point at all, so it cannot be read back off one.
 *   2. `cos-longitudinal-trends-{dev,staging,production}` are ALL empty —
 *      ItemCount 0, scan Count 0, verified against AWS on 2026-09-10. The
 *      insights pipeline that would fill them is not deployed
 *      (health-cascade.service.ts:19-32 says so in its own words).
 *
 * So the clinic segment stands for records nobody has loaded. Drawing it
 * anyway would put a colour on screen that means nothing, next to two that
 * mean something — which is worse than drawing two.
 *
 * The provenance we DO have is which producer array a trend came out of, and
 * that is real: the Health Trends screen already fetches clinic trends,
 * device trends and self-assessments as three separate queries. This
 * component takes segments the caller has already filtered to non-empty and
 * renders exactly those. NEVER pass it a zero-count segment.
 *
 * ─── AND WHY IT READS THE WAY IT DOES ────────────────────────────────
 *
 * Colour alone fails this cohort — colour-blindness, glare, cheap screens,
 * and Ken's patients skew older. So every segment carries a visible text
 * label AND its number underneath the bar, and the bar itself is decorative
 * to a screen reader: one accessibilityLabel on the whole thing reads the
 * full breakdown as a sentence.
 *
 * It is also ONE element, not three tappable regions. Three targets cannot
 * each hold 44px at a 320px screen width, and there is nowhere useful for a
 * segment tap to go — the sections it summarises are directly below it.
 */

export interface TrendSource {
  key: string;
  /** Plain language. Not "Apple Health" — on Android the same data is Health Connect. */
  label: string;
  count: number;
  color: string;
}

export interface TrendSourceBarProps {
  /** Caller must pass ONLY sources with a real count. See the header note. */
  sources: TrendSource[];
  /** What one unit is, in words, for the summary line and the a11y label. */
  noun?: string;
  testID?: string;
}

function TrendSourceBar({ sources, noun = 'things we track', testID }: TrendSourceBarProps) {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];

  // Defensive: a zero-count segment would render a 0%-wide sliver and a "0"
  // caption, which is exactly the drawn-but-empty state this exists to avoid.
  const shown = sources.filter((s) => s.count > 0);
  const total = shown.reduce((a, s) => a + s.count, 0);
  if (total === 0) return null;

  const spoken = shown.map((s) => `${s.count} from ${s.label.toLowerCase()}`).join(', ');

  return (
    <View
      style={[styles.wrap, { borderColor: colors.border, backgroundColor: colors.card }]}
      accessibilityRole="summary"
      accessibilityLabel={`${total} ${noun}: ${spoken}.`}
      testID={testID}
    >
      <Text
        style={{
          color: colors.text,
          fontSize: getScaledFontSize(16),
          fontWeight: getScaledFontWeight(700) as TextStyle['fontWeight'],
        }}
        accessibilityElementsHidden
        importantForAccessibility="no"
      >
        {total} {noun}
      </Text>

      <View
        style={styles.bar}
        accessibilityElementsHidden
        importantForAccessibility="no"
      >
        {shown.map((s, i) => (
          <View
            key={s.key}
            style={{
              flex: s.count,
              backgroundColor: s.color,
              // Round only the outer ends so the segments read as one bar.
              borderTopLeftRadius: i === 0 ? Radii.sm : 0,
              borderBottomLeftRadius: i === 0 ? Radii.sm : 0,
              borderTopRightRadius: i === shown.length - 1 ? Radii.sm : 0,
              borderBottomRightRadius: i === shown.length - 1 ? Radii.sm : 0,
            }}
          />
        ))}
      </View>

      {/* The legend is the accessible copy of the bar: every segment named
          and counted in text, so nothing here depends on telling colours
          apart. */}
      <View
        style={styles.legend}
        accessibilityElementsHidden
        importantForAccessibility="no"
      >
        {shown.map((s) => (
          <View key={s.key} style={styles.legendItem}>
            <View style={[styles.swatch, { backgroundColor: s.color }]} />
            <Text
              style={{
                color: colors.subtext,
                fontSize: getScaledFontSize(14),
              }}
            >
              {s.label}{' '}
              <Text
                style={{
                  color: colors.text,
                  fontWeight: getScaledFontWeight(700) as TextStyle['fontWeight'],
                }}
              >
                {s.count}
              </Text>
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderWidth: 1,
    borderRadius: Radii.md,
    padding: Spacing.md,
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  bar: {
    flexDirection: 'row',
    height: 14,
    borderRadius: Radii.sm,
    overflow: 'hidden',
  },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 12, height: 12, borderRadius: 3 },
});

export default TrendSourceBar;

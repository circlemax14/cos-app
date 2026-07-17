/**
 * Provenance chip for goals/tasks on the unified BPS plan (COS-467).
 *
 * Renders a small inline pill communicating where an item came from —
 * care team, AI, patient-edited, integrative overlay, or ambiguous
 * (needs review). Pure presentational, memoized. No Pressable — chips
 * are informational, never tappable.
 *
 * Precedence rules (also unit-tested in tests/unit/unified-plan-
 * provenance.test.ts):
 *   1. `ambiguous === true` wins over everything → warning variant.
 *   2. `editedBy === 'patient'` next → success "You edited".
 *   3. Otherwise the raw `source` mapping.
 *   4. `source === 'bps'` collapses to null (no chip on BPS-native items
 *      — the section header itself is provenance enough).
 */

import React from 'react';
import { StyleSheet, Text, View, type TextStyle } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { resolveProvenanceVariant } from '@/lib/unified-plan-provenance';
import type { PlanItemSource } from '@/services/api/unified-plan';

type ColorMap = Record<string, string | undefined>;

export interface ProvenanceChipProps {
  source: PlanItemSource;
  ambiguous?: boolean;
  editedBy?: 'patient' | 'care_manager';
  sourceCategory?: string;
  colors: ColorMap;
  getScaledFontSize: (n: number) => number;
  getScaledFontWeight: (n: number) => string;
}

// Re-export the pure resolver so existing importers keep working.
export { resolveProvenanceVariant };

/** Append two hex digits of alpha to a `#RRGGBB` color. Falls through for other forms. */
function alpha(hex: string, hh: string): string {
  return hex.length === 7 && hex.startsWith('#') ? hex + hh : hex;
}

function ProvenanceChipInner({
  source,
  ambiguous,
  editedBy,
  sourceCategory,
  colors,
  getScaledFontSize,
  getScaledFontWeight,
}: ProvenanceChipProps): React.JSX.Element | null {
  const variant = resolveProvenanceVariant({
    source,
    ambiguous,
    editedBy,
    sourceCategory,
    colors,
  });
  if (!variant) return null;

  const isFilled = variant.style === 'filled';
  const isEmphatic = ambiguous || sourceCategory === 'unclassified';
  const bg = isFilled ? alpha(variant.tint, isEmphatic ? '26' : '1F') : 'transparent';

  // Screen-reader label composes the human variant label with the
  // structured category + ambiguity hints so VoiceOver reads e.g.
  // "AI suggestion, category sleep, ambiguous match".
  const a11yLabel =
    variant.label +
    (sourceCategory ? `, category ${sourceCategory}` : '') +
    (ambiguous ? ', ambiguous match' : '');

  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={a11yLabel}
      style={[
        styles.chip,
        {
          borderColor: variant.tint,
          backgroundColor: bg,
        },
      ]}
    >
      <MaterialIcons
        name={variant.icon as keyof typeof MaterialIcons.glyphMap}
        size={getScaledFontSize(12)}
        color={variant.tint}
      />
      <Text
        style={{
          color: variant.tint,
          fontSize: getScaledFontSize(11),
          fontWeight: getScaledFontWeight(700) as TextStyle['fontWeight'],
          marginLeft: 4,
          letterSpacing: 0.3,
        }}
        numberOfLines={1}
      >
        {variant.label}
      </Text>
    </View>
  );
}

export const ProvenanceChip = React.memo(ProvenanceChipInner);

const styles = StyleSheet.create({
  // Grow vertically with the user's font scale — a fixed height:20 clipped
  // 200% a11y text on the 11pt label. minHeight preserves the "pill" shape
  // at default text size; the vertical padding gives room without letting
  // scaled glyphs collide with the border. Explicit lineHeight is
  // intentionally omitted so it tracks the scaled font size.
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    minHeight: 20,
    alignSelf: 'flex-start',
  },
});

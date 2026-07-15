import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';
import type { IntakeQuestionOption, IntakeScreenerKind } from '@/types/patient-intake';

// Canonical PHQ-2 / GAD-2 / PSS-4 / LSNS-6 anchor sets.
// Exported so IntakeQuestionRenderer can hand the right labels + range to
// ScaleQuestion when a question carries a `screener` kind.
export const SCREENER_SCALES: Record<
  IntakeScreenerKind,
  { min: number; max: number; labels: string[] }
> = {
  phq2: {
    min: 0,
    max: 3,
    labels: ['Not at all', 'Several days', 'More than half the days', 'Nearly every day'],
  },
  gad2: {
    min: 0,
    max: 3,
    labels: ['Not at all', 'Several days', 'More than half the days', 'Nearly every day'],
  },
  pss4: {
    min: 0,
    max: 4,
    labels: ['Never', 'Almost never', 'Sometimes', 'Fairly often', 'Very often'],
  },
  lsns6: {
    min: 0,
    max: 4,
    labels: ['None', 'One', 'Two', 'Three or four', 'Five or more'],
  },
};

interface Props {
  value: number | null;
  onChange: (v: number) => void;
  // Traditional (labels/min/max) path — used by PHQ/GAD/PSS/LSNS screeners via
  // SCREENER_SCALES. Ignored when `options` is provided.
  labels?: string[];
  min?: number;
  max?: number;
  // When provided, wins over labels/min/max: renders one chip per option using
  // option.value (a number) as the chip value; first/last option.label become
  // the left/right anchor text.
  options?: IntakeQuestionOption[];
  // Optional per-section accent for the SELECTED chip's background. Falls back
  // to colors.tint when absent. Unselected chip + text styling is unchanged.
  sectionColor?: string;
}

export default function ScaleQuestion({
  value,
  onChange,
  labels,
  min,
  max,
  options,
  sectionColor,
}: Props) {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];

  const useOptions = Array.isArray(options) && options.length > 0;

  // Normalise both API shapes into a single `{ value:number, label:string }[]`
  // list plus left/right anchor strings so the render path stays one branch.
  const chips: { value: number; label: string }[] = useOptions
    ? (options as IntakeQuestionOption[]).map((o) => ({
        value: typeof o.value === 'number' ? o.value : Number(o.value),
        label: o.label,
      }))
    : (() => {
        const lo = min ?? 0;
        const hi = max ?? 0;
        const out: { value: number; label: string }[] = [];
        for (let i = lo; i <= hi; i++) {
          out.push({ value: i, label: labels?.[i - lo] ?? String(i) });
        }
        return out;
      })();

  const leftAnchor = chips[0]?.label ?? '';
  const rightAnchor = chips[chips.length - 1]?.label ?? '';
  const selectedBg = sectionColor ?? colors.tint;

  return (
    <View>
      <View style={styles.chipRow}>
        {chips.map((c) => {
          const selected = value === c.value;
          return (
            <Pressable
              key={c.value}
              onPress={() => onChange(c.value)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`${c.label}, value ${c.value}`}
              style={[
                styles.chip,
                {
                  borderColor: selected ? selectedBg : colors.border,
                  backgroundColor: selected ? selectedBg : colors.card,
                },
              ]}
            >
              <Text
                style={{
                  color: selected ? '#fff' : colors.text,
                  fontSize: getScaledFontSize(16),
                  fontWeight: getScaledFontWeight(700) as any,
                }}
              >
                {c.value}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.anchorRow}>
        <Text
          style={{
            color: colors.subtext,
            fontSize: getScaledFontSize(12),
            fontWeight: getScaledFontWeight(500) as any,
            flex: 1,
          }}
        >
          {leftAnchor}
        </Text>
        <Text
          style={{
            color: colors.subtext,
            fontSize: getScaledFontSize(12),
            fontWeight: getScaledFontWeight(500) as any,
            flex: 1,
            textAlign: 'right',
          }}
        >
          {rightAnchor}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chipRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 6,
  },
  anchorRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  chip: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 40,
  },
});

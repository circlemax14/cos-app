/**
 * RetireClassicSunsetBanner (COS-475, Phase 6.4).
 *
 * Two-stage sunset banner controlled by the feature flag
 * `plan_classic_sunset_stage`:
 *   - 'notice'   → soft informational card + feedback CTA.
 *   - 'imminent' → higher-emphasis warning w/ optional countdown date.
 *   - anything else (missing / 'off') → renders null.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View, type TextStyle } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';

import { Radii, Spacing } from '@/constants/design-system';
import { useFeatureFlags } from '@/hooks/use-feature-flags';

type ColorMap = Record<string, string | undefined>;

const STAGE_FLAG = 'plan_classic_sunset_stage';
const RETIRE_DATE_FLAG = 'plan_classic_sunset_date';

type SunsetStage = 'notice' | 'imminent' | 'off';

function stageFromFlags(
  flags: Record<string, unknown> | null | undefined,
): SunsetStage {
  const raw = flags?.[STAGE_FLAG];
  if (raw === 'notice' || raw === 'imminent') return raw;
  return 'off';
}

export function RetireClassicSunsetBanner({
  colors,
  getScaledFontSize,
  getScaledFontWeight,
}: {
  colors: ColorMap;
  getScaledFontSize: (n: number) => number;
  getScaledFontWeight: (n: number) => string;
}): React.JSX.Element | null {
  const { data } = useFeatureFlags();
  const stage = stageFromFlags(data as Record<string, unknown> | undefined);
  if (stage === 'off') return null;

  const rawDate = (data as Record<string, unknown> | undefined)?.[RETIRE_DATE_FLAG];
  const retireDate = typeof rawDate === 'string' ? rawDate : null;
  const tint = (colors.tint as string) ?? '#008080';
  const warn = (colors.warning as string) ?? '#B45309';
  const accent = stage === 'imminent' ? warn : tint;
  const text = colors.text ?? '#111827';
  const subtext = colors.subtext ?? '#6B7280';

  const title =
    stage === 'imminent'
      ? retireDate
        ? `Classic view retires ${retireDate}`
        : 'Classic view retires soon'
      : 'Classic Care Plan is moving to the new view soon';

  const body =
    stage === 'imminent'
      ? 'All your tasks and routines already live here.'
      : 'Everything from your Care Plan, organized by biopsychosocial.';

  return (
    <View
      accessibilityRole="text"
      style={[
        styles.card,
        {
          backgroundColor: accent + '14',
          borderColor: accent + '55',
        },
      ]}
      testID={`plan-v2-sunset-banner-${stage}`}
    >
      <View style={styles.row}>
        <MaterialIcons
          name={stage === 'imminent' ? 'warning-amber' : 'info-outline'}
          size={getScaledFontSize(18)}
          color={accent}
        />
        <Text
          style={{
            color: text,
            fontSize: getScaledFontSize(13),
            fontWeight: getScaledFontWeight(800) as TextStyle['fontWeight'],
            marginLeft: 8,
            flex: 1,
          }}
        >
          {title}
        </Text>
      </View>
      <Text
        style={{
          color: subtext,
          fontSize: getScaledFontSize(12),
          marginTop: 4,
          lineHeight: 17,
        }}
      >
        {body}
      </Text>
      <Pressable
        onPress={() => router.push('/Home/support' as never)}
        accessibilityRole="button"
        accessibilityLabel="Give feedback on the new plan view"
        style={({ pressed }) => [styles.ctaRow, { opacity: pressed ? 0.75 : 1 }]}
      >
        <Text
          style={{
            color: accent,
            fontSize: getScaledFontSize(12),
            fontWeight: getScaledFontWeight(700) as TextStyle['fontWeight'],
          }}
        >
          Give feedback
        </Text>
        <MaterialIcons name="chevron-right" size={getScaledFontSize(16)} color={accent} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: Radii.md,
    padding: Spacing.md - 2,
    marginHorizontal: Spacing.md,
    marginTop: Spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ctaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
});

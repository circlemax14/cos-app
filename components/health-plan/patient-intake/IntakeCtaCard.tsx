/**
 * IntakeCtaCard — HS-1 / SCRUM-590 patient-intake entry banner.
 *
 * Self-gating card mounted at the top of PlanScreenRedesignedV2. Reads
 * intake status via usePatientIntake and renders one of two variants:
 *   1. Intake not complete (missing or in_progress)
 *      → prominent tint-tinted banner routing to /Home/patient-intake.
 *   2. Intake complete
 *      → subtle "Intake completed <date> · Retake" inline link.
 *
 * Returns null while loading or if the hook errors so the host screen
 * never shows a placeholder / skeleton for this row. Visual shape
 * (banner + bannerIcon styles, alpha() helper) mirrors TryNewPlanCta so
 * both banners read at the same weight on the plan screen.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';

import { Colors } from '@/constants/theme';
import { Radii, Spacing } from '@/constants/design-system';
import { useAccessibility } from '@/stores/accessibility-store';
import { usePatientIntake } from '@/hooks/use-patient-intake';

// Add an alpha suffix to a 6-digit hex color (e.g. tint + '14'). Guarded
// so a non-standard palette value falls back to the opaque color instead
// of producing an invalid 9-char string. Mirrors TryNewPlanCta.
function alpha(hex: string, hh: string): string {
  return hex.length === 7 ? hex + hh : hex;
}

export default function IntakeCtaCard(): React.JSX.Element | null {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  const tint = colors.tint as string;

  const q = usePatientIntake();

  // Silent while loading / errored — the plan screen already has other
  // content to show, and this row is optional signage.
  if (q.isLoading || q.isError) return null;

  const intake = q.data?.intake ?? null;
  const isComplete = intake?.status === 'complete';

  const go = () => router.push('/Home/patient-intake' as never);
  const goRetake = () =>
    router.push('/Home/patient-intake?retake=1' as never);

  if (isComplete) {
    const dateStr = intake?.completedAt
      ? new Date(intake.completedAt).toLocaleDateString()
      : '';
    return (
      <Pressable
        onPress={goRetake}
        style={styles.subtle}
        accessibilityRole="button"
        accessibilityLabel="Retake intake"
        accessibilityHint="Opens the patient intake wizard to retake"
      >
        <MaterialIcons name="check-circle" size={16} color={tint} />
        <Text
          style={{
            color: colors.subtext,
            marginLeft: 6,
            fontSize: getScaledFontSize(13),
            fontWeight: getScaledFontWeight(500) as any,
          }}
        >
          Intake completed {dateStr} · <Text style={{ color: tint }}>Retake</Text>
        </Text>
      </Pressable>
    );
  }

  const inProgress = intake?.status === 'in_progress';
  const title = inProgress
    ? 'Finish your health check-in'
    : 'Complete your health check-in';
  const body = inProgress
    ? 'Pick up right where you left off — takes about 10 minutes.'
    : 'A quick 30-question intake so we can personalize your Care Plan.';

  return (
    <Pressable
      onPress={go}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint="Opens patient intake"
      style={({ pressed }) => [
        styles.banner,
        {
          backgroundColor: alpha(tint, settings.isDarkTheme ? '22' : '14'),
          borderColor: alpha(tint, '55'),
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <View style={[styles.bannerIcon, { backgroundColor: alpha(tint, '22') }]}>
        <MaterialIcons
          name={inProgress ? 'edit' : 'assignment'}
          size={22}
          color={tint}
        />
      </View>
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text
          style={{
            color: colors.text,
            fontSize: getScaledFontSize(16),
            fontWeight: getScaledFontWeight(700) as any,
          }}
        >
          {title}
        </Text>
        <Text
          style={{
            color: colors.subtext,
            marginTop: 2,
            fontSize: getScaledFontSize(13),
            fontWeight: getScaledFontWeight(400) as any,
          }}
        >
          {body}
        </Text>
      </View>
      <MaterialIcons name="chevron-right" size={22} color={colors.subtext} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    marginHorizontal: Spacing.screenPadding,
    marginTop: Spacing.md - 2,
    borderWidth: 1,
    borderRadius: Radii.xl,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  bannerIcon: {
    width: 40,
    height: 40,
    borderRadius: Radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subtle: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.screenPadding,
    paddingVertical: 8,
  },
});

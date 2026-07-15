/**
 * IntakeCtaCard — HS-1 / SCRUM-590 patient-intake entry banner.
 *
 * Self-gating card mounted at the top of PlanScreenRedesignedV2. Reads
 * intake status via usePatientIntake and renders one of two variants:
 *   1. Intake not complete (missing or in_progress)
 *      → prominent tint-tinted banner routing to /Home/patient-intake.
 *   2. Intake complete
 *      → compact Section-1 card ("1 / 9" chip + icon + title + completed
 *        date, with a small "Retake" text button at bottom-right)
 *        matching SummaryCardShell's shape so it reads as the first
 *        section on the Health Summary.
 *
 * Returns null while loading or if the hook errors so the host screen
 * never shows a placeholder / skeleton for this row. The outer container
 * has no horizontal margin — the parent Health Summary ScrollView
 * already applies screen padding; adding it here would double-indent.
 */
import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type TextStyle,
} from 'react-native';
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

// Muted/positive accent used for the "completed" Section-1 card. Kept
// distinct from the pre-intake CTA (which uses the prominent tint) so
// finished users get a calmer, less-attention-grabbing signal.
const COMPLETED_ACCENT = '#199C4F';

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
      <View
        style={[
          styles.card,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
        accessibilityLabel={`Section 1 of 9: Health history intake, completed ${dateStr}`}
      >
        <View style={styles.completedHeader}>
          <View style={[styles.numberChip, { borderColor: colors.border }]}>
            <Text
              style={{
                fontSize: getScaledFontSize(11),
                fontWeight: getScaledFontWeight(700) as TextStyle['fontWeight'],
                color: colors.subtext,
                letterSpacing: 0.3,
              }}
              accessibilityElementsHidden
              importantForAccessibility="no"
            >
              1 / 9
            </Text>
          </View>

          <View
            style={[
              styles.completedIconChip,
              { backgroundColor: alpha(COMPLETED_ACCENT, '1A') },
            ]}
          >
            <MaterialIcons
              name="check-circle"
              size={getScaledFontSize(20)}
              color={COMPLETED_ACCENT}
            />
          </View>

          <View style={{ flex: 1 }}>
            <Text
              accessibilityRole="header"
              numberOfLines={2}
              style={{
                color: colors.text,
                fontSize: getScaledFontSize(15),
                fontWeight: getScaledFontWeight(700) as TextStyle['fontWeight'],
              }}
            >
              Health history intake
            </Text>
            <Text
              style={{
                color: colors.subtext,
                marginTop: 2,
                fontSize: getScaledFontSize(13),
                fontWeight: getScaledFontWeight(400) as TextStyle['fontWeight'],
              }}
            >
              Completed {dateStr}
            </Text>
          </View>
        </View>

        <View style={styles.retakeRow}>
          <Pressable
            onPress={goRetake}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Retake intake"
            accessibilityHint="Opens the patient intake wizard to retake"
            style={({ pressed }) => [
              styles.retakeButton,
              { opacity: pressed ? 0.6 : 1 },
            ]}
          >
            <Text
              style={{
                color: colors.subtext,
                fontSize: getScaledFontSize(13),
                fontWeight: getScaledFontWeight(600) as TextStyle['fontWeight'],
              }}
            >
              Retake
            </Text>
          </Pressable>
        </View>
      </View>
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
            fontWeight: getScaledFontWeight(700) as TextStyle['fontWeight'],
          }}
        >
          {title}
        </Text>
        <Text
          style={{
            color: colors.subtext,
            marginTop: 2,
            fontSize: getScaledFontSize(13),
            fontWeight: getScaledFontWeight(400) as TextStyle['fontWeight'],
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
    marginTop: Spacing.md - 2,
    marginBottom: Spacing.md,
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
  card: {
    borderWidth: 1,
    borderRadius: Radii.xl,
    padding: Spacing.md,
    marginTop: Spacing.md - 2,
    marginBottom: Spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  completedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  numberChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radii.full,
    borderWidth: 1,
  },
  completedIconChip: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retakeRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: Spacing.sm,
  },
  retakeButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
});

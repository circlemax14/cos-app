/**
 * IntakeCtaCard — HS-1 / SCRUM-590 patient-intake entry banner.
 *
 * Self-gating card mounted on the Health Summary tab. Reads intake status
 * via usePatientIntake and renders one of two variants:
 *   1. Not complete → prominent tint banner routing to /Home/patient-intake
 *   2. Complete    → an info card with: check icon, "Health history intake"
 *                    header, completion date, question count, a one-line
 *                    explanation of what the intake powers, and a subtle
 *                    Retake button.
 *
 * Returns null while loading or on error so the host screen never shows a
 * placeholder for this row.
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

function alpha(hex: string, hh: string): string {
  return hex.length === 7 ? hex + hh : hex;
}

const COMPLETED_ACCENT = '#199C4F';

function formatFullDate(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function IntakeCtaCard(): React.JSX.Element | null {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  const tint = colors.tint as string;

  const q = usePatientIntake();
  if (q.isLoading || q.isError) return null;

  const intake = q.data?.intake ?? null;
  const isComplete = intake?.status === 'complete';

  const go = () => router.push('/Home/patient-intake' as never);
  const goRetake = () =>
    router.push('/Home/patient-intake?retake=1' as never);

  if (isComplete) {
    const dateStr = formatFullDate(intake?.completedAt);
    const answerCount = intake?.answers
      ? Object.keys(intake.answers).filter(k => intake.answers[k] != null).length
      : 0;

    return (
      <View
        style={[
          styles.card,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
        accessibilityLabel={`Health history intake completed on ${dateStr}. ${answerCount} answers on file.`}
      >
        <View style={styles.headerRow}>
          <View
            style={[
              styles.iconChip,
              { backgroundColor: alpha(COMPLETED_ACCENT, '1A') },
            ]}
          >
            <MaterialIcons
              name="assignment-turned-in"
              size={getScaledFontSize(22)}
              color={COMPLETED_ACCENT}
            />
          </View>

          <View style={{ flex: 1 }}>
            <Text
              accessibilityRole="header"
              numberOfLines={2}
              style={{
                color: colors.text,
                fontSize: getScaledFontSize(17),
                fontWeight: getScaledFontWeight(700) as TextStyle['fontWeight'],
              }}
            >
              Health history intake
            </Text>
            <Text
              style={{
                color: COMPLETED_ACCENT,
                marginTop: 2,
                fontSize: getScaledFontSize(12),
                fontWeight: getScaledFontWeight(600) as TextStyle['fontWeight'],
                letterSpacing: 0.2,
              }}
            >
              COMPLETED
            </Text>
          </View>
        </View>

        <View style={styles.metaRow}>
          <View style={styles.metaCell}>
            <Text
              style={{
                color: colors.subtext,
                fontSize: getScaledFontSize(11),
                fontWeight: getScaledFontWeight(600) as TextStyle['fontWeight'],
                letterSpacing: 0.3,
              }}
            >
              COMPLETED ON
            </Text>
            <Text
              style={{
                color: colors.text,
                marginTop: 4,
                fontSize: getScaledFontSize(14),
                fontWeight: getScaledFontWeight(600) as TextStyle['fontWeight'],
              }}
            >
              {dateStr || '—'}
            </Text>
          </View>
          <View style={[styles.metaCell, styles.metaCellRight]}>
            <Text
              style={{
                color: colors.subtext,
                fontSize: getScaledFontSize(11),
                fontWeight: getScaledFontWeight(600) as TextStyle['fontWeight'],
                letterSpacing: 0.3,
              }}
            >
              ANSWERS
            </Text>
            <Text
              style={{
                color: colors.text,
                marginTop: 4,
                fontSize: getScaledFontSize(14),
                fontWeight: getScaledFontWeight(600) as TextStyle['fontWeight'],
              }}
            >
              {answerCount} of 30
            </Text>
          </View>
        </View>

        <View style={[styles.infoBox, { backgroundColor: alpha(COMPLETED_ACCENT, '10'), borderColor: alpha(COMPLETED_ACCENT, '33') }]}>
          <MaterialIcons
            name="info-outline"
            size={getScaledFontSize(16)}
            color={COMPLETED_ACCENT}
            style={{ marginRight: 8 }}
          />
          <Text
            style={{
              flex: 1,
              color: colors.text,
              fontSize: getScaledFontSize(12),
              fontWeight: getScaledFontWeight(400) as TextStyle['fontWeight'],
              lineHeight: getScaledFontSize(17),
            }}
          >
            Your intake powers the biopsychosocial history, treatments, and recommendations shown below.
          </Text>
        </View>

        <Pressable
          onPress={goRetake}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Retake health intake"
          accessibilityHint="Opens the patient intake wizard to retake"
          style={({ pressed }) => [
            styles.retakeButton,
            { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <MaterialIcons
            name="refresh"
            size={getScaledFontSize(16)}
            color={colors.subtext}
            style={{ marginRight: 6 }}
          />
          <Text
            style={{
              color: colors.subtext,
              fontSize: getScaledFontSize(13),
              fontWeight: getScaledFontWeight(600) as TextStyle['fontWeight'],
            }}
          >
            Retake intake
          </Text>
        </Pressable>
      </View>
    );
  }

  const inProgress = intake?.status === 'in_progress';
  const title = inProgress
    ? 'Finish your health check-in'
    : 'Complete your health check-in';
  const body = inProgress
    ? 'Pick up right where you left off — takes about 10 minutes.'
    : 'A quick 30-question intake so we can personalize your Care Plan and health summary.';

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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  iconChip: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metaRow: {
    flexDirection: 'row',
    marginTop: Spacing.md,
  },
  metaCell: {
    flex: 1,
  },
  metaCellRight: {
    alignItems: 'flex-end',
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: Spacing.sm + 2,
    marginTop: Spacing.md,
    borderWidth: 1,
    borderRadius: Radii.md,
  },
  retakeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: Spacing.md,
    borderRadius: Radii.md,
    borderWidth: 1,
  },
});

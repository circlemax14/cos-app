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
import React, { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type TextStyle,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';

import { Radii, Spacing } from '@/constants/design-system';
import { usePatientIntake } from '@/hooks/use-patient-intake';
import RetakeSectionSheet, { type RetakeGroupPick } from './RetakeSectionSheet';
import { readableOn } from './intake-legibility';
import { useIntakeLegibility } from './use-intake-legibility';

function alpha(hex: string, hh: string): string {
  return hex.length === 7 ? hex + hh : hex;
}

const COMPLETED_ACCENT = '#199C4F';
/*
 * COS-1223 — COS-1221 claimed "the accent used AS text" had been found and
 * derived everywhere. It had not: this file had two sites left, neither of them
 * in that round's audit table.
 *
 *   'COMPLETED'        COMPLETED_ACCENT on colors.card    3.26:1 light / 4.60:1 dark
 *   'View my intake'   a hardcoded white on the accent    3.55:1 in both themes
 *
 * Same derivation as the selected option row. The label on the accent FILL is
 * measured against the accent (readableOn -> #11181C, 5.05:1). The status label
 * has no fill, so it is measured against the surface it actually sits on rather
 * than painted in the accent — no single accent-derived hue clears AA as text on
 * both the light and the dark card. The hue still reads: it is the glyph chip
 * immediately left of that label, the info box, and the primary button.
 */
const ON_COMPLETED_ACCENT = readableOn(COMPLETED_ACCENT);

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
  // COS-1221 — folder-wide conversion. Still the FIRST hook in this component:
  // see the note below about the hook-count crash.
  const { colors, isDark, fs, fw, muted } = useIntakeLegibility();
  const tint = colors.tint as string;
  /*
   * COS-1221 — a glyph chip is sized FROM its glyph, not pinned at a number:
   * these were fixed numbers around a glyph that now carries the tablet step as
   * well as the patient's own scale, so at the top of that range the icon
   * spilled out of its own circle.
   *
   * COS-1223 — but the derivation was `glyph * 2`, and "already ~2x its glyph
   * at scale 1" was false for three of the folder's six boxes. bannerIcon was a
   * 40pt box around a 22pt glyph, so x2 silently grew it to 44 on the phone —
   * where sizing is signed off and the comment two lines up says nothing may
   * move. Each box now goes through the SAME pipeline as its glyph: at phone
   * default scale `fs(n)` is exactly `n`, so these are the pre-COS-1216 numbers
   * byte for byte, and at any larger scale box and glyph grow by one shared
   * multiplier, which is what stops the clipping.
   */
  const bannerBox = fs(40); // styles.bannerIcon, around an fs(22) glyph
  const chipBox = fs(44); // styles.iconChip, around the same fs(22) glyph

  const q = usePatientIntake();

  // Ken 2026-08-05 — retake opens the section picker sheet (Demographics /
  // Medical conditions & medications / Vaccines / Lifestyle / Mental health /
  // Social support / Work & finances / All sections) so patients don't have to
  // walk all 30+ questions when they only want to update one area.
  //
  // DECLARED BEFORE THE EARLY RETURN BELOW, and it must stay there. It used to
  // sit further down, after `if (q.isLoading) return null` — so the loading
  // render ran two hooks and the loaded render ran three. React threw
  // "Rendered more hooks than during the previous render" on the transition and,
  // with no error boundary anywhere in the app at the time, that killed the
  // whole process. Crash report 2026-08-15, iOS 26.6, SIGABRT on
  // expo.controller.errorRecoveryQueue.
  //
  // It only fired when isLoading actually flipped true → false with this card
  // mounted, which is why it looked intermittent rather than obvious.
  const [retakeSheetOpen, setRetakeSheetOpen] = useState(false);

  // Silent while loading; on error we still render the pre-intake CTA so
  // the patient always has a path forward from the Health Summary tab
  // (the tab fail-closes the summary body when intake status is unknown,
  // so returning null here would strand them).
  //
  // EVERY HOOK THIS COMPONENT USES MUST BE CALLED ABOVE THIS LINE.
  if (q.isLoading) return null;

  const intake = q.data?.intake ?? null;
  const isComplete = intake?.status === 'complete';

  const go = () => router.push('/Home/patient-intake' as never);
  const handleRetakePick = (group: RetakeGroupPick) => {
    setRetakeSheetOpen(false);
    const suffix = group ? `&group=${group}` : '';
    router.push(`/Home/patient-intake?retake=1${suffix}` as never);
  };
  const goViewReport = () =>
    router.push('/Home/patient-intake-report' as never);

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
              {
                backgroundColor: alpha(COMPLETED_ACCENT, '1A'),
                width: chipBox,
                height: chipBox,
                borderRadius: chipBox / 2,
              },
            ]}
          >
            <MaterialIcons
              name="assignment-turned-in"
              size={fs(22)}
              color={COMPLETED_ACCENT}
            />
          </View>

          <View style={{ flex: 1 }}>
            <Text
              accessibilityRole="header"
              style={{
                color: colors.text,
                fontSize: fs(17),
                fontWeight: fw(700) as TextStyle['fontWeight'],
              }}
            >
              Health history intake
            </Text>
            <Text
              style={{
                // Derived from the surface it sits on — see ON_COMPLETED_ACCENT.
                color: readableOn(colors.card),
                marginTop: 2,
                fontSize: fs(12),
                fontWeight: fw(600) as TextStyle['fontWeight'],
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
                color: muted,
                fontSize: fs(11),
                fontWeight: fw(600) as TextStyle['fontWeight'],
                letterSpacing: 0.3,
              }}
            >
              COMPLETED ON
            </Text>
            <Text
              style={{
                color: colors.text,
                marginTop: 4,
                fontSize: fs(14),
                fontWeight: fw(600) as TextStyle['fontWeight'],
              }}
            >
              {dateStr || '—'}
            </Text>
          </View>
          <View style={[styles.metaCell, styles.metaCellRight]}>
            <Text
              style={{
                color: muted,
                fontSize: fs(11),
                fontWeight: fw(600) as TextStyle['fontWeight'],
                letterSpacing: 0.3,
              }}
            >
              ANSWERS
            </Text>
            <Text
              style={{
                color: colors.text,
                marginTop: 4,
                fontSize: fs(14),
                fontWeight: fw(600) as TextStyle['fontWeight'],
              }}
            >
              {answerCount} of 30
            </Text>
          </View>
        </View>

        <View style={[styles.infoBox, { backgroundColor: alpha(COMPLETED_ACCENT, '10'), borderColor: alpha(COMPLETED_ACCENT, '33') }]}>
          <MaterialIcons
            name="info-outline"
            size={fs(16)}
            color={COMPLETED_ACCENT}
            style={{ marginRight: 8 }}
          />
          <Text
            style={{
              flex: 1,
              color: colors.text,
              fontSize: fs(12),
              fontWeight: fw(400) as TextStyle['fontWeight'],
              lineHeight: fs(17),
            }}
          >
            Your intake powers the biopsychosocial summary, treatments, and recommendations shown below.
          </Text>
        </View>

        <View style={styles.actionRow}>
          <Pressable
            onPress={goViewReport}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="View my intake report"
            accessibilityHint="Opens a read-only report of your intake answers"
            style={({ pressed }) => [
              styles.actionButton,
              styles.actionButtonPrimary,
              { backgroundColor: COMPLETED_ACCENT, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <MaterialIcons
              name="visibility"
              size={fs(16)}
              color={ON_COMPLETED_ACCENT}
              style={{ marginRight: 6 }}
            />
            <Text
              style={{
                color: ON_COMPLETED_ACCENT,
                fontSize: fs(13),
                fontWeight: fw(600) as TextStyle['fontWeight'],
              }}
            >
              View my intake
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setRetakeSheetOpen(true)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Retake health intake"
            accessibilityHint="Opens a picker to update one section or all sections of your intake"
            style={({ pressed }) => [
              styles.actionButton,
              { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <MaterialIcons
              name="refresh"
              size={fs(16)}
              color={muted}
              style={{ marginRight: 6 }}
            />
            <Text
              style={{
                color: muted,
                fontSize: fs(13),
                fontWeight: fw(600) as TextStyle['fontWeight'],
              }}
            >
              Retake
            </Text>
          </Pressable>
        </View>
        <RetakeSectionSheet
          visible={retakeSheetOpen}
          onDismiss={() => setRetakeSheetOpen(false)}
          onPick={handleRetakePick}
        />
      </View>
    );
  }

  const inProgress = intake?.status === 'in_progress';
  const title = inProgress
    ? 'Finish your health check-in'
    : 'Complete your health check-in';
  const body = inProgress
    ? 'Pick up right where you left off — takes about 10 minutes.'
    : 'A quick 30-question intake so we can personalize your Care Plan and health status.';

  return (
    <Pressable
      onPress={go}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint="Opens patient intake"
      style={({ pressed }) => [
        styles.banner,
        {
          backgroundColor: alpha(tint, isDark ? '22' : '14'),
          borderColor: alpha(tint, '55'),
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <View
        style={[
          styles.bannerIcon,
          { backgroundColor: alpha(tint, '22'), width: bannerBox, height: bannerBox },
        ]}
      >
        <MaterialIcons
          name={inProgress ? 'edit' : 'assignment'}
          size={fs(22)}
          color={tint}
        />
      </View>
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text
          style={{
            color: colors.text,
            fontSize: fs(16),
            fontWeight: fw(700) as TextStyle['fontWeight'],
          }}
        >
          {title}
        </Text>
        <Text
          style={{
            color: muted,
            marginTop: 2,
            fontSize: fs(13),
            fontWeight: fw(400) as TextStyle['fontWeight'],
          }}
        >
          {body}
        </Text>
      </View>
      <MaterialIcons name="chevron-right" size={fs(22)} color={muted} />
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
    // width/height are set inline — derived from the glyph.
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
    // width/height/borderRadius are set inline — derived from the glyph.
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
  actionRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  actionButtonPrimary: {
    borderWidth: 0,
  },
});

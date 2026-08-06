/**
 * IntakeReportScreen — read-only snapshot of the patient's completed intake.
 *
 * Renders the answers grouped by clinical domain (Demographics, Conditions &
 * medications, Lifestyle, Mental health, Social support, Work & finances)
 * with screener score blocks (PHQ-2, GAD-2, PSS-4, LSNS-6 abbreviated)
 * surfaced inline where they clinically belong. Data shaping is delegated
 * to the pure `./intake-report-builder` helper so both this on-screen view
 * and the PDF share pipeline stay in lockstep.
 *
 * Reachable via the "View my intake" action on the IntakeCtaCard's
 * completed-state card.
 */
import React, { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type TextStyle,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';

import { AppWrapper } from '@/components/app-wrapper';
import { Colors } from '@/constants/theme';
import { Spacing, Radii } from '@/constants/design-system';
import { useAccessibility } from '@/stores/accessibility-store';
import { usePatientIntake } from '@/hooks/use-patient-intake';
import { useImmunizations } from '@/hooks/use-immunizations';
import { immunizationToRow } from '@/services/api/patient-immunizations';
import ShareIntakeReportSection from './ShareIntakeReportSection';
import RetakeSectionSheet from './RetakeSectionSheet';
import {
  buildReport,
  IMMUNIZATIONS_EHR_ENABLED,
  type EhrRowsByGroup,
  type Group,
  type Row,
  type ScoreBlock,
  type ScoreInterpretation,
} from './intake-report-builder';

// Interpretation pill palette. Kept local to the report — the group icon
// colors come from the builder itself; only screener pills need bucketed
// clinical hues here.
const POSITIVE_FG = '#DC2626';
const POSITIVE_BG = '#FEE2E2';
const MODERATE_FG = '#D97706';
const MODERATE_BG = '#FEF3C7';
const STRONG_FG = '#199C4F';
const STRONG_BG = '#DCFCE7';

function pillPalette(
  interp: ScoreInterpretation,
  neutralFg: string,
  neutralBg: string,
): { fg: string; bg: string } {
  switch (interp) {
    case 'positive':
    case 'low':
      return { fg: POSITIVE_FG, bg: POSITIVE_BG };
    case 'moderate':
      return { fg: MODERATE_FG, bg: MODERATE_BG };
    case 'strong':
      return { fg: STRONG_FG, bg: STRONG_BG };
    case 'below-threshold':
    case 'info':
    default:
      return { fg: neutralFg, bg: neutralBg };
  }
}

export default function IntakeReportScreen() {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];

  const q = usePatientIntake();
  const intake = q.data?.intake ?? null;
  const questions = q.data?.questions ?? [];

  // COS-481 Phase 2: EHR-hydrated immunizations. The hook itself is gated on
  // IMMUNIZATIONS_EHR_ENABLED (`enabled` on the useQuery), so when the kill
  // switch is off the query never fires and `.data` stays undefined. We also
  // gate the payload construction below so a network hiccup silently renders
  // the pre-Phase-2 single-block card instead of an error state.
  const immunizations = useImmunizations();
  const ehrRowsByGroup: EhrRowsByGroup | undefined = React.useMemo(() => {
    if (!IMMUNIZATIONS_EHR_ENABLED) return undefined;
    const list = immunizations.data;
    if (!list || list.length === 0) return undefined;
    return { vaccines: list.map(immunizationToRow) };
  }, [immunizations.data]);

  // Ken 2026-08-05 — sectioned retake. Instead of walking all 30+
  // questions on every "Update my answers" tap, the sheet lets the
  // patient pick a section (Body / Mind / Life) or opt for all. The
  // wizard filters questions client-side and preserves the untouched
  // sections' answers across the fresh intake version. Retake=all
  // preserves the pre-existing single-tap flow.
  const [retakeSheetOpen, setRetakeSheetOpen] = useState(false);
  const goRetake = (section?: 'body' | 'mind' | 'life') => {
    setRetakeSheetOpen(false);
    const suffix = section ? `&section=${section}` : '';
    router.push(`/Home/patient-intake?retake=1${suffix}` as never);
  };
  // router.back() no-ops from this hidden Tabs.Screen (href:null), so
  // route directly to the Health Summary tab that owns the intake CTA.
  const goBack = () => router.replace('/Home/plan' as never);

  if (q.isLoading) {
    return (
      <AppWrapper>
        <View style={styles.centered}>
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 12,
              backgroundColor: colors.card,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          />
          <Text style={{ marginTop: 12, color: colors.subtext, fontSize: 14 }}>
            Loading report…
          </Text>
        </View>
      </AppWrapper>
    );
  }

  // Report is a "completed intake" surface — an in-progress draft has no
  // meaningful snapshot yet, so route the user back to the wizard instead
  // of rendering half-empty rows. Same treatment for missing / errored.
  const notReady = q.isError || !intake || intake.status !== 'complete';
  if (notReady) {
    const inProgress = intake?.status === 'in_progress';
    const message = q.isError
      ? 'Could not load your intake.'
      : inProgress
        ? "Your intake is still in progress. Finish it to see your report."
        : 'No intake on file yet. Complete your intake first to view a report.';
    const primaryLabel = inProgress ? 'Finish intake' : 'Go back';
    const onPrimary = inProgress
      ? () => router.push('/Home/patient-intake' as never)
      : goBack;
    return (
      <AppWrapper>
        <View style={styles.centered}>
          <MaterialIcons
            name={inProgress ? 'edit-note' : 'error-outline'}
            size={getScaledFontSize(48)}
            color={colors.subtext}
          />
          <Text
            style={{
              marginTop: 12,
              color: colors.text,
              fontSize: getScaledFontSize(15),
              textAlign: 'center',
              paddingHorizontal: 24,
            }}
          >
            {message}
          </Text>
          <Pressable
            onPress={onPrimary}
            style={[styles.backBtn, { backgroundColor: colors.tint, marginTop: 16 }]}
            accessibilityRole="button"
          >
            <Text
              style={{
                color: '#fff',
                fontSize: getScaledFontSize(15),
                fontWeight: getScaledFontWeight(600) as TextStyle['fontWeight'],
              }}
            >
              {primaryLabel}
            </Text>
          </Pressable>
        </View>
      </AppWrapper>
    );
  }

  const completedAt = intake.completedAt
    ? new Date(intake.completedAt).toLocaleDateString(undefined, {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : '';
  const answeredCount = Object.keys(intake.answers).filter(k => intake.answers[k] != null).length;

  const groups: Group[] = buildReport(intake, questions, ehrRowsByGroup);

  return (
    <AppWrapper>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topBar}>
          <Pressable
            onPress={goBack}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={({ pressed }) => [styles.iconBtn, { opacity: pressed ? 0.6 : 1 }]}
          >
            <MaterialIcons
              name="arrow-back"
              size={getScaledFontSize(24)}
              color={colors.text}
            />
          </Pressable>
          <Text
            accessibilityRole="header"
            style={{
              flex: 1,
              textAlign: 'center',
              color: colors.text,
              fontSize: getScaledFontSize(17),
              fontWeight: getScaledFontWeight(700) as TextStyle['fontWeight'],
            }}
          >
            Your intake
          </Text>
          <View style={styles.iconBtn} />
        </View>

        <View style={[styles.metaCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
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
                {completedAt || '—'}
              </Text>
            </View>
            <View style={[styles.metaCell, { alignItems: 'flex-end' }]}>
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
                {answeredCount} of {questions.length}
              </Text>
            </View>
          </View>
        </View>

        {groups.map(group => {
          const scoreBlocks = group.scoreBlocks ?? [];
          const ehrRows = group.ehrRows ?? [];
          // A group is "patient-added visible" only when at least one row
          // has an actual answer. If every row is missing but ehrRows are
          // present, we suppress the self-reported block entirely (per the
          // COS-481 Phase 2 layered-card rule) — otherwise a patient with
          // EHR-only records would see an italic "Not shared" line below
          // their real records, which reads as an error.
          const hasSelfReportedContent = group.rows.some(r => !r.missing);
          const hasEhrRows = ehrRows.length > 0;
          const showBothBlocks = hasEhrRows && hasSelfReportedContent;
          if (
            group.rows.length === 0 &&
            scoreBlocks.length === 0 &&
            !hasEhrRows
          )
            return null;
          const renderRow = (row: Row, showDivider: boolean) => (
            <View
              key={row.key}
              style={[
                styles.rowStack,
                showDivider && { borderTopWidth: 1, borderTopColor: colors.border },
              ]}
            >
              {row.label ? (
                <Text
                  style={{
                    color: colors.subtext,
                    fontSize: getScaledFontSize(13),
                    lineHeight: getScaledFontSize(18),
                  }}
                >
                  {row.label}
                </Text>
              ) : null}
              {row.missing ? (
                <Text
                  style={{
                    marginTop: row.label ? 4 : 0,
                    color: colors.subtext,
                    fontSize: getScaledFontSize(15),
                    fontWeight: getScaledFontWeight(400) as TextStyle['fontWeight'],
                    lineHeight: getScaledFontSize(22),
                    fontStyle: 'italic',
                  }}
                >
                  Not shared
                </Text>
              ) : (
                <Text
                  style={{
                    marginTop: row.label ? 4 : 0,
                    color: colors.text,
                    fontSize: getScaledFontSize(15),
                    fontWeight: getScaledFontWeight(600) as TextStyle['fontWeight'],
                    lineHeight: getScaledFontSize(22),
                  }}
                >
                  {row.value}
                </Text>
              )}
            </View>
          );
          return (
            <View
              key={group.id}
              style={[styles.groupCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <View style={styles.groupHeader}>
                <View style={[styles.groupIconChip, { backgroundColor: group.color + '1A' }]}>
                  <MaterialIcons
                    name={group.icon as keyof typeof MaterialIcons.glyphMap}
                    size={getScaledFontSize(18)}
                    color={group.color}
                  />
                </View>
                <Text
                  style={{
                    color: group.color,
                    fontSize: getScaledFontSize(14),
                    fontWeight: getScaledFontWeight(700) as TextStyle['fontWeight'],
                    letterSpacing: 0.3,
                  }}
                >
                  {group.title.toUpperCase()}
                </Text>
              </View>

              {hasEhrRows ? (
                <>
                  {showBothBlocks ? (
                    <Text
                      accessibilityRole="header"
                      style={[
                        styles.subheader,
                        {
                          color: colors.subtext,
                          fontSize: getScaledFontSize(12),
                          fontWeight: getScaledFontWeight(600) as TextStyle['fontWeight'],
                        },
                      ]}
                    >
                      FROM YOUR HEALTH RECORDS
                    </Text>
                  ) : null}
                  {ehrRows.map((row, i) => renderRow(row, i > 0))}
                </>
              ) : null}

              {hasSelfReportedContent ? (
                <>
                  {showBothBlocks ? (
                    <Text
                      accessibilityRole="header"
                      style={[
                        styles.subheader,
                        styles.subheaderSecondary,
                        {
                          color: colors.subtext,
                          fontSize: getScaledFontSize(12),
                          fontWeight: getScaledFontWeight(600) as TextStyle['fontWeight'],
                        },
                      ]}
                    >
                      YOU ADDED THIS
                    </Text>
                  ) : null}
                  {group.rows.map((row, i) =>
                    renderRow(row, i > 0 && !showBothBlocks),
                  )}
                </>
              ) : null}

              {/* When neither ehrRows nor any patient-added rows carry
                  content, we still render the plain self-reported rows so
                  the pre-Phase-2 "Not shared" italic empty-state stays
                  intact for groups that never opted into EHR hydration.
                  This branch only fires when ehrRows is empty AND every
                  self-reported row is missing — the pre-Phase-2 default. */}
              {!hasEhrRows && !hasSelfReportedContent
                ? group.rows.map((row, i) => renderRow(row, i > 0))
                : null}

              {scoreBlocks.map((block: ScoreBlock, i) => {
                const palette = pillPalette(block.interpretation, colors.subtext, colors.border);
                const isNeutralPill =
                  block.interpretation === 'below-threshold' || block.interpretation === 'info';
                const showDivider = group.rows.length > 0 || i > 0;
                return (
                  <View
                    key={block.name}
                    style={[
                      styles.scoreBlock,
                      showDivider && { borderTopWidth: 1, borderTopColor: colors.border },
                    ]}
                  >
                    <Text
                      style={{
                        color: colors.text,
                        fontSize: getScaledFontSize(14),
                        fontWeight: getScaledFontWeight(700) as TextStyle['fontWeight'],
                      }}
                    >
                      {block.name}: {block.sum}/{block.max}
                    </Text>
                    <View
                      style={[
                        isNeutralPill ? styles.scorePillNeutral : styles.scorePill,
                        { backgroundColor: palette.bg },
                      ]}
                    >
                      <Text
                        style={{
                          color: palette.fg,
                          fontSize: getScaledFontSize(11),
                          fontWeight: getScaledFontWeight(700) as TextStyle['fontWeight'],
                          letterSpacing: 0.2,
                        }}
                      >
                        {block.label}
                      </Text>
                    </View>
                    {block.footnote ? (
                      <Text
                        style={{
                          marginTop: 6,
                          color: colors.subtext,
                          fontSize: getScaledFontSize(12),
                          fontStyle: 'italic',
                          lineHeight: getScaledFontSize(16),
                        }}
                      >
                        {block.footnote}
                      </Text>
                    ) : null}
                  </View>
                );
              })}
            </View>
          );
        })}

        <View style={[styles.disclaimer, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <Text
            style={{
              color: colors.subtext,
              fontSize: getScaledFontSize(12),
              fontStyle: 'italic',
              lineHeight: getScaledFontSize(17),
              textAlign: 'center',
            }}
          >
            This is a snapshot of your self-reported answers. It is not a medical record and may not include everything your care team knows.
          </Text>
        </View>

        <ShareIntakeReportSection />

        <Pressable
          onPress={() => setRetakeSheetOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Update my answers"
          accessibilityHint="Opens a picker to update one section or all sections of your intake"
          style={({ pressed }) => [
            styles.retakeButton,
            { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <MaterialIcons
            name="refresh"
            size={getScaledFontSize(18)}
            color={colors.tint}
          />
          <Text
            style={{
              marginLeft: 8,
              color: colors.tint,
              fontSize: getScaledFontSize(15),
              fontWeight: getScaledFontWeight(600) as TextStyle['fontWeight'],
            }}
          >
            Update my answers
          </Text>
        </Pressable>

        <RetakeSectionSheet
          visible={retakeSheetOpen}
          onDismiss={() => setRetakeSheetOpen(false)}
          onPick={goRetake}
          colors={colors}
          scale={getScaledFontSize}
          weight={getScaledFontWeight}
        />

        <View style={{ height: 40 }} />
      </ScrollView>
    </AppWrapper>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 8, flexGrow: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.md,
  },
  iconBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metaCard: {
    borderWidth: 1,
    borderRadius: Radii.xl,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  metaRow: {
    flexDirection: 'row',
  },
  metaCell: {
    flex: 1,
  },
  groupCard: {
    borderWidth: 1,
    borderRadius: Radii.xl,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  groupIconChip: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowStack: {
    paddingVertical: Spacing.sm + 2,
  },
  // COS-481 Phase 2: subheader between EHR rows and patient-added rows in
  // the layered Vaccines card. 12pt, weight 600 subtext color per spec —
  // low visual weight so it clarifies provenance without competing with the
  // group's own icon-chip header.
  subheader: {
    marginTop: 8,
    marginBottom: 4,
    letterSpacing: 0.4,
  },
  subheaderSecondary: {
    marginTop: 12,
  },
  rowLabel: {},
  rowValue: {},
  rowValueMuted: {},
  scoreBlock: {
    paddingVertical: Spacing.sm + 2,
    alignItems: 'flex-start',
  },
  scorePill: {
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: Radii.full,
  },
  scorePillNeutral: {
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: Radii.full,
  },
  scoreFootnote: {},
  disclaimer: {
    borderWidth: 1,
    borderRadius: Radii.xl,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.md,
  },
  retakeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: Radii.md,
    borderWidth: 1,
    marginTop: Spacing.sm,
  },
  backBtn: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
});

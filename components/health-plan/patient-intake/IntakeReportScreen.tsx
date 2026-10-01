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
import { ScoreBands, Spacing, Radii } from '@/constants/design-system';
import { useCanRender } from '@/hooks/use-entitlement';
import { usePatientIntake } from '@/hooks/use-patient-intake';
import { useImmunizations } from '@/hooks/use-immunizations';
import { immunizationToRow } from '@/services/api/patient-immunizations';
import ShareIntakeReportSection from './ShareIntakeReportSection';
import RetakeSectionSheet from './RetakeSectionSheet';
import { useIntakeLegibility } from './use-intake-legibility';
import {
  buildReport,
  IMMUNIZATIONS_EHR_ENABLED,
  type EhrRowsByGroup,
  type Group,
  type Row,
  type ScoreBlock,
  type ScoreInterpretation,
} from './intake-report-builder';

/*
 * Interpretation pill palette — a patient reading their own screener result.
 *
 * COS-1221 fixed POSITIVE_FG (was #DC2626, 3.95:1 on POSITIVE_BG at 11pt bold;
 * 5.30:1 now, the hex LightColors.error moved to) and left the other two
 * sub-AA: moderate #D97706 on #FEF3C7 was 2.86:1 and strong #199C4F on #DCFCE7
 * was 3.24:1 — both normal text at 11pt bold, on a patient's own screener
 * interpretation.
 *
 * COS-1223 — those four hexes are gone rather than re-picked by hand.
 * design-system's ScoreBands is the app's own WCAG-AA-verified fg/bg set and
 * already carries the two buckets this needs, so the pills read from it:
 *
 *   moderate -> ScoreBands.foundational  #8A5100 on #FDF3E4   5.87:1
 *   strong   -> ScoreBands.optimal       #0F6B36 on #E6F4EC   5.83:1
 *
 * A ScoreBands entry is `{ fg, bg, label }`, which is structurally what
 * pillPalette already returned, so nothing downstream changes. Both pills carry
 * their own background, so the ratio is theme-independent — as before.
 */
const POSITIVE_FG = '#B91C1C';
const POSITIVE_BG = '#FEE2E2';

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
      return ScoreBands.foundational;
    case 'strong':
      return ScoreBands.optimal;
    case 'below-threshold':
    case 'info':
    default:
      return { fg: neutralFg, bg: neutralBg };
  }
}

export default function IntakeReportScreen() {
  // COS-1221 — folder-wide conversion to the stepped scaler + AA text tokens.
  const { colors, fs, fw, muted, actionTint } = useIntakeLegibility();
  // Glyph chips scaled through the same pipeline as their glyphs, from the
  // pre-COS-1216 phone sizes — see the note in IntakeCtaCard. `fs(44)` was
  // `fs(24) * 2` = 48, which moved the back button on the phone.
  const backBtn = fs(44); // styles.iconBtn, around an fs(24) glyph
  const groupBadge = fs(36); // styles.groupIconChip, around an fs(18) glyph

  // COS-849 entitlement gates. Hooks, so unconditional and above the early
  // returns for the loading / not-ready states below.
  const canView = useCanRender('patient-intake-report.view');
  const canViewReport = useCanRender('patient-intake-report.view-report');
  const canShareReport = useCanRender('patient-intake-report.share-report');
  const canRegenerateReport = useCanRender('patient-intake-report.regenerate-report');

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
  // patient pick a report group (Demographics / Medical conditions
  // & medications / Vaccines / Lifestyle / Mental health / Social
  // support / Work & finances) or "All sections". The wizard filters
  // questions client-side and preserves the untouched groups' answers
  // across the fresh intake version. Retake=all preserves the
  // pre-existing single-tap flow.
  const [retakeSheetOpen, setRetakeSheetOpen] = useState(false);
  const goRetake = (group?: import('./RetakeSectionSheet').RetakeGroupPick) => {
    setRetakeSheetOpen(false);
    const suffix = group ? `&group=${group}` : '';
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
          {/* COS-1221 — a bare `fontSize: 14`, scaled by nothing. */}
          <Text style={{ marginTop: 12, color: muted, fontSize: fs(14) }}>
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
            size={fs(48)}
            color={muted}
          />
          <Text
            style={{
              marginTop: 12,
              color: colors.text,
              fontSize: fs(15),
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
                fontSize: fs(15),
                fontWeight: fw(600) as TextStyle['fontWeight'],
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
      {canView && (
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
            style={({ pressed }) => [
              styles.iconBtn,
              { width: backBtn, height: backBtn, opacity: pressed ? 0.6 : 1 },
            ]}
          >
            <MaterialIcons
              name="arrow-back"
              size={fs(24)}
              color={colors.text}
            />
          </Pressable>
          <Text
            accessibilityRole="header"
            style={{
              flex: 1,
              textAlign: 'center',
              color: colors.text,
              fontSize: fs(17),
              fontWeight: fw(700) as TextStyle['fontWeight'],
            }}
          >
            Your intake
          </Text>
          {/* Balances the back button, so it tracks the same derived size. */}
          <View style={[styles.iconBtn, { width: backBtn, height: backBtn }]} />
        </View>

        <View style={[styles.metaCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
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
                {completedAt || '—'}
              </Text>
            </View>
            <View style={[styles.metaCell, { alignItems: 'flex-end' }]}>
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
                {answeredCount} of {questions.length}
              </Text>
            </View>
          </View>
        </View>

        {canViewReport && groups.map(group => {
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
                    color: muted,
                    fontSize: fs(13),
                    lineHeight: fs(18),
                  }}
                >
                  {row.label}
                </Text>
              ) : null}
              {row.missing ? (
                <Text
                  style={{
                    marginTop: row.label ? 4 : 0,
                    color: muted,
                    fontSize: fs(15),
                    fontWeight: fw(400) as TextStyle['fontWeight'],
                    lineHeight: fs(22),
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
                    fontSize: fs(15),
                    fontWeight: fw(600) as TextStyle['fontWeight'],
                    lineHeight: fs(22),
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
                <View
                  style={[
                    styles.groupIconChip,
                    {
                      backgroundColor: group.color + '1A',
                      width: groupBadge,
                      height: groupBadge,
                      borderRadius: groupBadge / 2,
                    },
                  ]}
                >
                  <MaterialIcons
                    name={group.icon as keyof typeof MaterialIcons.glyphMap}
                    size={fs(18)}
                    color={group.color}
                  />
                </View>
                <Text
                  style={{
                    color: group.color,
                    fontSize: fs(14),
                    fontWeight: fw(700) as TextStyle['fontWeight'],
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
                          color: muted,
                          fontSize: fs(12),
                          fontWeight: fw(600) as TextStyle['fontWeight'],
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
                          color: muted,
                          fontSize: fs(12),
                          fontWeight: fw(600) as TextStyle['fontWeight'],
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
                const palette = pillPalette(block.interpretation, muted, colors.border);
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
                        fontSize: fs(14),
                        fontWeight: fw(700) as TextStyle['fontWeight'],
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
                          fontSize: fs(11),
                          fontWeight: fw(700) as TextStyle['fontWeight'],
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
                          color: muted,
                          fontSize: fs(12),
                          fontStyle: 'italic',
                          lineHeight: fs(16),
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
              color: muted,
              fontSize: fs(12),
              fontStyle: 'italic',
              lineHeight: fs(17),
              textAlign: 'center',
            }}
          >
            This is a snapshot of your self-reported answers. It is not a medical record and may not include everything your care team knows.
          </Text>
        </View>

        {canShareReport && <ShareIntakeReportSection />}

        {canRegenerateReport && (
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
            size={fs(18)}
            color={actionTint}
          />
          <Text
            style={{
              marginLeft: 8,
              // COS-1223 — tint is an AA fill, not AA text: 4.38:1 on this card.
              color: actionTint,
              fontSize: fs(15),
              fontWeight: fw(600) as TextStyle['fontWeight'],
            }}
          >
            Update my answers
          </Text>
        </Pressable>
        )}

        <RetakeSectionSheet
          visible={retakeSheetOpen}
          onDismiss={() => setRetakeSheetOpen(false)}
          onPick={goRetake}
        />

        <View style={{ height: 40 }} />
      </ScrollView>
      )}
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
    // width/height are set inline — derived from the glyph (>= 44 at scale 1).
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
    // width/height/borderRadius are set inline — derived from the glyph.
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

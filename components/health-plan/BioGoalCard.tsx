/**
 * BioGoalCard (COS-435 experiment #8 · COS-439 polish).
 *
 * Minimal goal card for the Biopsychosocial Care Plan's GOALS group,
 * originally cut down for the iOS 26.5 EXUpdates crash investigation
 * (see project_ios26_biopsychosocial_parked.md). COS-435 proved that
 * primitive-count-per-goal was the trigger; COS-439 adds back a small
 * amount of visual polish (priority pill, subtle elevation, tightened
 * spacing) while staying well below legacy `GoalCard`'s ~25 primitives.
 *
 * Same prop signature as legacy `GoalCard` so the swap in `SectionCard`
 * remains a pure symbol rename.
 *
 * Deliberately still DROPS, relative to legacy `GoalCard`:
 *   - separate priority-tinted left rail child View (we tint borderLeft on
 *     the outer card View instead — one fewer primitive)
 *   - priority dot + flag icon (a decorative duplicate of the priority pill)
 *   - formatGoalPlain's plain-language + progress-percent line
 *   - the progress bar (progressRow/progressTrack/progressFill) + % label
 *   - the trend line (arrow + trendColor)
 *
 * KEEPS: title, description, target+timeframe (via `formatGoalMeasure`),
 * `SubdomainChipRow`, Edit button. NEW in COS-439: priority pill (High/Med/
 * Low badge, colored tint) in the header row + card shadow/elevation for
 * visual weight parity with the rest of the plan screen.
 *
 * Same primitives legacy uses (Text, View, TouchableOpacity, MaterialIcons)
 * — no new packages, no reanimated, no Modal.
 */
import React from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { goalStatusLine } from '@/lib/goal-status';

import { SubdomainChipRow } from './SubdomainChip';
import { formatGoalMeasure } from '@/lib/care-plan';
import type { AiPlanGoal } from '@/services/api/types';
import { Radii, Spacing } from '@/constants/design-system';

type ColorMap = Record<string, string>;

const PRIORITY_STYLE: Record<
  NonNullable<AiPlanGoal['priority']>,
  { label: string; bg: string; fg: string }
> = {
  high: { label: 'HIGH', bg: '#FEE2E2', fg: '#B91C1C' },
  medium: { label: 'MED', bg: '#FEF3C7', fg: '#B45309' },
  low: { label: 'LOW', bg: '#E0E7FF', fg: '#3730A3' },
};

// Matches PlanScreenRedesignedV2.tsx's elevation(1) preset so cards read at
// the same visual weight — subtle shadow on iOS, elevation on Android, no
// new primitives (style-only).
const cardElevation = Platform.select({
  ios: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 5,
  },
  android: { elevation: 2 },
  default: {},
}) as object;

export function BioGoalCard(props: {
  goal: AiPlanGoal;
  accentColor: string;
  colors: ColorMap;
  getScaledFontSize: (n: number) => number;
  getScaledFontWeight: (n: number) => string;
  onEdit: (g: AiPlanGoal) => void;
}) {
  const { goal: g, accentColor, colors, getScaledFontSize, getScaledFontWeight, onEdit } = props;
  const text = colors.text;
  const subtext = colors.subtext;
  const border = colors.border;
  const card = colors.card ?? '#FFFFFF';
  const tint = colors.tint;

  const measure = formatGoalMeasure(g);
  const priorityStyle = g.priority ? PRIORITY_STYLE[g.priority] : null;

  // COS-820 — computed here, rendered below. Null whenever the goal has
  // nothing measurable to report, which is most of them until a plan carries
  // task links or a timeframe with an endpoint.
  const statusLine = goalStatusLine(g);
  const statusTone = statusLine
    ? STATUS_TONE[statusLine.tone]
    : STATUS_TONE.neutral;

  return (
    <View
      style={[
        styles.card,
        cardElevation,
        { backgroundColor: card, borderColor: border, borderLeftColor: accentColor },
      ]}
    >
      <View style={styles.headerRow}>
        <Text
          style={{
            color: text,
            fontSize: getScaledFontSize(17),
            fontWeight: getScaledFontWeight(700) as any,
            lineHeight: 22,
            flex: 1,
          }}
        >
          {g.title}
        </Text>
        {priorityStyle && (
          <View style={[styles.priorityPill, { backgroundColor: priorityStyle.bg }]}>
            <Text
              style={{
                color: priorityStyle.fg,
                fontSize: getScaledFontSize(10),
                fontWeight: getScaledFontWeight(800) as any,
                letterSpacing: 0.5,
              }}
            >
              {priorityStyle.label}
            </Text>
          </View>
        )}
      </View>

      {/*
        COS-820 — the one line that says how this goal is actually going.

        A goal card can now carry a measured metric, how its own tasks went
        this week, and how long is left. Showing all three turns a card into a
        dashboard, so goalStatusLine picks the one that is actionable — overdue
        first, then the work, then the countdown — and returns null when there
        is nothing true to say. An empty string here reads as a loading state
        that never resolves.
      */}
      {statusLine && (
        <View style={[styles.statusRow, { borderColor: statusTone.border, backgroundColor: statusTone.bg }]}>
          <Text
            style={{
              color: statusTone.fg,
              fontSize: getScaledFontSize(12),
              fontWeight: getScaledFontWeight(700) as any,
            }}
          >
            {statusLine.text}
          </Text>
        </View>
      )}

      {!!g.description && (
        <Text
          style={{
            color: subtext,
            fontSize: getScaledFontSize(14),
            lineHeight: 20,
            marginTop: Spacing.sm - 2,
          }}
        >
          {g.description}
        </Text>
      )}

      {!!measure && (
        <Text
          style={{
            color: text,
            fontSize: getScaledFontSize(13),
            fontWeight: getScaledFontWeight(600) as any,
            marginTop: Spacing.sm - 2,
          }}
        >
          {measure}
        </Text>
      )}

      <SubdomainChipRow
        subdomainKeys={g.subdomains}
        colors={colors}
        getScaledFontSize={getScaledFontSize}
      />

      <View style={styles.footer}>
        <TouchableOpacity
          onPress={() => onEdit(g)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`Edit goal: ${g.title}`}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={[styles.editBtn, { borderColor: border }]}
        >
          <MaterialIcons name="edit" size={getScaledFontSize(15)} color={tint} />
          <Text
            style={{
              color: tint,
              fontSize: getScaledFontSize(14),
              fontWeight: getScaledFontWeight(700) as any,
              marginLeft: 5,
            }}
          >
            Edit
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

/**
 * COS-820 — tones for the status line.
 *
 * Deliberately not the wellbeing palette: this says whether the WORK is
 * happening, not whether the patient is well, and borrowing the clinical
 * colours would make a missed week look like a health finding.
 */
const STATUS_TONE = {
  good: { fg: '#0E7490', bg: '#ECFEFF', border: '#A5F3FC' },
  warn: { fg: '#B45309', bg: '#FFFBEB', border: '#FDE68A' },
  bad: { fg: '#B91C1C', bg: '#FEF2F2', border: '#FECACA' },
  neutral: { fg: '#475569', bg: '#F8FAFC', border: '#E2E8F0' },
} as const;

const styles = StyleSheet.create({
  statusRow: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: 8,
  },
  card: {
    borderWidth: 1,
    borderLeftWidth: 4,
    borderRadius: Radii.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm + 2,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  priorityPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radii.full ?? 999,
    marginTop: 2,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: Spacing.sm + 2,
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radii.md,
    borderWidth: 1,
    minHeight: 44,
  },
});

/**
 * SectionCard (COS-360 / SCRUM-518, Phase 3) — renders one
 * `SectionPlan` (Biological / Psychological / Social & Spiritual Wellness)
 * of the biopsychosocial Care Plan.
 *
 * Layout: header (icon + section name + status pill) → trend summary + arrow
 * → three independently-expandable groups (plan bullets, interventions grouped
 * by kind, goals). Goals render via `BioGoalCard` (COS-435, experiment #8) — a
 * minimal, stripped-down goal card for `MeasurableGoal` (a type alias of
 * `AiPlanGoal`), swapped in from the legacy `GoalCard` (still used by
 * `PlanScreenRedesignedV2` itself) as part of the iOS 26.5 EXUpdates crash
 * investigation. Same prop signature — a pure symbol rename, trivially
 * revertible.
 *
 * Presentation-only, no data ownership — follows the same
 * colors/getScaledFontSize/getScaledFontWeight prop pattern as the rest of
 * `components/health-plan/*`.
 */
import React from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { Radii, Spacing } from '@/constants/design-system';
import { BioGoalCard } from './BioGoalCard';
import { TaskListSection } from './tasks/TaskListSection';
import { categoryLabel, groupGoalsByCategory } from '@/lib/care-plan';
import type {
  Intervention,
  InterventionKind,
  MeasurableGoal,
  SectionPlan,
  SectionStatus,
  SectionTrendDirection,
} from '@/services/api/biopsychosocial-plan';
import type { PlanTask } from '@/services/api/types';

export type BiopsychosocialSectionKey = 'biological' | 'psychological' | 'social';

/**
 * CHUNK 49 kill-switch — port of the legacy 8-category goal grouping
 * (Ken's Care Plan taxonomy: medical / cognitive / adl / medication /
 * mentalHealth / integrative / social / spiritual, shipped in
 * PlanScreenRedesigned behind CARE_PLAN_ENABLED) into the BPS surface as
 * a SUB-grouping inside each SectionCard's Goals block. Users get the
 * both-view: BPS framework at the section header, Ken's clinical
 * taxonomy inside. Grouping is presentational only — reuses the pure
 * `groupGoalsByCategory` helper from `lib/care-plan.ts` (already used
 * by legacy V2), so goals missing a `.category` fall into the "Your
 * Goals" bucket at the tail (back-compat with pre-COS-377 plans, older
 * Bedrock outputs, and manually-added goals with no category tag).
 * One-line OTA flip if the sub-grouping regresses in the wild.
 */
const BPS_8_CATEGORY_GROUPING_ENABLED = true;

type ColorMap = Record<string, string>;

export const SECTION_STYLE: Record<
  BiopsychosocialSectionKey,
  { icon: keyof typeof MaterialIcons.glyphMap; color: string }
> = {
  biological: { icon: 'favorite', color: '#3B82F6' },
  psychological: { icon: 'psychology', color: '#8B5CF6' },
  social: { icon: 'groups', color: '#F59E0B' },
};

const STATUS_STYLE: Record<SectionStatus, { label: string; icon: keyof typeof MaterialIcons.glyphMap }> = {
  'on-track': { label: 'On track', icon: 'check-circle' },
  'needs-attention': { label: 'Needs attention', icon: 'error-outline' },
  'just-started': { label: 'Just started', icon: 'hourglass-empty' },
};

const TREND_STYLE: Record<SectionTrendDirection, { symbol: string; label: string }> = {
  improving: { symbol: '↑', label: 'Improving' },
  stable: { symbol: '→', label: 'Stable' },
  declining: { symbol: '↓', label: 'Declining' },
  unknown: { symbol: '', label: '' },
};

const INTERVENTION_ORDER: readonly InterventionKind[] = [
  'intervention',
  'support',
  'recommendation',
  'resource',
];

const INTERVENTION_KIND_LABEL: Record<InterventionKind, string> = {
  intervention: 'Interventions',
  support: 'Supports',
  recommendation: 'Recommendations',
  resource: 'Resources',
};

const INTERVENTION_KIND_ICON: Record<InterventionKind, keyof typeof MaterialIcons.glyphMap> = {
  intervention: 'medical-services',
  support: 'volunteer-activism',
  recommendation: 'lightbulb-outline',
  resource: 'menu-book',
};

/*
 * CHUNK 60 (2026-07-22): teal family for the FOCUS pill. Slightly more
 * saturated than the BpsPlanFocusBanner surface (which is ~8% teal) so
 * the pill reads clearly as a badge without competing with the banner
 * as the primary tap affordance. Kept as local literals so the pill
 * stays readable in isolation and doesn't introduce a new design-system
 * token.
 */
// Chunk 60 adversarial-verify major #2 fix: solid teal pill with white
// ink so the FOCUS badge reads on both light and dark section cards.
// The earlier 15% teal tint on teal-800 ink failed contrast (~1.5:1)
// against colors.card in dark mode. Solid teal-500 background reads
// crisply on any card surface regardless of theme.
const FOCUS_PILL_BG = '#0D9488'; // teal-500 — solid
const FOCUS_PILL_BORDER = '#0D9488'; // matches bg — border is decorative
const FOCUS_PILL_INK = '#FFFFFF'; // white — WCAG AA on teal-500

function alpha(hex: string, hh: string): string {
  return hex.length === 7 ? hex + hh : hex;
}

function trendColor(direction: SectionTrendDirection, colors: ColorMap, fallback: string): string {
  if (direction === 'improving') return colors.success ?? fallback;
  if (direction === 'declining') return colors.error ?? '#DC2626';
  return colors.subtext ?? '#6B7280';
}

const elevation = (level: 1 | 2) =>
  Platform.select({
    ios: {
      shadowColor: '#0F172A',
      shadowOffset: { width: 0, height: level },
      shadowOpacity: 0.04 + level * 0.03,
      shadowRadius: level * 3 + 2,
    },
    android: { elevation: level * 2 },
    default: {},
  }) as object;

export interface SectionCardProps {
  sectionKey: BiopsychosocialSectionKey;
  /** Display title, e.g. "Biological Wellness" / "Social & Spiritual Wellness". */
  title: string;
  section: SectionPlan;
  colors: ColorMap;
  getScaledFontSize: (n: number) => number;
  getScaledFontWeight: (n: number) => string;
  onEditGoal: (g: MeasurableGoal) => void;
  tasks?: PlanTask[];
  onAddTask?: () => void;
  onTaskPress?: (task: PlanTask) => void;
  /**
   * CHUNK 60 (2026-07-22): when true, render a small teal "FOCUS" pill
   * as a dedicated sibling row directly beneath the header. The pill is
   * visual-only (banner owns the tap affordance). Parent computes this
   * from the wellbeing focus signal — see BpsPlanFocusBanner + the
   * BPS_PLAN_FOCUS_SIGNAL_ENABLED kill-switch in BiopsychosocialPlanScreen.
   *
   * When false / omitted the pill is not rendered at all — no wrapper,
   * no reserved height — so a section that isn't the focus target has
   * ZERO visual delta from pre-chunk-60. Only ever true on exactly one
   * of the three SectionCards per render (mapping is injective and
   * focus is a single BpsDomain). Flipping the parent kill-switch to
   * false makes this always-false at the call site, compiling the pill
   * out across all cards in one line.
   */
  isFocus?: boolean;
}

export function SectionCard({
  sectionKey,
  title,
  section,
  colors,
  getScaledFontSize,
  getScaledFontWeight,
  onEditGoal,
  tasks: tasksProp,
  onAddTask,
  onTaskPress,
  isFocus,
}: SectionCardProps) {
  const style = SECTION_STYLE[sectionKey];
  const statusStyle = STATUS_STYLE[section.status] ?? STATUS_STYLE['just-started'];
  const trend = TREND_STYLE[section.trendDirection] ?? TREND_STYLE.unknown;

  /*
   * COS-434 experiment #3: default all three groups CLOSED on first mount.
   * Cuts the initial view-tree size ~3-4x per section, which the July 10
   * forensic (workflow wg1dvszi0) flagged as a candidate iOS 26.5 EXUpdates
   * Class B trigger — "first-paint view-count matters". If crashes stop
   * after this ships, view-tree size at first commit was the pressure.
   */
  const [bulletsOpen, setBulletsOpen] = React.useState(false);
  const [interventionsOpen, setInterventionsOpen] = React.useState(false);
  const [goalsOpen, setGoalsOpen] = React.useState(false);

  const groupedInterventions = React.useMemo(() => {
    const items = Array.isArray(section.interventions) ? section.interventions : [];
    return INTERVENTION_ORDER.map((kind) => ({
      kind,
      items: items.filter((i) => i.kind === kind),
    })).filter((g) => g.items.length > 0);
  }, [section.interventions]);

  /*
   * CHUNK 49: sub-group goals by Ken's 8 Care Plan categories inside
   * the section's Goals block (see BPS_8_CATEGORY_GROUPING_ENABLED at
   * module top). `groupGoalsByCategory` is the same pure helper legacy
   * V2 uses, so goals with no `.category` fall into the "Your Goals"
   * tail bucket — a plan whose goals are ALL uncategorized renders as
   * a single group with the legacy heading, which visually collapses
   * back to the pre-chunk-49 flat list. Computed unconditionally so
   * the hook order stays stable across a flag flip; result is only
   * consumed inside the flag branch.
   */
  const goalGroups = React.useMemo(
    () => groupGoalsByCategory(Array.isArray(section.goals) ? section.goals : []),
    [section.goals],
  );

  const text = colors.text;
  const subtext = colors.subtext;
  const border = colors.border;
  const card = colors.card ?? '#FFFFFF';

  const statusColor =
    section.status === 'needs-attention'
      ? colors.warning ?? '#B45309'
      : section.status === 'on-track'
        ? style.color
        : subtext;

  const bullets = Array.isArray(section.planBullets) ? section.planBullets : [];
  const goals = Array.isArray(section.goals) ? section.goals : [];
  const tasks = Array.isArray(tasksProp) ? tasksProp : [];

  return (
    <View style={[styles.card, elevation(1), { backgroundColor: card, borderColor: border }]}>
      {/* Header — icon + section name + status pill */}
      <View style={styles.headerRow}>
        <View style={[styles.iconChip, { backgroundColor: alpha(style.color, '1A') }]}>
          <MaterialIcons name={style.icon} size={getScaledFontSize(20)} color={style.color} />
        </View>
        <Text
          style={{
            color: text,
            fontSize: getScaledFontSize(19),
            fontWeight: getScaledFontWeight(800) as any,
            flex: 1,
            marginLeft: Spacing.sm + 2,
          }}
          numberOfLines={2}
        >
          {title}
        </Text>
        <View
          style={[styles.statusPill, { backgroundColor: alpha(statusColor, '1F') }]}
          accessibilityRole="text"
          accessibilityLabel={`Status: ${statusStyle.label}`}
        >
          <MaterialIcons name={statusStyle.icon} size={getScaledFontSize(13)} color={statusColor} />
          <Text
            style={{
              color: statusColor,
              fontSize: getScaledFontSize(11),
              fontWeight: getScaledFontWeight(800) as any,
              marginLeft: 4,
            }}
          >
            {statusStyle.label}
          </Text>
        </View>
      </View>

      {/*
        CHUNK 60 (2026-07-22): FOCUS pill — visual anchor that shows the
        user why they landed here after tapping the BpsPlanFocusBanner.
        Rendered as a SIBLING row beneath headerRow (not inside it) so
        the header doesn't crush at large dynamic type on iPhone
        SE-class widths. Returns null when !isFocus (genuinely
        null-when-absent — no wrapper, no reserved height). Pill borrows
        the statusPill visual language for cross-card consistency, but
        uses a teal family (banner primary CTA color) so it reads as a
        "matches the focus above" hint rather than a status change.
        Hard-coded uppercase literal ("FOCUS") avoids iOS 26
        textTransform type-metric edge cases proven fragile elsewhere.
      */}
      {isFocus ? (
        <View
          style={[styles.focusPill, { backgroundColor: FOCUS_PILL_BG, borderColor: FOCUS_PILL_BORDER }]}
          accessible
          accessibilityLabel="Focus area for this week"
        >
          <MaterialIcons name="center-focus-strong" size={12} color={FOCUS_PILL_INK} />
          <Text
            style={{
              color: FOCUS_PILL_INK,
              fontSize: getScaledFontSize(10),
              fontWeight: getScaledFontWeight(700) as any,
              letterSpacing: 0.6,
              marginLeft: 4,
            }}
          >
            FOCUS
          </Text>
        </View>
      ) : null}

      {/* Trend summary + arrow */}
      {!!section.trendSummary && (
        <View style={styles.trendRow}>
          {!!trend.symbol && (
            <Text
              style={{
                color: trendColor(section.trendDirection, colors, style.color),
                fontSize: getScaledFontSize(15),
                fontWeight: getScaledFontWeight(800) as any,
                marginRight: 6,
              }}
              accessibilityLabel={trend.label || undefined}
            >
              {trend.symbol}
            </Text>
          )}
          <Text style={{ color: subtext, fontSize: getScaledFontSize(13), lineHeight: 19, flex: 1 }}>
            {section.trendSummary}
          </Text>
        </View>
      )}

      {/* Plan bullets */}
      {bullets.length > 0 && (
        <CollapsibleGroup
          label="Your plan"
          icon="checklist"
          open={bulletsOpen}
          onToggle={() => setBulletsOpen((v) => !v)}
          colors={colors}
          getScaledFontSize={getScaledFontSize}
          getScaledFontWeight={getScaledFontWeight}
        >
          {bullets.map((b, i) => (
            <View key={i} style={styles.bulletRow}>
              <View style={[styles.bulletDot, { backgroundColor: style.color }]} />
              <Text style={{ color: text, fontSize: getScaledFontSize(14), lineHeight: 20, flex: 1 }}>{b}</Text>
            </View>
          ))}
        </CollapsibleGroup>
      )}

      {/* Interventions — grouped by kind */}
      {groupedInterventions.length > 0 && (
        <CollapsibleGroup
          label="Interventions & resources"
          icon="support-agent"
          open={interventionsOpen}
          onToggle={() => setInterventionsOpen((v) => !v)}
          colors={colors}
          getScaledFontSize={getScaledFontSize}
          getScaledFontWeight={getScaledFontWeight}
        >
          {groupedInterventions.map((group) => (
            <View key={group.kind} style={{ marginBottom: Spacing.sm }}>
              <View style={styles.kindHeaderRow}>
                <MaterialIcons name={INTERVENTION_KIND_ICON[group.kind]} size={getScaledFontSize(13)} color={subtext} />
                <Text
                  style={{
                    color: subtext,
                    fontSize: getScaledFontSize(11),
                    fontWeight: getScaledFontWeight(700) as any,
                    marginLeft: 5,
                    textTransform: 'uppercase',
                    letterSpacing: 0.4,
                  }}
                >
                  {INTERVENTION_KIND_LABEL[group.kind]}
                </Text>
              </View>
              {group.items.map((item) => (
                <InterventionRow
                  key={item.id}
                  item={item}
                  colors={colors}
                  accentColor={style.color}
                  getScaledFontSize={getScaledFontSize}
                  getScaledFontWeight={getScaledFontWeight}
                />
              ))}
            </View>
          ))}
        </CollapsibleGroup>
      )}

      {/* Goals — BioGoalCard (COS-435, experiment #8) */}
      {goals.length > 0 && (
        <CollapsibleGroup
          label="Goals"
          icon="flag"
          open={goalsOpen}
          onToggle={() => setGoalsOpen((v) => !v)}
          colors={colors}
          getScaledFontSize={getScaledFontSize}
          getScaledFontWeight={getScaledFontWeight}
        >
          {BPS_8_CATEGORY_GROUPING_ENABLED && goalGroups.length > 1 ? (
            /*
             * CHUNK 49: BPS × 8-category both-view. Only branch here
             * when there are 2+ groups — a single group (all goals
             * uncategorized, or all in one category) would just render
             * an extra sub-header for no informational gain, so we
             * fall through to the flat list. Sub-headers use the
             * existing kindHeaderRow visual language (small uppercase
             * label + section-accent color) so they read as PART OF
             * the SectionCard, not floating cards.
             */
            goalGroups.map((group) => (
              <View key={group.key} style={{ marginBottom: Spacing.sm }}>
                <View
                  style={[
                    styles.categoryHeaderRow,
                    { backgroundColor: alpha(style.color, '14'), borderColor: alpha(style.color, '2A') },
                  ]}
                >
                  <MaterialIcons name="folder-open" size={getScaledFontSize(13)} color={style.color} />
                  <Text
                    style={{
                      color: style.color,
                      fontSize: getScaledFontSize(11),
                      fontWeight: getScaledFontWeight(800) as any,
                      marginLeft: 5,
                      textTransform: 'uppercase',
                      letterSpacing: 0.4,
                      flex: 1,
                    }}
                    numberOfLines={2}
                  >
                    {group.key === 'general' ? group.label : categoryLabel(group.key)}
                  </Text>
                  <Text
                    style={{
                      color: style.color,
                      fontSize: getScaledFontSize(11),
                      fontWeight: getScaledFontWeight(700) as any,
                      opacity: 0.75,
                    }}
                    accessibilityLabel={`${group.goals.length} goal${group.goals.length === 1 ? '' : 's'}`}
                  >
                    {group.goals.length}
                  </Text>
                </View>
                {group.goals.map((g) => (
                  <BioGoalCard
                    key={g.id}
                    goal={g}
                    accentColor={style.color}
                    colors={colors}
                    getScaledFontSize={getScaledFontSize}
                    getScaledFontWeight={getScaledFontWeight}
                    onEdit={onEditGoal}
                  />
                ))}
              </View>
            ))
          ) : (
            goals.map((g) => (
              <BioGoalCard
                key={g.id}
                goal={g}
                accentColor={style.color}
                colors={colors}
                getScaledFontSize={getScaledFontSize}
                getScaledFontWeight={getScaledFontWeight}
                onEdit={onEditGoal}
              />
            ))
          )}
        </CollapsibleGroup>
      )}

      {onAddTask && onTaskPress && (
        <TaskListSection
          tasks={tasks}
          accentColor={style.color}
          colors={colors}
          getScaledFontSize={getScaledFontSize}
          getScaledFontWeight={getScaledFontWeight}
          onAddTask={onAddTask}
          onTaskPress={onTaskPress}
        />
      )}

      {/*
        COS-440: guidance when the section came back completely empty from
        the AI (0 bullets + 0 interventions + 0 goals — typically means
        Bedrock returned malformed JSON and the normalizer fell back to
        emptySection, or the patient's underlying data was too sparse for
        a useful generation). Without this row the section renders as
        just a header + trendSummary "Not enough data yet" and the user
        has no idea what to do next. Kenneth reported this 2026-07-10.
      */}
      {bullets.length === 0 && groupedInterventions.length === 0 && goals.length === 0 && tasks.length === 0 && (
        <View style={[styles.emptyHint, { borderColor: alpha(style.color, '33'), backgroundColor: alpha(style.color, '10') }]}>
          <MaterialIcons name="lightbulb-outline" size={getScaledFontSize(16)} color={style.color} />
          <Text
            style={{
              color: text,
              fontSize: getScaledFontSize(13),
              lineHeight: 18,
              flex: 1,
              marginLeft: 6,
            }}
          >
            This section will populate once your care team has more data. Tap{' '}
            <Text style={{ fontWeight: getScaledFontWeight(700) as any, color: style.color }}>
              Refresh my plan
            </Text>
            {' '}below to try again, or complete pending assessments in the Assessments tab.
          </Text>
        </View>
      )}
    </View>
  );
}

function CollapsibleGroup({
  label,
  icon,
  open,
  onToggle,
  colors,
  getScaledFontSize,
  getScaledFontWeight,
  children,
}: {
  label: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  open: boolean;
  onToggle: () => void;
  colors: ColorMap;
  getScaledFontSize: (n: number) => number;
  getScaledFontWeight: (n: number) => string;
  children: React.ReactNode;
}) {
  const subtext = colors.subtext;
  const border = colors.border;
  return (
    <View style={[styles.collapsible, { borderTopColor: border }]}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${label}, ${open ? 'expanded' : 'collapsed'}`}
        accessibilityHint="Double tap to toggle this section"
        style={styles.collapsibleHeader}
        hitSlop={6}
      >
        <MaterialIcons name={icon} size={getScaledFontSize(14)} color={subtext} />
        <Text
          style={{
            color: subtext,
            fontSize: getScaledFontSize(11),
            fontWeight: getScaledFontWeight(800) as any,
            marginLeft: 6,
            textTransform: 'uppercase',
            letterSpacing: 0.4,
            flex: 1,
          }}
        >
          {label}
        </Text>
        <MaterialIcons name={open ? 'expand-less' : 'expand-more'} size={getScaledFontSize(20)} color={subtext} />
      </Pressable>
      {open ? <View style={styles.collapsibleBody}>{children}</View> : null}
    </View>
  );
}

function InterventionRow({
  item,
  colors,
  accentColor,
  getScaledFontSize,
  getScaledFontWeight,
}: {
  item: Intervention;
  colors: ColorMap;
  accentColor: string;
  getScaledFontSize: (n: number) => number;
  getScaledFontWeight: (n: number) => string;
}) {
  const text = colors.text;
  const subtext = colors.subtext;
  const border = colors.border;
  const card = colors.card ?? '#FFFFFF';
  const tint = colors.tint;
  const hasLink = !!item.link;

  const openLink = React.useCallback(() => {
    if (item.link) {
      Linking.openURL(item.link).catch(() => {
        /* ignore — a dead link shouldn't crash the plan screen */
      });
    }
  }, [item.link]);

  return (
    <Pressable
      onPress={hasLink ? openLink : undefined}
      disabled={!hasLink}
      accessibilityRole={hasLink ? 'link' : 'text'}
      accessibilityLabel={hasLink ? `${item.title}. Opens a link.` : item.title}
      style={[styles.interventionRow, { backgroundColor: card, borderColor: border }]}
    >
      <View style={[styles.interventionRail, { backgroundColor: accentColor }]} />
      <View style={{ flex: 1, marginLeft: Spacing.sm + 2 }}>
        <Text
          style={{ color: text, fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(700) as any }}
          numberOfLines={2}
        >
          {item.title}
        </Text>
        {!!item.description && (
          <Text style={{ color: subtext, fontSize: getScaledFontSize(13), marginTop: 2, lineHeight: 18 }} numberOfLines={4}>
            {item.description}
          </Text>
        )}
      </View>
      {hasLink && (
        <MaterialIcons name="open-in-new" size={getScaledFontSize(16)} color={tint} style={{ marginLeft: Spacing.sm }} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: Radii.xl,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconChip: {
    width: 40,
    height: 40,
    borderRadius: Radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radii.full,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginLeft: Spacing.sm,
  },
  // CHUNK 60: FOCUS pill sits as a sibling row directly beneath the
  // header. alignSelf:'flex-start' keeps it snug to the left edge so it
  // reads as attached to the section title above; borderRadius:Radii.full
  // + borderWidth:1 mirrors the statusPill visual language so the pill
  // family reads as one system across the card.
  focusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: Radii.full,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 6,
    marginBottom: 4,
  },
  trendRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: Spacing.sm,
  },
  collapsible: {
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: Spacing.md,
    paddingTop: Spacing.sm + 2,
  },
  collapsibleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 32,
  },
  collapsibleBody: {
    marginTop: Spacing.sm,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: Spacing.sm - 2,
  },
  emptyHint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: Spacing.sm + 2,
    borderRadius: Radii.md,
    borderWidth: 1,
    marginTop: Spacing.sm + 2,
  },
  bulletDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 7,
    marginRight: Spacing.sm,
  },
  kindHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  // CHUNK 49: sub-header row for the 8-category goal grouping inside the
  // section's Goals block. Tinted background (section-accent 14 alpha) +
  // hairline border so the header sits within the SectionCard's visual
  // rhythm — not a floating chip and not another card.
  categoryHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radii.sm,
    paddingHorizontal: 8,
    paddingVertical: 5,
    marginBottom: 8,
  },
  interventionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: Radii.md,
    padding: Spacing.sm + 2,
    marginBottom: Spacing.sm - 2,
  },
  interventionRail: {
    width: 4,
    alignSelf: 'stretch',
    borderRadius: 2,
  },
});

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
          {goals.map((g) => (
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

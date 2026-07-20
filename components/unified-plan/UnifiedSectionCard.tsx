/**
 * UnifiedSectionCard (COS-467, Phase 2) — one BPS section as a stack of
 * collapsible groups: plan bullets, category status, goals, tasks,
 * interventions. Presentation-only; data comes from `useUnifiedPlan`.
 *
 * Design decisions match the design spec:
 *   - "Your plan" defaults OPEN; every other group defaults CLOSED
 *     (keeps first-paint view-tree small, aligns with the iOS 26.5
 *     experiment on health-plan/SectionCard).
 *   - Empty planBullets renders a deep-link CTA to the matching
 *     assessment via `assessmentHrefForSection`.
 *   - Every non-BPS-native goal/task carries a ProvenanceChip.
 */

import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View, type TextStyle } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { Radii, Spacing } from '@/constants/design-system';
import { formatRelative } from '@/lib/plan-time';
import type {
  SectionStatus,
  SectionTrendDirection,
  UnifiedPlanSection,
  UnifiedSectionKey,
} from '@/services/api/unified-plan';

import { UNIFIED_SECTION_META } from './section-labels';
import { UnifiedGoalRow } from './UnifiedGoalRow';
import { UnifiedTaskList } from './UnifiedTaskList';
import { UnifiedInterventionRow } from './UnifiedInterventionRow';
import { CollapsibleGroup } from './CollapsibleGroup';

type ColorMap = Record<string, string | undefined>;

export interface UnifiedSectionCardProps {
  sectionKey: UnifiedSectionKey;
  section: UnifiedPlanSection;
  colors: ColorMap;
  getScaledFontSize: (n: number) => number;
  getScaledFontWeight: (n: number) => string;
  onEmptyAssessmentPress: (sectionKey: UnifiedSectionKey) => void;
}

const STATUS_STYLE: Record<
  SectionStatus,
  { label: string; icon: keyof typeof MaterialIcons.glyphMap }
> = {
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

function alpha(hex: string, hh: string): string {
  return hex.length === 7 && hex.startsWith('#') ? hex + hh : hex;
}

function trendColor(
  direction: SectionTrendDirection | undefined,
  colors: ColorMap,
  fallback: string,
): string {
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

export function UnifiedSectionCard({
  sectionKey,
  section,
  colors,
  getScaledFontSize,
  getScaledFontWeight,
  onEmptyAssessmentPress,
}: UnifiedSectionCardProps): React.JSX.Element {
  const meta = UNIFIED_SECTION_META[sectionKey];
  const statusStyle =
    (section.status && STATUS_STYLE[section.status]) ?? STATUS_STYLE['just-started'];
  const trend = (section.trendDirection && TREND_STYLE[section.trendDirection]) ??
    TREND_STYLE.unknown;

  const [bulletsOpen, setBulletsOpen] = React.useState(true);
  const [categoryOpen, setCategoryOpen] = React.useState(false);
  const [goalsOpen, setGoalsOpen] = React.useState(false);
  const [interventionsOpen, setInterventionsOpen] = React.useState(false);

  const text = colors.text ?? '#111827';
  const subtext = colors.subtext ?? '#6B7280';
  const border = colors.border ?? '#D1D5DB';
  const card = colors.card ?? '#FFFFFF';

  const statusColor =
    section.status === 'needs-attention'
      ? colors.warning ?? '#B45309'
      : section.status === 'on-track'
        ? meta.color
        : subtext;

  const bullets = Array.isArray(section.planBullets) ? section.planBullets : [];
  const goals = Array.isArray(section.goals) ? section.goals : [];
  const tasks = Array.isArray(section.tasks) ? section.tasks : [];
  const interventions = Array.isArray(section.interventions) ? section.interventions : [];
  const categoryItems = Array.isArray(section.categoryStatusItems)
    ? section.categoryStatusItems
    : [];

  return (
    <View style={[styles.card, elevation(1), { backgroundColor: card, borderColor: border }]}>
      {/* Header */}
      <View style={styles.headerRow}>
        <View style={[styles.iconChip, { backgroundColor: alpha(meta.color, '1A') }]}>
          <MaterialIcons
            name={meta.icon as keyof typeof MaterialIcons.glyphMap}
            size={getScaledFontSize(20)}
            color={meta.color}
          />
        </View>
        <Text
          style={{
            color: text,
            fontSize: getScaledFontSize(19),
            fontWeight: getScaledFontWeight(800) as TextStyle['fontWeight'],
            flex: 1,
            marginLeft: Spacing.sm + 2,
          }}
          numberOfLines={2}
        >
          {meta.title}
        </Text>
        {section.status && (
          <View
            style={[styles.statusPill, { backgroundColor: alpha(statusColor, '1F') }]}
            accessibilityRole="text"
            accessibilityLabel={`Status: ${statusStyle.label}`}
          >
            <MaterialIcons
              name={statusStyle.icon}
              size={getScaledFontSize(13)}
              color={statusColor}
            />
            <Text
              style={{
                color: statusColor,
                fontSize: getScaledFontSize(11),
                fontWeight: getScaledFontWeight(800) as TextStyle['fontWeight'],
                marginLeft: 4,
              }}
            >
              {statusStyle.label}
            </Text>
          </View>
        )}
      </View>

      {/* Trend */}
      {!!section.trendSummary && (
        <View style={styles.trendRow}>
          {!!trend.symbol && (
            <Text
              style={{
                color: trendColor(section.trendDirection, colors, meta.color),
                fontSize: getScaledFontSize(15),
                fontWeight: getScaledFontWeight(800) as TextStyle['fontWeight'],
                marginRight: 6,
              }}
              accessibilityLabel={trend.label || undefined}
            >
              {trend.symbol}
            </Text>
          )}
          <Text
            style={{ color: subtext, fontSize: getScaledFontSize(13), lineHeight: 19, flex: 1 }}
          >
            {section.trendSummary}
          </Text>
        </View>
      )}

      {/* Per-section "Updated…" — sits just below trend so the freshness
          hint is anchored to the section it describes, not just the
          screen-level meta strip. */}
      {section.lastUpdated ? (
        <Text
          style={{
            color: subtext,
            fontSize: getScaledFontSize(11),
            marginTop: 4,
          }}
        >
          Updated {formatRelative(section.lastUpdated)}
        </Text>
      ) : null}

      {/* Your plan */}
      <CollapsibleGroup
        label="Your plan"
        icon="checklist"
        open={bulletsOpen}
        onToggle={() => setBulletsOpen((v) => !v)}
        colors={colors}
        getScaledFontSize={getScaledFontSize}
        getScaledFontWeight={getScaledFontWeight}
      >
        {bullets.length > 0 ? (
          bullets.map((b, i) => (
            <View key={i} style={styles.bulletRow}>
              <View style={[styles.bulletDot, { backgroundColor: meta.color }]} />
              <Text
                style={{
                  color: text,
                  fontSize: getScaledFontSize(14),
                  lineHeight: 20,
                  flex: 1,
                }}
              >
                {b}
              </Text>
            </View>
          ))
        ) : (
          <Pressable
            onPress={() => onEmptyAssessmentPress(sectionKey)}
            accessibilityRole="button"
            accessibilityLabel={`Take the ${meta.shortLabel} assessment`}
            style={[
              styles.emptyCta,
              {
                borderColor: alpha(meta.color, '55'),
                backgroundColor: alpha(meta.color, '10'),
              },
            ]}
          >
            <MaterialIcons
              name="assignment"
              size={getScaledFontSize(16)}
              color={meta.color}
            />
            <Text
              style={{
                color: meta.color,
                fontSize: getScaledFontSize(13),
                fontWeight: getScaledFontWeight(700) as TextStyle['fontWeight'],
                marginLeft: 6,
                flex: 1,
              }}
            >
              Take the {meta.shortLabel} assessment
            </Text>
            <MaterialIcons
              name="chevron-right"
              size={getScaledFontSize(18)}
              color={meta.color}
            />
          </Pressable>
        )}
      </CollapsibleGroup>

      {/* Status & category items */}
      {categoryItems.length > 0 && (
        <CollapsibleGroup
          label="Status & trend"
          icon="insights"
          open={categoryOpen}
          onToggle={() => setCategoryOpen((v) => !v)}
          colors={colors}
          getScaledFontSize={getScaledFontSize}
          getScaledFontWeight={getScaledFontWeight}
        >
          {categoryItems.map((item) => {
            const itemStatusStyle = item.status ? STATUS_STYLE[item.status] : null;
            const itemStatusColor = item.status === 'needs-attention'
              ? colors.warning ?? '#B45309'
              : item.status === 'on-track'
                ? meta.color
                : subtext;
            return (
              <View key={item.id} style={styles.categoryRow}>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      color: text,
                      fontSize: getScaledFontSize(13),
                      fontWeight: getScaledFontWeight(600) as TextStyle['fontWeight'],
                    }}
                    numberOfLines={2}
                  >
                    {item.label}
                  </Text>
                  {!!item.subLabel && (
                    <Text
                      style={{
                        color: subtext,
                        fontSize: getScaledFontSize(11),
                        marginTop: 1,
                      }}
                      numberOfLines={2}
                    >
                      {item.subLabel}
                    </Text>
                  )}
                </View>
                {itemStatusStyle && (
                  <View
                    style={[
                      styles.categoryChip,
                      { backgroundColor: alpha(itemStatusColor, '1F') },
                    ]}
                  >
                    <MaterialIcons
                      name={itemStatusStyle.icon}
                      size={getScaledFontSize(11)}
                      color={itemStatusColor}
                    />
                    <Text
                      style={{
                        color: itemStatusColor,
                        fontSize: getScaledFontSize(10),
                        fontWeight: getScaledFontWeight(700) as TextStyle['fontWeight'],
                        marginLeft: 3,
                        textTransform: 'uppercase',
                      }}
                    >
                      {itemStatusStyle.label}
                    </Text>
                  </View>
                )}
              </View>
            );
          })}
        </CollapsibleGroup>
      )}

      {/* Goals */}
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
            <UnifiedGoalRow
              key={g.id}
              goal={g}
              accentColor={meta.color}
              colors={colors}
              getScaledFontSize={getScaledFontSize}
              getScaledFontWeight={getScaledFontWeight}
            />
          ))}
        </CollapsibleGroup>
      )}

      {/* Tasks */}
      {tasks.length > 0 && (
        <UnifiedTaskList
          tasks={tasks}
          accentColor={meta.color}
          colors={colors}
          getScaledFontSize={getScaledFontSize}
          getScaledFontWeight={getScaledFontWeight}
        />
      )}

      {/* Interventions */}
      {interventions.length > 0 && (
        <CollapsibleGroup
          label="Interventions & resources"
          icon="support-agent"
          open={interventionsOpen}
          onToggle={() => setInterventionsOpen((v) => !v)}
          colors={colors}
          getScaledFontSize={getScaledFontSize}
          getScaledFontWeight={getScaledFontWeight}
        >
          {interventions.map((item) => (
            <UnifiedInterventionRow
              key={item.id}
              item={item}
              accentColor={meta.color}
              colors={colors}
              getScaledFontSize={getScaledFontSize}
              getScaledFontWeight={getScaledFontWeight}
            />
          ))}
        </CollapsibleGroup>
      )}
    </View>
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
  bulletDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 7,
    marginRight: Spacing.sm,
  },
  emptyCta: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.sm + 2,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm - 2,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radii.full,
    paddingHorizontal: 6,
    paddingVertical: 3,
    marginLeft: Spacing.sm,
  },
});

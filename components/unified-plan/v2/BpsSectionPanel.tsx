/**
 * BpsSectionPanel (COS-475, Phase 6.4).
 *
 * One BPS section rendered as an accordion panel. Header shows the icon
 * chip + title + status pill + chevron; body (when expanded) contains
 * the existing "Your plan" bullets group plus new TasksBucket +
 * RoutinesBucket + existing Goals + Interventions groups.
 *
 * Reuses UNIFIED_SECTION_META + STATUS_STYLE conventions from the
 * v1 UnifiedSectionCard to guarantee visual parity.
 */

import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View, type TextStyle } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { Radii, Spacing } from '@/constants/design-system';
import type { BpsDomain, RoutineRow } from '@/services/api/types';
import type {
  SectionStatus,
  UnifiedPlanSection,
  UnifiedSectionKey,
} from '@/services/api/unified-plan';

import { UNIFIED_SECTION_META } from '../section-labels';
import { UnifiedGoalRow } from '../UnifiedGoalRow';
import { UnifiedInterventionRow } from '../UnifiedInterventionRow';
import { CollapsibleGroup } from '../CollapsibleGroup';
import { sectionKeyToPrimaryDomain } from '@/lib/plan-v2/section-config';

import { TasksBucket } from './TasksBucket';
import { RoutinesBucket } from './RoutinesBucket';

type ColorMap = Record<string, string | undefined>;

const STATUS_STYLE: Record<
  SectionStatus,
  { label: string; icon: keyof typeof MaterialIcons.glyphMap }
> = {
  'on-track': { label: 'On track', icon: 'check-circle' },
  'needs-attention': { label: 'Needs attention', icon: 'error-outline' },
  'just-started': { label: 'Just started', icon: 'hourglass-empty' },
};

function alpha(hex: string, hh: string): string {
  return hex.length === 7 && hex.startsWith('#') ? hex + hh : hex;
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

export interface BpsSectionPanelProps {
  sectionKey: UnifiedSectionKey;
  section: UnifiedPlanSection;
  routines: RoutineRow[];
  expanded: boolean;
  onToggle: () => void;
  scheduledFor: string;
  offline: boolean;
  hideReadings: boolean;
  onToggleHideReadings: (next: boolean) => void;
  highlighted?: boolean;
  colors: ColorMap;
  getScaledFontSize: (n: number) => number;
  getScaledFontWeight: (n: number) => string;
  onToast?: (message: string) => void;
  onRefetch?: () => void;
}

export function BpsSectionPanel(props: BpsSectionPanelProps): React.JSX.Element {
  const {
    sectionKey,
    section,
    routines,
    expanded,
    onToggle,
    scheduledFor,
    offline,
    hideReadings,
    onToggleHideReadings,
    highlighted,
    colors,
    getScaledFontSize,
    getScaledFontWeight,
    onToast,
    onRefetch,
  } = props;

  const meta = UNIFIED_SECTION_META[sectionKey];
  const bpsDomain: BpsDomain = sectionKeyToPrimaryDomain(sectionKey);
  const statusStyle = section.status ? STATUS_STYLE[section.status] : STATUS_STYLE['just-started'];

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

  const [bulletsOpen, setBulletsOpen] = React.useState(true);
  const [goalsOpen, setGoalsOpen] = React.useState(false);
  const [interventionsOpen, setInterventionsOpen] = React.useState(false);

  return (
    <View
      style={[
        styles.card,
        elevation(1),
        {
          backgroundColor: card,
          borderColor: highlighted ? meta.color : border,
          borderWidth: highlighted ? 2 : 1,
        },
      ]}
      accessibilityLabel={`${meta.title} section`}
    >
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${meta.title}, ${expanded ? 'expanded' : 'collapsed'}`}
        style={styles.headerRow}
        testID={`plan-v2-section-header-${sectionKey}`}
      >
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
            fontSize: getScaledFontSize(17),
            fontWeight: getScaledFontWeight(800) as TextStyle['fontWeight'],
            flex: 1,
            marginLeft: Spacing.sm + 2,
          }}
          numberOfLines={2}
        >
          {meta.title}
        </Text>
        {section.status ? (
          <View
            style={[styles.statusPill, { backgroundColor: alpha(statusColor, '1F') }]}
            accessibilityRole="text"
            accessibilityLabel={`Status: ${statusStyle.label}`}
          >
            <MaterialIcons
              name={statusStyle.icon}
              size={getScaledFontSize(12)}
              color={statusColor}
            />
            <Text
              style={{
                color: statusColor,
                fontSize: getScaledFontSize(10),
                fontWeight: getScaledFontWeight(800) as TextStyle['fontWeight'],
                marginLeft: 3,
              }}
            >
              {statusStyle.label}
            </Text>
          </View>
        ) : null}
        <MaterialIcons
          name={expanded ? 'expand-less' : 'expand-more'}
          size={getScaledFontSize(22)}
          color={subtext}
        />
      </Pressable>

      {expanded ? (
        <View>
          {!!section.trendSummary && (
            <Text
              style={{
                color: subtext,
                fontSize: getScaledFontSize(12),
                marginTop: 6,
                lineHeight: 17,
              }}
            >
              {section.trendSummary}
            </Text>
          )}

          {/* Your plan bullets */}
          <CollapsibleGroup
            label="Your plan"
            icon="checklist"
            open={bulletsOpen}
            onToggle={() => setBulletsOpen((v) => !v)}
            colors={colors}
            getScaledFontSize={getScaledFontSize}
            getScaledFontWeight={getScaledFontWeight}
            count={bullets.length}
          >
            {bullets.length > 0 ? (
              bullets.map((b, i) => (
                <View key={i} style={styles.bulletRow}>
                  <View style={[styles.bulletDot, { backgroundColor: meta.color }]} />
                  <Text
                    style={{
                      color: text,
                      fontSize: getScaledFontSize(13),
                      lineHeight: 19,
                      flex: 1,
                    }}
                  >
                    {b}
                  </Text>
                </View>
              ))
            ) : (
              <Text
                style={{
                  color: subtext,
                  fontSize: getScaledFontSize(12),
                  lineHeight: 17,
                }}
              >
                Take the {meta.shortLabel} assessment to see your plan bullets.
              </Text>
            )}
          </CollapsibleGroup>

          {/* New buckets: Tasks + Routines */}
          <TasksBucket
            tasks={tasks}
            scheduledFor={scheduledFor}
            accentColor={meta.color}
            offline={offline}
            hideReadings={hideReadings}
            colors={colors}
            getScaledFontSize={getScaledFontSize}
            getScaledFontWeight={getScaledFontWeight}
            onToast={onToast}
            onRefetch={onRefetch}
          />

          <RoutinesBucket
            bpsDomain={bpsDomain}
            routines={routines}
            accentColor={meta.color}
            offline={offline}
            hideReadings={hideReadings}
            onToggleHideReadings={onToggleHideReadings}
            colors={colors}
            getScaledFontSize={getScaledFontSize}
            getScaledFontWeight={getScaledFontWeight}
            onToast={onToast}
            onRefetch={onRefetch}
          />

          {/* Goals */}
          {goals.length > 0 ? (
            <CollapsibleGroup
              label="Goals"
              icon="flag"
              open={goalsOpen}
              onToggle={() => setGoalsOpen((v) => !v)}
              colors={colors}
              getScaledFontSize={getScaledFontSize}
              getScaledFontWeight={getScaledFontWeight}
              count={goals.length}
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
          ) : null}

          {/* Interventions */}
          {interventions.length > 0 ? (
            <CollapsibleGroup
              label="Interventions & resources"
              icon="support-agent"
              open={interventionsOpen}
              onToggle={() => setInterventionsOpen((v) => !v)}
              colors={colors}
              getScaledFontSize={getScaledFontSize}
              getScaledFontWeight={getScaledFontWeight}
              count={interventions.length}
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
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
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
    paddingVertical: 3,
    marginRight: Spacing.sm,
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
});

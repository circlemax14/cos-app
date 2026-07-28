import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  type TextStyle,
} from 'react-native';
import { useRouter } from 'expo-router';
import SummaryCardShell from './SummaryCardShell';
import EmptyStateHint from './EmptyStateHint';
import { useConditionList } from './CurrentConditionsSection';
import { useBiopsychosocialPlan } from '@/hooks/use-biopsychosocial-plan';
import type {
  Intervention,
  InterventionKind,
  SectionPlan,
} from '@/services/api/biopsychosocial-plan';
import { Colors } from '@/constants/theme';
import { Spacing, Radii } from '@/constants/design-system';
import { useAccessibility } from '@/stores/accessibility-store';

// BPS domain palette — kept in lock-step with BpsHistorySection so both
// sections read as the same visual language. Social intentionally carries
// spiritual content per BiopsychosocialPlanSections (no 4th bucket).
const DOMAINS = [
  { key: 'biological', label: 'Biological', color: '#199C4F' },
  { key: 'psychological', label: 'Psychological', color: '#7B3FE4' },
  { key: 'social', label: 'Social & Faith', color: '#C97600' },
] as const;

const KIND_LABELS: Record<InterventionKind, string> = {
  intervention: 'Treatments',
  support: 'Supports',
  recommendation: 'Recommendations',
  resource: 'Resources',
};

// Stable render order — keeps groups predictable across regenerations so
// the layout doesn't shuffle when new interventions land.
const KIND_ORDER: InterventionKind[] = [
  'intervention',
  'support',
  'recommendation',
  'resource',
];

const ACCENT = '#199C4F';

// Care Plan route — plan.tsx IS Health Summary, so we deep-link to the
// canonical Care Plan surface. Both /Home/health-plan and
// /Home/biopsychosocial-plan exist; health-plan is the user-facing entry.
const CARE_PLAN_ROUTE = '/Home/health-plan';

// Per Ken (2026-07-14): treatments should be "keyed to each BPS condition",
// not just to the BPS domain. We do a keyword-heuristic match on intervention
// text (title + description) — same shape as CONDITION_LAB_KEYWORDS used by
// the labs section. Case-insensitive; the condition NAME itself is always
// implicitly included as a keyword by matchesCondition().
const CONDITION_INTERVENTION_KEYWORDS: Record<string, string[]> = {
  diabetes: ['glucose', 'insulin', 'a1c', 'sugar', 'diet', 'exercise', 'metformin', 'carb'],
  hypertension: ['blood pressure', 'bp', 'sodium', 'dash', 'exercise', 'lisinopril', 'amlodipine'],
  cholesterol: ['lipid', 'ldl', 'statin', 'saturated fat', 'exercise'],
  anxiety: ['therapy', 'cbt', 'mindfulness', 'ssri', 'meditation', 'sleep'],
  depression: ['therapy', 'cbt', 'mindfulness', 'ssri', 'meditation', 'sleep'],
  sleep: ['sleep hygiene', 'melatonin', 'cpap', 'wind-down'],
  loneliness: ['group', 'community', 'family', 'connect', 'church', 'volunteer'],
  social: ['group', 'community', 'family', 'connect', 'church', 'volunteer'],
};

// Resolve the keyword bucket for a given condition string. We look for the
// bucket key as a substring so "Type 2 diabetes mellitus" still matches the
// "diabetes" bucket. Returns [] when no bucket matches — matchesCondition()
// then falls back to the condition name itself.
function keywordsFor(condition: string): string[] {
  const c = condition.toLowerCase();
  for (const [key, kws] of Object.entries(CONDITION_INTERVENTION_KEYWORDS)) {
    if (c.includes(key)) return kws;
  }
  return [];
}

function interventionText(iv: Intervention): string {
  // description may be optional depending on backend shape — coerce safely.
  const desc = (iv as { description?: string }).description ?? '';
  return `${iv.title ?? ''} ${desc}`.toLowerCase();
}

function matchesCondition(iv: Intervention, condition: string): boolean {
  const text = interventionText(iv);
  const c = condition.toLowerCase().trim();
  if (c && text.includes(c)) return true;
  const kws = keywordsFor(condition);
  return kws.some(k => text.includes(k));
}

type BpsDomainKey = (typeof DOMAINS)[number]['key'];

function emptyGroups(): Record<InterventionKind, Intervention[]> {
  return { intervention: [], support: [], recommendation: [], resource: [] };
}

function groupByKind(items: Intervention[]): Record<InterventionKind, Intervention[]> {
  const groups = emptyGroups();
  items.forEach(iv => {
    // Defensive: unknown kinds from the BE shouldn't crash the card.
    if (groups[iv.kind]) groups[iv.kind].push(iv);
  });
  return groups;
}

function TreatmentsSupportsSection() {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  const router = useRouter();
  const { data, isLoading, isError } = useBiopsychosocialPlan();
  const { conditions } = useConditionList();
  const plan = data?.plan;
  const generating = data?.generating ?? false;

  // Flag-off, unauthenticated, or 404 → plan is null. Treat as empty and
  // funnel the user to intake / Care Plan. Loading/generating gets its
  // own copy so the empty branch doesn't misleadingly say "complete intake".
  const isEmpty = !plan;

  const emptyText = isLoading
    ? 'Loading your personalized treatments and supports…'
    : generating
      ? 'Generating your personalized treatments and supports…'
      : isError
        ? 'Treatments are temporarily unavailable. Try again in a moment.'
        : 'Complete your intake and generate your Care Plan to see personalized treatments, supports, and resources keyed to each condition.';

  const goToCarePlan = () => {
    // Cast: expo-router's typed routes don't know about dynamic strings.
    router.push(CARE_PLAN_ROUTE as never);
  };

  return (
    <SummaryCardShell
      title="Treatments, supports & resources"
      icon="volunteer-activism"
      accentColor={ACCENT}
      preview={plan ? 'Personalized for you' : undefined}
      isEmpty={isEmpty}
      emptyState={
        <View style={styles.emptyStack}>
          <EmptyStateHint text={emptyText} />
          <Pressable
            onPress={goToCarePlan}
            style={[styles.cta, { borderColor: colors.tint }]}
            accessibilityRole="button"
            accessibilityLabel="Go to Care Plan"
            hitSlop={8}
            testID="treatments-supports-cta-empty"
          >
            <Text
              style={{
                color: colors.tint,
                fontSize: getScaledFontSize(14),
                fontWeight: getScaledFontWeight(700) as TextStyle['fontWeight'],
              }}
            >
              Go to Care Plan
            </Text>
          </Pressable>
        </View>
      }
      testID="health-summary-treatments-supports"
    >
      <View style={styles.list}>
        {DOMAINS.map(d => (
          <DomainBlock
            key={d.key}
            domainKey={d.key}
            label={d.label}
            color={d.color}
            plan={plan?.sections?.[d.key]}
            conditions={conditions}
            colors={colors}
            getScaledFontSize={getScaledFontSize}
            getScaledFontWeight={getScaledFontWeight}
          />
        ))}
        <Pressable
          onPress={goToCarePlan}
          style={[styles.cta, { borderColor: colors.tint }]}
          accessibilityRole="button"
          accessibilityLabel="See full Care Plan"
          hitSlop={8}
          testID="treatments-supports-cta"
        >
          <Text
            style={{
              color: colors.tint,
              fontSize: getScaledFontSize(14),
              fontWeight: getScaledFontWeight(700) as TextStyle['fontWeight'],
            }}
          >
            See full Care Plan
          </Text>
        </Pressable>
      </View>
    </SummaryCardShell>
  );
}

type DomainBlockProps = {
  domainKey: BpsDomainKey;
  label: string;
  color: string;
  plan: SectionPlan | undefined;
  conditions: string[];
  colors: (typeof Colors)['light'];
  getScaledFontSize: (n: number) => number;
  getScaledFontWeight: (n: number) => string;
};

function DomainBlock({
  domainKey,
  label,
  color,
  plan,
  conditions,
  colors,
  getScaledFontSize,
  getScaledFontWeight,
}: DomainBlockProps) {
  // Partition this domain's interventions by condition. An intervention can
  // match multiple conditions (e.g. "exercise" hits Diabetes + Hypertension);
  // we surface it under each. Anything unmatched drops into the "Other" bucket
  // at the bottom so nothing is silently dropped.
  const { perCondition, others } = useMemo(() => {
    const items = plan?.interventions ?? [];
    const matchedIds = new Set<string>();
    const buckets: { condition: string; items: Intervention[] }[] = [];

    conditions.forEach(cond => {
      const matched = items.filter(iv => matchesCondition(iv, cond));
      if (matched.length > 0) {
        matched.forEach(iv => matchedIds.add(iv.id));
        buckets.push({ condition: cond, items: matched });
      }
    });

    const unmatched = items.filter(iv => !matchedIds.has(iv.id));
    return { perCondition: buckets, others: unmatched };
  }, [plan, conditions]);

  const anything = perCondition.length > 0 || others.length > 0;

  return (
    <View
      style={[
        styles.domain,
        { backgroundColor: `${color}0D`, borderColor: `${color}33` },
      ]}
      accessibilityLabel={`${label} treatments and supports`}
      testID={`treatments-supports-domain-${domainKey}`}
    >
      <Text
        style={{
          color,
          fontSize: getScaledFontSize(13),
          fontWeight: getScaledFontWeight(700) as TextStyle['fontWeight'],
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          marginBottom: 6,
        }}
      >
        {label}
      </Text>

      {!anything ? (
        <EmptyStateHint text="No items yet in this area." />
      ) : (
        <View style={styles.conditionStack}>
          {perCondition.map(({ condition, items }) => (
            <ConditionBucket
              key={condition}
              title={condition}
              items={items}
              color={color}
              colors={colors}
              getScaledFontSize={getScaledFontSize}
              getScaledFontWeight={getScaledFontWeight}
            />
          ))}
          {others.length > 0 && (
            <ConditionBucket
              key="__other__"
              title="Other BPS interventions"
              items={others}
              color={color}
              colors={colors}
              getScaledFontSize={getScaledFontSize}
              getScaledFontWeight={getScaledFontWeight}
              isOther
            />
          )}
        </View>
      )}
    </View>
  );
}

type ConditionBucketProps = {
  title: string;
  items: Intervention[];
  color: string;
  colors: (typeof Colors)['light'];
  getScaledFontSize: (n: number) => number;
  getScaledFontWeight: (n: number) => string;
  isOther?: boolean;
};

function ConditionBucket({
  title,
  items,
  color,
  colors,
  getScaledFontSize,
  getScaledFontWeight,
  isOther = false,
}: ConditionBucketProps) {
  const groups = groupByKind(items);
  const populatedKinds = KIND_ORDER.filter(k => groups[k].length > 0);

  return (
    <View style={styles.conditionCard}>
      <Text
        style={{
          color: isOther ? colors.subtext : colors.text,
          fontSize: getScaledFontSize(14),
          fontWeight: getScaledFontWeight(700) as TextStyle['fontWeight'],
          fontStyle: isOther ? 'italic' : 'normal',
          marginBottom: 4,
        }}
        accessibilityRole="header"
      >
        {title}
      </Text>
      {populatedKinds.map(k => (
        <View key={k} style={styles.group}>
          <Text
            style={{
              color: colors.subtext,
              fontSize: getScaledFontSize(11),
              fontWeight: getScaledFontWeight(700) as TextStyle['fontWeight'],
              textTransform: 'uppercase',
              letterSpacing: 0.4,
              marginBottom: 2,
            }}
          >
            {KIND_LABELS[k]}
          </Text>
          {groups[k].map(iv => (
            <View key={iv.id} style={styles.row}>
              <Text
                style={{ color, fontSize: getScaledFontSize(15) }}
                accessibilityElementsHidden
                importantForAccessibility="no"
              >
                •
              </Text>
              <Text
                style={{
                  color: colors.text,
                  fontSize: getScaledFontSize(15),
                  lineHeight: 22,
                  flex: 1,
                }}
              >
                {iv.title}
              </Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: Spacing.md },
  emptyStack: { gap: Spacing.sm, alignItems: 'flex-start' },
  domain: {
    padding: Spacing.sm + 4,
    borderRadius: Radii.md,
    borderWidth: 1,
  },
  conditionStack: { gap: Spacing.sm },
  conditionCard: {
    paddingVertical: 4,
  },
  group: { marginTop: 6 },
  row: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  cta: {
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radii.full,
    borderWidth: 1,
  },
});

export default TreatmentsSupportsSection;

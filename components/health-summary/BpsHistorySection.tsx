import React from 'react';
import { View, Text, StyleSheet, TextStyle } from 'react-native';
import SummaryCardShell from './SummaryCardShell';
import EmptyStateHint from './EmptyStateHint';
import { useBiopsychosocialPlan } from '@/hooks/use-biopsychosocial-plan';
import { Colors } from '@/constants/theme';
import { Spacing, Radii } from '@/constants/design-system';
import { useAccessibility } from '@/stores/accessibility-store';

/**
 * Section 2/9 of the redesigned Health Summary. Renders the Biopsychosocial
 * history narrative (`planBullets`) as three color-coded inline sub-cards —
 * Biological / Psychological / Social & Spiritual — inside a single
 * SummaryCardShell. Social intentionally carries the spiritual content per
 * the v2 BPS model (see project_scrum_577_biopsychosocial.md).
 *
 * Handles three empty branches:
 *  - loading  → shell empty state, "Generating your biopsychosocial history…"
 *  - flag off / no plan yet → shell empty state pointing to intake
 *    (BIOPSYCHOSOCIAL_PLAN_ENABLED defaults OFF; also linked to the iOS 26.5
 *    crash mitigation in project_ios26_biopsychosocial_parked.md — this
 *    component MUST render safely when `plan == null`)
 *  - plan present but one domain has no bullets → per-sub-card muted hint
 */

// Domain palette per the HS-2 brief: bio green, psy purple, soc amber.
// 7-char hex only — the alpha suffixes below (`0D`, `33`) assume 6 hex digits
// after the leading `#`, and any 3-char shorthand would produce invalid colors.
const DOMAINS = [
  { key: 'biological', label: 'Biological', color: '#199C4F' },
  { key: 'psychological', label: 'Psychological', color: '#7B3FE4' },
  { key: 'social', label: 'Social & Spiritual', color: '#C97600' },
] as const;

function BpsHistorySection() {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  const { data, isLoading } = useBiopsychosocialPlan();

  const plan = data?.plan ?? null;
  const generating = data?.generating ?? false;
  // COS-415: `generating` is an additive field — treat as false when absent
  // (BE deploys predating COS-415). `plan == null` covers both flag-off and
  // no-plan-yet in one falsy check, per fetchBiopsychosocialPlan's contract.
  const emptyAll = !plan;

  const emptyMessage =
    isLoading || generating
      ? 'Generating your biopsychosocial history…'
      : 'Complete your intake to see your biopsychosocial history here.';

  return (
    <SummaryCardShell
      title="Biopsychosocial history"
      icon="psychology"
      accentColor="#7B3FE4"
      isEmpty={emptyAll}
      emptyState={<EmptyStateHint text={emptyMessage} />}
      testID="bps-history-section"
    >
      <View style={styles.stack}>
        {DOMAINS.map(d => {
          const section = plan?.sections?.[d.key];
          const bullets = section?.planBullets ?? [];
          return (
            <View
              key={d.key}
              style={[
                styles.subCard,
                { backgroundColor: `${d.color}0D`, borderColor: `${d.color}33` },
              ]}
              accessible
              accessibilityRole="summary"
              accessibilityLabel={`${d.label} history`}
            >
              <Text
                style={[
                  styles.subTitle,
                  {
                    color: d.color,
                    fontSize: getScaledFontSize(13),
                    fontWeight: getScaledFontWeight(700) as TextStyle['fontWeight'],
                  },
                ]}
                accessibilityRole="header"
              >
                {d.label.toUpperCase()}
              </Text>
              {bullets.length === 0 ? (
                <EmptyStateHint text="No history captured yet." />
              ) : (
                bullets.map((b, i) => (
                  <View key={`${d.key}-${i}`} style={styles.bulletRow}>
                    <Text
                      style={{ color: d.color, fontSize: getScaledFontSize(15) }}
                      accessibilityElementsHidden
                      importantForAccessibility="no"
                    >
                      {'•'}
                    </Text>
                    <Text
                      style={{
                        color: colors.text,
                        fontSize: getScaledFontSize(15),
                        lineHeight: 22,
                        flex: 1,
                      }}
                    >
                      {b}
                    </Text>
                  </View>
                ))
              )}
            </View>
          );
        })}
      </View>
    </SummaryCardShell>
  );
}

const styles = StyleSheet.create({
  stack: { gap: Spacing.sm },
  subCard: {
    padding: Spacing.sm + 4,
    borderRadius: Radii.md,
    borderWidth: 1,
    gap: 6,
  },
  // Uppercase mini-heading — extra tracking mimics the Typography.caption tone
  // without importing the whole caption preset (color/weight are per-domain).
  subTitle: { letterSpacing: 0.6, marginBottom: 2 },
  bulletRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
});

export default BpsHistorySection;

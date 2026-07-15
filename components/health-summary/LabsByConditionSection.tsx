import React, { useMemo } from 'react';
import { View, Text, StyleSheet, type TextStyle } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import SummaryCardShell from './SummaryCardShell';
import EmptyStateHint from './EmptyStateHint';
import { useConditionList } from './CurrentConditionsSection';
import { fetchProviderLabReportsStrict } from '@/services/api/providers';
import type { LabReport, LabResultValue } from '@/services/api/types';
import { Colors } from '@/constants/theme';
import { Spacing, Radii } from '@/constants/design-system';
import { useAccessibility } from '@/stores/accessibility-store';

// Neutral teal — Section 5 is not a BPS-domain section, so it takes a neutral
// tint. Was purple #7C3AED, which read too close to the Psy bio-domain color
// (#7B3FE4) and blurred the BPS palette signal.
const ACCENT = '#0891B2';

// Bound render cost on chart-heavy accounts — never draw more than the most
// recent 20 individual labs across all buckets. Sorted by date desc before slice.
const MAX_LABS_RENDERED = 20;

// Condition → keyword list for matching lab test names. Keywords are matched
// case-insensitively as substrings against `LabResultValue.name` and the parent
// `LabReport.name` (some panels only name the panel, not each analyte).
//
// The map key is the LOWERCASED condition-name substring the user's condition
// list is matched against. e.g. a condition of "Type 2 Diabetes Mellitus" hits
// the 'diabetes' entry because 'diabetes' is a substring of the condition name.
const CONDITION_LAB_KEYWORDS: Record<string, string[]> = {
  diabetes: ['hba1c', 'a1c', 'glucose', 'fructosamine', 'insulin', 'c-peptide', 'c peptide'],
  hypertension: ['bmp', 'sodium', 'potassium', 'creatinine', 'egfr', 'bun'],
  cholesterol: ['lipid', 'ldl', 'hdl', 'triglyceride', 'total cholesterol', 'cholesterol'],
  hyperlipidemia: ['lipid', 'ldl', 'hdl', 'triglyceride', 'total cholesterol', 'cholesterol'],
  thyroid: ['tsh', 't3', 't4', 'free t4'],
  kidney: ['creatinine', 'egfr', 'bun', 'urine albumin', 'albumin/creatinine'],
  liver: ['alt', 'ast', 'bilirubin', 'albumin', 'alp', 'alkaline phosphatase'],
  anemia: ['cbc', 'hemoglobin', 'hematocrit', 'ferritin', 'iron'],
};

// Interpretations that mean "this result is actually out of range". Anything
// else — 'pending', 'not available', 'n/a', 'unknown', 'see comment', empty,
// 'normal' — MUST NOT count as flagged. Match case-insensitively.
const FLAGGED_INTERPRETATIONS = new Set(['high', 'low', 'abnormal', 'critical', 'h', 'l']);

function isFlagged(v: LabResultValue): boolean {
  const raw = v.interpretation?.trim().toLowerCase();
  if (!raw) return false;
  return FLAGGED_INTERPRETATIONS.has(raw);
}

function formatDate(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// A lab report "matches" a condition if either the panel/report name OR any
// individual analyte name matches any keyword for that condition.
function reportMatchesCondition(report: LabReport, keywords: string[]): boolean {
  const panel = (report.name ?? '').toLowerCase();
  if (keywords.some(k => panel.includes(k))) return true;
  return (report.results ?? []).some(r => {
    const analyte = (r.name ?? '').toLowerCase();
    return keywords.some(k => analyte.includes(k));
  });
}

// Resolve the keyword list for a given condition string. First tries the
// keyed heuristics (diabetes, thyroid, …); falls back to the condition name
// itself as a lowercase substring match against test names.
function keywordsForCondition(condition: string): string[] {
  const lc = condition.toLowerCase();
  for (const key of Object.keys(CONDITION_LAB_KEYWORDS)) {
    if (lc.includes(key)) return CONDITION_LAB_KEYWORDS[key];
  }
  return [lc];
}

function LabsByConditionSection() {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  const { conditions } = useConditionList();

  const { data: reports = [], isLoading, isError } = useQuery<LabReport[]>({
    queryKey: ['lab-reports'],
    queryFn: () => fetchProviderLabReportsStrict(),
    staleTime: 60_000,
    retry: 1,
  });

  // Sort most-recent-first and cap at MAX_LABS_RENDERED so a very chatty EHR
  // can't force us to render hundreds of rows on a single card.
  const bounded = useMemo(
    () =>
      [...reports]
        .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
        .slice(0, MAX_LABS_RENDERED),
    [reports],
  );

  // Group bounded labs into buckets, one per condition, plus "Other recent
  // labs" for anything that didn't match. A single lab can conceptually match
  // multiple conditions (a BMP hits both hypertension and kidney disease);
  // we assign it to the FIRST matching condition to avoid double-counting.
  const buckets = useMemo(() => {
    const perCondition = new Map<string, LabReport[]>();
    conditions.forEach(c => perCondition.set(c, []));
    const other: LabReport[] = [];

    bounded.forEach(report => {
      const match = conditions.find(c =>
        reportMatchesCondition(report, keywordsForCondition(c)),
      );
      if (match) perCondition.get(match)!.push(report);
      else other.push(report);
    });

    const out: { label: string; list: LabReport[] }[] = [];
    conditions.forEach(c => {
      const list = perCondition.get(c) ?? [];
      if (list.length > 0) out.push({ label: c, list });
    });
    if (other.length > 0) out.push({ label: 'Other recent labs', list: other });
    return out;
  }, [bounded, conditions]);

  const isEmpty = !isError && reports.length === 0;

  // Preserve the isError branch so a temporary FHIR fetch failure reads as
  // "we couldn't load these", not "you have no labs" — the latter can panic
  // a patient. Empty and error are meaningfully different signals.
  const emptyNode = isError ? (
    <EmptyStateHint text="Lab results are temporarily unavailable. Pull to refresh." />
  ) : (
    <EmptyStateHint
      text={isLoading ? 'Loading your lab results…' : 'No recent lab results on file.'}
    />
  );

  return (
    <SummaryCardShell
      title="Lab results"
      icon="science"
      accentColor={ACCENT}
      isEmpty={isEmpty || isError}
      emptyState={emptyNode}
    >
      <View style={{ gap: Spacing.sm }}>
        {buckets.map(({ label, list }) => {
          const flagged = list.reduce(
            (acc, r) => acc + (r.results ?? []).filter(isFlagged).length,
            0,
          );
          const total = list.reduce((acc, r) => acc + (r.results ?? []).length, 0);
          const mostRecent = list[0];
          return (
            <View key={label} style={[styles.row, { borderColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    color: colors.text,
                    fontSize: getScaledFontSize(15),
                    fontWeight: getScaledFontWeight(700) as TextStyle['fontWeight'],
                  }}
                  numberOfLines={2}
                >
                  {label}
                </Text>
                <Text
                  style={{
                    color: colors.subtext,
                    fontSize: getScaledFontSize(13),
                    marginTop: 2,
                  }}
                >
                  {formatDate(mostRecent?.date)} · {total} result{total === 1 ? '' : 's'}
                </Text>
              </View>
              {flagged > 0 && (
                <View
                  style={[
                    styles.pill,
                    { backgroundColor: '#DC262620', borderColor: '#DC2626' },
                  ]}
                  accessibilityLabel={`${flagged} flagged results`}
                >
                  <Text
                    style={{
                      color: '#DC2626',
                      fontSize: getScaledFontSize(12),
                      fontWeight: getScaledFontWeight(700) as TextStyle['fontWeight'],
                    }}
                  >
                    {flagged} flagged
                  </Text>
                </View>
              )}
            </View>
          );
        })}
      </View>
    </SummaryCardShell>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radii.full,
    borderWidth: 1,
  },
});

export default LabsByConditionSection;

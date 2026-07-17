import React, { useMemo } from 'react';
import { View, Text, StyleSheet, type TextStyle } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import SummaryCardShell from './SummaryCardShell';
import EmptyStateHint from './EmptyStateHint';
import { useConditionList } from './CurrentConditionsSection';
import { fetchMedications } from '@/services/api/patient';
// Medication is imported through patient.ts but not re-exported from it, so
// pull the type directly from the shared types module.
import type { Medication } from '@/services/api/types';
import { Colors } from '@/constants/theme';
import { Spacing } from '@/constants/design-system';
import { useAccessibility } from '@/stores/accessibility-store';

type ThemedColors = (typeof Colors)['light'] | (typeof Colors)['dark'];

/**
 * Match a medication's free-text `purpose` (FHIR reasonCode.text) against the
 * patient's known conditions. Substring match in both directions gives us a
 * reasonable recall rate on messy EHR data without heavy NLP.
 */
function matchCondition(purpose: string | undefined, conditions: string[]): string | null {
  if (!purpose) return null;
  const p = purpose.toLowerCase().trim();
  if (!p) return null;
  const firstWord = p.split(/\s+/)[0];
  for (const c of conditions) {
    const cl = c.toLowerCase().trim();
    if (!cl) continue;
    if (p.includes(cl) || (firstWord && cl.includes(firstWord))) return c;
  }
  return null;
}

function MedicationsByConditionSection() {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  const { conditions } = useConditionList();

  const { data: meds = [], isLoading, isError } = useQuery<Medication[]>({
    queryKey: ['patient-medications'],
    queryFn: fetchMedications,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const groups = useMemo(() => {
    const byCond = new Map<string, Medication[]>();
    const unmatched: Medication[] = [];
    meds.forEach((m) => {
      const c = matchCondition(m.purpose, conditions);
      if (c) {
        const list = byCond.get(c) ?? [];
        list.push(m);
        byCond.set(c, list);
      } else if (m.purpose?.trim()) {
        // FE-side condition list (from summary + chronic conditions) didn't
        // include this med's indication, but the BE populated purpose (via
        // HS-4a med-inference — patient's FHIR Condition list is a superset
        // of what the FE knows). Use the BE-populated indication as the
        // synthetic group header so the med still surfaces under something
        // meaningful instead of dumping into "Other medications".
        const key = m.purpose.trim();
        const list = byCond.get(key) ?? [];
        list.push(m);
        byCond.set(key, list);
      } else {
        unmatched.push(m);
      }
    });
    return { byCond, unmatched };
  }, [meds, conditions]);

  const isEmpty = meds.length === 0;
  const emptyText = isLoading
    ? 'Loading your medications…'
    : isError
      ? 'We could not load your medications. Try again in a moment.'
      : 'No medications on file yet.';

  return (
    <SummaryCardShell
      title="Medications by condition"
      icon="medication"
      accentColor="#0EA5E9"
      preview={meds.length > 0 ? `${meds.length} medication${meds.length === 1 ? '' : 's'}` : undefined}
      isEmpty={isEmpty}
      emptyState={<EmptyStateHint text={emptyText} />}
    >
      <View style={{ gap: Spacing.md }}>
        {[...groups.byCond.entries()].map(([cond, list]) => (
          <View key={cond} style={[styles.group, { borderColor: colors.border }]}>
            <Text
              style={[
                styles.groupTitle,
                {
                  color: colors.text,
                  fontSize: getScaledFontSize(14),
                  fontWeight: getScaledFontWeight(700) as TextStyle['fontWeight'],
                },
              ]}
            >
              {cond}
            </Text>
            {list.map((m, i) => (
              <MedRow
                key={`${m.name}-${i}`}
                med={m}
                colors={colors}
                getScaledFontSize={getScaledFontSize}
              />
            ))}
          </View>
        ))}
        {groups.unmatched.length > 0 && (
          <View style={[styles.group, { borderColor: colors.border }]}>
            <Text
              style={[
                styles.groupTitle,
                {
                  color: colors.subtext,
                  fontSize: getScaledFontSize(14),
                  fontWeight: getScaledFontWeight(700) as TextStyle['fontWeight'],
                },
              ]}
            >
              Other medications
            </Text>
            {groups.unmatched.map((m, i) => (
              <MedRow
                key={`${m.name}-u${i}`}
                med={m}
                colors={colors}
                getScaledFontSize={getScaledFontSize}
              />
            ))}
          </View>
        )}
        <Text
          style={{
            color: colors.subtext,
            fontSize: getScaledFontSize(12),
            fontStyle: 'italic',
          }}
        >
          Matched to your conditions above where an indication was recorded.
        </Text>
      </View>
    </SummaryCardShell>
  );
}

function MedRow({
  med,
  colors,
  getScaledFontSize,
}: {
  med: Medication;
  colors: ThemedColors;
  getScaledFontSize: (n: number) => number;
}) {
  const line2 = [med.dosage, med.frequency].filter(Boolean).join(' • ');
  return (
    <View style={styles.medRow}>
      <Text
        style={{
          color: colors.text,
          fontSize: getScaledFontSize(15),
          fontWeight: '600',
        }}
      >
        {med.name || 'Unknown medication'}
      </Text>
      {!!line2 && (
        <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(13) }}>
          {line2}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.sm,
    gap: 2,
  },
  groupTitle: {
    marginBottom: 4,
    textTransform: 'none',
  },
  medRow: {
    paddingVertical: 4,
  },
});

export default MedicationsByConditionSection;

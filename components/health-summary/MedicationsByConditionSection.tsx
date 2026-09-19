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
import { splitByRecency } from '@/lib/medication-recency';

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

  /*
   * COS-1041 — group only the CURRENT medications; keep the rest counted.
   *
   * Ken 2026-09-18: this card listed six or seven years of prescriptions while
   * he takes two or three. He is right that it changed — COS-1009 (ccc91ce)
   * removed the server's `status: 'active'` filter on purpose, closing with
   * "Status still ships on every row, so the client separates current from
   * past rather than blending them."
   *
   * True of the API, false of this client: the server spreads the raw FHIR
   * resource so `status` was always on the wire, but the Medication type did
   * not declare it and the mapper did not read it, so there was nowhere for
   * that separation to happen. Both are fixed; this is where it happens.
   *
   * The history is NOT discarded — discarding it would re-break exactly what
   * COS-1009 fixed. It is counted and named below, so "what was I given" is
   * still answerable from this card.
   */
  const { current: currentMeds, past: pastMeds } = useMemo(
    () => splitByRecency(meds),
    [meds],
  );

  const groups = useMemo(() => {
    const byCond = new Map<string, Medication[]>();
    const unmatched: Medication[] = [];
    currentMeds.forEach((m) => {
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
  }, [currentMeds, conditions]);

  // Empty means "nothing at all on file", not "nothing current" — a patient
  // with only past prescriptions must still see the history line below rather
  // than "No medications on file yet.", which would be false.
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
      preview={
        currentMeds.length > 0
          ? `${currentMeds.length} current`
          : pastMeds.length > 0
            ? 'None current'
            : undefined
      }
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
        {/* COS-1041 — the history stays reachable and, crucially, COUNTED.
            COS-1009 removed the server filter precisely so "what was I given
            by this doctor" could be answered; hiding these rows entirely
            would re-break that. Naming the number also explains the change to
            a patient who remembers seeing a much longer list. */}
        {pastMeds.length > 0 && (
          <Text
            style={{
              color: colors.subtext,
              fontSize: getScaledFontSize(12),
              lineHeight: getScaledFontSize(18),
            }}
          >
            {currentMeds.length === 0
              ? `No current prescriptions. ${pastMeds.length} past medication${pastMeds.length === 1 ? '' : 's'} on record — see the Medications screen for the full history.`
              : `${pastMeds.length} past medication${pastMeds.length === 1 ? '' : 's'} not shown here. See the Medications screen for the full history.`}
          </Text>
        )}
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

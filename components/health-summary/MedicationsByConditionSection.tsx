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
import { rankCurrent, splitByRecency } from '@/lib/medication-recency';

type ThemedColors = (typeof Colors)['light'] | (typeof Colors)['dark'];

/**
 * Match a medication's free-text `purpose` (FHIR reasonCode.text) against the
 * patient's known conditions.
 *
 * COS-1109 — the old `cl.includes(firstWord)` fallback was an UNANCHORED
 * substring test of one whitespace token against a condition name, with no
 * minimum length and no normalisation. A purpose beginning "As…" bound to any
 * condition containing those two letters — and every condition ending in
 * "disease" contains "as". That is the same class of bug as COS-1087, where
 * matching 'ot' inside a surname misfiled 92 production rows.
 *
 * Now: strip punctuation, require a token of at least four characters, and
 * match on WORD BOUNDARIES in both directions.
 */
const MIN_TOKEN = 4;

const normalise = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

const escapeTerm = (t: string): string => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Word-boundary containment, so "as" never matches inside "disease". */
const hasTerm = (haystack: string, term: string): boolean =>
  new RegExp(`(?<![a-z0-9])${escapeTerm(term)}(?![a-z0-9])`, 'i').test(haystack);

function matchCondition(purpose: string | undefined, conditions: string[]): string | null {
  if (!purpose) return null;
  const p = normalise(purpose);
  if (!p) return null;

  // Whole-phrase match first — the only unambiguous signal.
  for (const c of conditions) {
    const cl = normalise(c);
    if (cl && (hasTerm(p, cl) || hasTerm(cl, p))) return c;
  }

  /*
   * Token fallback. Scores rather than taking the first hit: the old version
   * returned whichever condition happened to sit earliest in an array built by
   * splitting Bedrock prose on commas, so the same drug could move between
   * headings across sessions with no data change.
   */
  const tokens = p.split(' ').filter((t) => t.length >= MIN_TOKEN);
  if (tokens.length === 0) return null;

  let best: { cond: string; score: number } | null = null;
  for (const c of conditions) {
    const cl = normalise(c);
    if (!cl) continue;
    const score = tokens.reduce((n, t) => n + (hasTerm(cl, t) ? t.length : 0), 0);
    if (score > 0 && (!best || score > best.score)) best = { cond: c, score };
  }
  return best ? best.cond : null;
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

  /*
   * COS-1109 — rank before grouping. See lib/medication-recency.rankCurrent:
   * the card had no sort at all, so group order and row order were both the
   * arbitrary order HealthLake returned rows in.
   */
  const rankedCurrent = useMemo(() => rankCurrent(currentMeds), [currentMeds]);

  const groups = useMemo(() => {
    const byCond = new Map<string, Medication[]>();
    const unmatched: Medication[] = [];
    rankedCurrent.forEach((m) => {
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
  }, [rankedCurrent, conditions]);

  /*
   * COS-1109 — ONE ordered list of sections, ungrouped bucket included.
   *
   * It used to be hardcoded to render last, *below* the "53 past medications
   * not shown here" sentence. So Ken's two daily drugs sat under a generic
   * heading, beneath a line about medications he no longer takes — the exact
   * thing he screenshotted. Ranking is by each section's best member, and
   * because rankedCurrent is already sorted, that is simply its first row.
   */
  const sections = useMemo(() => {
    const out: { key: string; title: string; items: Medication[]; muted: boolean }[] = [];
    for (const [cond, items] of groups.byCond.entries()) {
      out.push({ key: `c:${cond}`, title: cond, items, muted: false });
    }
    if (groups.unmatched.length > 0) {
      out.push({
        key: 'unmatched',
        // "Other medications" read as a leftovers bin for the drugs he cares
        // most about. This says WHY they are separate without implying they
        // matter less.
        title: 'No condition recorded',
        items: groups.unmatched,
        muted: true,
      });
    }
    const rankOf = (items: Medication[]) => rankedCurrent.indexOf(items[0]);
    return out.sort((a, b) => rankOf(a.items) - rankOf(b.items));
  }, [groups, rankedCurrent]);

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
        {sections.map((sec) => (
          <View key={sec.key} style={[styles.group, { borderColor: colors.border }]}>
            <Text
              style={[
                styles.groupTitle,
                {
                  color: sec.muted ? colors.subtext : colors.text,
                  fontSize: getScaledFontSize(14),
                  fontWeight: getScaledFontWeight(700) as TextStyle['fontWeight'],
                },
              ]}
            >
              {sec.title}
            </Text>
            {sec.items.map((m, i) => (
              <MedRow
                key={`${sec.key}-${m.name}-${i}`}
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
            would re-break that.

            COS-1109 moved this to the BOTTOM. It used to sit above the
            ungrouped bucket, so a patient's current medications rendered
            underneath a sentence about medications he no longer takes. */}
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
        <Text
          style={{
            color: colors.subtext,
            fontSize: getScaledFontSize(12),
            fontStyle: 'italic',
          }}
        >
          Ordered by what you are most likely taking now. Grouped by condition
          where an indication was recorded.
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

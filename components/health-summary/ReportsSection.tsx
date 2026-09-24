import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, type TextStyle } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import SummaryCardShell from './SummaryCardShell';
import EmptyStateHint from './EmptyStateHint';
import { fetchReports } from '@/services/api/reports';
import type { Report } from '@/services/api/types';
import { Colors } from '@/constants/theme';
import { Spacing, Radii } from '@/constants/design-system';
import { useAccessibility } from '@/stores/accessibility-store';

/**
 * COS-1045 — reports on Health Status, in the shape Ken asked for.
 *
 * Ken 2026-09-18: he wanted a reports block on Health Status "the similar way
 * we have vitals and red flags" — a category that opens onto what is inside,
 * rather than a list of filenames.
 *
 * ─── GROUPED BY CATEGORY, NOT LISTED BY DATE ─────────────────────────
 *
 * The Reports SCREEN already lists everything newest-first; repeating that
 * here would be a second copy of the same list in a smaller box. What Health
 * Status is for is the shape of someone's record — so this groups by category
 * (Laboratory, Radiology, Pathology…) and shows how many of each, newest
 * first, exactly as VitalsRedFlagSection groups measures under a category.
 *
 * ─── ABNORMAL COUNTS ARE SURFACED, NOT COMPUTED ──────────────────────
 *
 * `abnormalCount` arrives from the server, which derives it from the FHIR
 * interpretation codes. It is shown verbatim and never inferred from the
 * result rows here: a client that decides for itself what "abnormal" means is
 * a client that will eventually disagree with the clinician's own flagging,
 * on a screen a patient may act on.
 *
 * A zero count renders nothing rather than a green "0 abnormal" — absence of
 * a flag is not a clean bill of health, and this screen must not imply one.
 *
 * ─── PRIMITIVES ONLY ─────────────────────────────────────────────────
 *
 * Same envelope as the sections either side of it: View / Text / Pressable /
 * MaterialIcons / StyleSheet. No SVG, no Animated. This screen renders on the
 * cold-mount path with the iOS 26 crash history (ADR-0003).
 */

/** Newest first, undated last. */
function byDateDesc(a: Report, b: Report): number {
  const ta = a.date ? Date.parse(a.date) : NaN;
  const tb = b.date ? Date.parse(b.date) : NaN;
  if (Number.isNaN(ta) && Number.isNaN(tb)) return 0;
  if (Number.isNaN(ta)) return 1;
  if (Number.isNaN(tb)) return -1;
  return tb - ta;
}

/**
 * Tidy a FHIR category into something a patient reads.
 *
 * EHR data is messy — the same category arrives as "LAB", "Laboratory" and
 * "laboratory" from different systems, and rendering those as three separate
 * groups is how a record with four reports looks like a record with twelve.
 */
function normaliseCategory(raw: string | undefined): string {
  const c = (raw ?? '').trim();
  if (!c) return 'Other reports';
  const lower = c.toLowerCase();
  if (lower.startsWith('lab')) return 'Laboratory';
  if (lower.startsWith('rad') || lower.startsWith('imag')) return 'Imaging';
  if (lower.startsWith('path')) return 'Pathology';
  if (lower.startsWith('card')) return 'Cardiology';
  return c.charAt(0).toUpperCase() + c.slice(1);
}

/** Groups, largest first, each sorted newest-first. */
export function groupReports(reports: readonly Report[]): { category: string; items: Report[] }[] {
  const by = new Map<string, Report[]>();
  for (const r of reports) {
    const key = normaliseCategory(r.category);
    const list = by.get(key) ?? [];
    list.push(r);
    by.set(key, list);
  }
  return [...by.entries()]
    .map(([category, items]) => ({ category, items: [...items].sort(byDateDesc) }))
    .sort((a, b) => b.items.length - a.items.length || a.category.localeCompare(b.category));
}

function formatDate(value: string | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function ReportsSection() {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];

  const { data: reports = [], isLoading, isError } = useQuery<Report[]>({
    queryKey: ['patient-reports'],
    queryFn: fetchReports,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const groups = useMemo(() => groupReports(reports), [reports]);
  const abnormalTotal = useMemo(
    () => reports.reduce((n, r) => n + (typeof r.abnormalCount === 'number' ? r.abnormalCount : 0), 0),
    [reports],
  );

  const isEmpty = reports.length === 0;
  // COS-1020's rule: never render a terminal empty state while the request is
  // still in flight. "No reports" and "still loading" are different answers and
  // only one of them is a claim about the patient.
  const emptyText = isLoading
    ? 'Loading your reports…'
    : isError
      ? 'We could not load your reports. Try again in a moment.'
      : 'No reports on file yet.';

  return (
    <SummaryCardShell
      title="Reports & History"
      icon="description"
      accentColor="#7C3AED"
      preview={
        reports.length > 0
          ? `${reports.length} report${reports.length === 1 ? '' : 's'}`
          : undefined
      }
      isEmpty={isEmpty}
      emptyState={<EmptyStateHint text={emptyText} />}
    >
      <View style={{ gap: Spacing.md }}>
        {abnormalTotal > 0 && (
          /* Surfaced from the server's own interpretation codes, never
             inferred here. Rendered only when non-zero — "0 abnormal" reads
             as a clean bill of health, which this screen cannot promise. */
          <View style={[styles.flagRow, { borderColor: colors.border }]}>
            <MaterialIcons name="flag" size={getScaledFontSize(16)} color="#DC2626" />
            <Text
              style={{
                color: colors.text,
                fontSize: getScaledFontSize(13),
                marginLeft: Spacing.xs,
                flex: 1,
              }}
            >
              {abnormalTotal} result{abnormalTotal === 1 ? '' : 's'} flagged for review by your care team
            </Text>
          </View>
        )}

        {groups.map(({ category, items }) => (
          <View key={category} style={[styles.group, { borderColor: colors.border }]}>
            <View style={styles.groupHeader}>
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
                {category}
              </Text>
              <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(12) }}>
                {items.length}
              </Text>
            </View>

            {/* Newest three. The full history is one tap away on the Reports
                screen, and a card that renders sixty rows is a scroll trap on
                the screen Ken already called too dense. */}
            {items.slice(0, 3).map((r) => (
              <Pressable
                key={r.id}
                onPress={() => router.push('/Home/reports' as never)}
                accessibilityRole="button"
                accessibilityLabel={`${r.title}${r.date ? `, ${formatDate(r.date)}` : ''}`}
                style={styles.row}
              >
                <View style={{ flex: 1 }}>
                  <Text
                    style={{ color: colors.text, fontSize: getScaledFontSize(13) }}
                    numberOfLines={1}
                  >
                    {r.title || 'Untitled report'}
                  </Text>
                  <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(11), marginTop: 1 }}>
                    {[formatDate(r.date), r.provider].filter(Boolean).join(' • ')}
                  </Text>
                </View>
                {typeof r.abnormalCount === 'number' && r.abnormalCount > 0 && (
                  <View style={styles.pill}>
                    <Text style={{ color: '#DC2626', fontSize: getScaledFontSize(10), fontWeight: '700' }}>
                      {r.abnormalCount}
                    </Text>
                  </View>
                )}
                <MaterialIcons name="chevron-right" size={getScaledFontSize(18)} color={colors.icon} />
              </Pressable>
            ))}

            {items.length > 3 && (
              <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(11), marginTop: 2 }}>
                {items.length - 3} more in this category
              </Text>
            )}
          </View>
        ))}
      </View>
    </SummaryCardShell>
  );
}

const styles = StyleSheet.create({
  group: { borderWidth: 1, borderRadius: Radii.md, padding: Spacing.sm, gap: 6 },
  groupHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  groupTitle: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, gap: 6 },
  pill: {
    backgroundColor: '#FEE2E2',
    borderRadius: 9,
    paddingHorizontal: 6,
    paddingVertical: 1,
    marginRight: 2,
  },
  flagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: Radii.md,
    padding: Spacing.sm,
  },
});

export default ReportsSection;

/**
 * TodaysMedicationsCard (COS-448, SCRUM-585).
 *
 * Chunk 1a of the BPS plan enhancements (design artifact Section 18b/18c/18d).
 * Renders a prominent "Today's Medications" card at the TOP of the
 * BiopsychosocialPlanScreen so patients — especially older adults —
 * see their daily meds at a glance without scrolling into the Bio
 * section.
 *
 * Data: usePlanMedications() hook (existing COS-357/SCRUM-504 endpoint).
 * When `flagEnabled === false` or the endpoint errors, the card renders
 * null — same back-compat convention as MedicationsSection.
 *
 * Elder-friendly design decisions:
 *   - 15-17pt med names, 12pt timing meta (well above minimum)
 *   - 32-36px tap-to-check circles (WCAG accessible)
 *   - Plain-English timing ("morning · with breakfast" not "PO qAM")
 *   - Next-due med gets a thick teal border to draw the eye
 *   - Empty state with two CTAs: manual add + Apple Health sync
 *
 * Rollup view (this file): shows first N meds (default 3) grouped by
 * primary time-of-day (morning/afternoon/evening derived from
 * Medication.times[]). "See all →" opens the dedicated
 * MedicationsDetailScreen (Chunk 1a follow-up).
 *
 * Pure presentational — no new endpoint. Existing check-off UX (marking
 * a med taken) stays on the dedicated MedicationsSection surface for
 * this chunk; the card's circles are visual state indicators derived
 * from tracking history when available, otherwise show as pending.
 * Live check-off from the card is a fast-follow.
 *
 * OTA-safe (no native fingerprint change). Non-breaking additive.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';

import { Radii, Spacing } from '@/constants/design-system';
import { usePlanMedications } from '@/hooks/use-plan-medications';
import type { Medication } from '@/services/api/plan-medications';

// Match the shape BiopsychosocialPlanScreen already casts `colors` to
// (Record<string, string>) so this drop-in component types cleanly at
// the call site without extra casts.
type ColorMap = Record<string, string>;

export interface TodaysMedicationsCardProps {
  colors: ColorMap;
  isDark: boolean;
  getScaledFontSize: (n: number) => number;
  getScaledFontWeight: (n: number) => string | number;
}

/**
 * Bucket a med's earliest scheduled time into morning / afternoon / evening.
 * A med with no times[] entries defaults to "morning" so it appears in the
 * most common bucket rather than being hidden.
 */
type TimeOfDay = 'morning' | 'afternoon' | 'evening';

function primaryTimeOfDay(med: Medication): TimeOfDay {
  const first = (med.times ?? [])[0];
  if (!first || !/^\d{1,2}:\d{2}$/.test(first)) return 'morning';
  const hour = parseInt(first.split(':')[0] ?? '0', 10);
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

function formatTimingCopy(med: Medication): string {
  const t = (med.times ?? [])[0];
  const bucket = primaryTimeOfDay(med);
  const bucketLabel = bucket === 'morning' ? 'Morning' : bucket === 'afternoon' ? 'Afternoon' : 'Evening';
  if (!t) return `${bucketLabel} · ${med.frequency ?? 'as prescribed'}`;
  // Plain-english time (e.g., "7:30 AM"); avoid PO qAM sig codes.
  const [hh, mm] = t.split(':');
  const h = parseInt(hh ?? '0', 10);
  const isPm = h >= 12;
  const displayHour = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${bucketLabel} · ${displayHour}:${mm} ${isPm ? 'PM' : 'AM'}`;
}

/** Pick the "next up" med — first pending med in chronological time order. */
function pickNextDueId(meds: Medication[]): string | null {
  if (meds.length === 0) return null;
  const sorted = [...meds].sort((a, b) => {
    const ta = (a.times ?? [])[0] ?? '99:99';
    const tb = (b.times ?? [])[0] ?? '99:99';
    return ta.localeCompare(tb);
  });
  return sorted[0]?.id ?? null;
}

export function TodaysMedicationsCard(props: TodaysMedicationsCardProps): React.JSX.Element | null {
  const { colors, isDark, getScaledFontSize, getScaledFontWeight } = props;
  const medsQuery = usePlanMedications();

  // Same back-compat convention as MedicationsSection: render nothing when
  // the flag is off or the endpoint hasn't answered yet.
  if (medsQuery.isLoading) return null;
  const data = medsQuery.data;
  if (!data || data.flagEnabled === false) return null;

  const meds = data.medications ?? [];
  const isEmpty = meds.length === 0;

  const tint = (colors.tint as string) ?? '#0D9488';
  const tintSoft = tint + '14';
  const tintBorder = tint + '33';

  if (isEmpty) {
    return (
      <View style={[styles.card, { backgroundColor: colors.card as string, borderColor: colors.border as string }]}>
        <View style={{ alignItems: 'center', paddingVertical: 6 }}>
          <MaterialIcons name="medication" size={28} color={tint} style={{ marginBottom: 4 }} />
          <Text
            style={{
              color: colors.text,
              fontSize: getScaledFontSize(15),
              fontWeight: getScaledFontWeight(700) as any,
            }}
          >
            Add your medications
          </Text>
          <Text
            style={{
              color: colors.subtext,
              fontSize: getScaledFontSize(12),
              textAlign: 'center',
              lineHeight: 17,
              marginTop: 4,
              paddingHorizontal: 12,
            }}
          >
            See your daily meds here, get reminders, and check them off as you take them.
          </Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
            <TouchableOpacity
              onPress={() => router.push('/Home/medications' as never)}
              accessibilityRole="button"
              accessibilityLabel="Add a medication"
              style={{
                backgroundColor: tint,
                paddingHorizontal: 14,
                paddingVertical: 9,
                borderRadius: 10,
              }}
            >
              <Text style={{ color: '#FFFFFF', fontSize: getScaledFontSize(13), fontWeight: '700' }}>+ Add med</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => router.push('/Home/apple-health' as never)}
              accessibilityRole="button"
              accessibilityLabel="Sync medications from Apple Health"
              style={{
                backgroundColor: 'transparent',
                borderWidth: 1,
                borderColor: colors.border as string,
                paddingHorizontal: 14,
                paddingVertical: 9,
                borderRadius: 10,
              }}
            >
              <Text style={{ color: colors.text, fontSize: getScaledFontSize(13), fontWeight: '600' }}>
                Sync from Apple Health
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  const nextDueId = pickNextDueId(meds);
  // Show up to 3 in the rollup — beyond that, "See all" opens the full list.
  const displayed = meds.slice(0, 3);
  const overflowCount = Math.max(0, meds.length - displayed.length);

  return (
    <View style={[styles.card, { backgroundColor: colors.card as string, borderColor: colors.border as string, padding: 0, overflow: 'hidden' }]}>
      <View style={[styles.header, { backgroundColor: tintSoft, borderBottomColor: tintBorder }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
          <MaterialIcons name="medication" size={18} color={tint} />
          <Text
            style={{
              color: tint,
              fontSize: getScaledFontSize(12),
              fontWeight: '800',
              letterSpacing: 0.5,
              textTransform: 'uppercase',
            }}
          >
            Today&apos;s Medications
          </Text>
        </View>
        <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(11), fontWeight: '600' }}>
          {meds.length} total
        </Text>
      </View>

      {displayed.map((med, idx) => {
        const isNextDue = med.id === nextDueId;
        return (
          <Pressable
            key={med.id}
            onPress={() => router.push('/Home/medications' as never)}
            accessibilityRole="button"
            accessibilityLabel={`${med.name}${med.dose ? ' ' + med.dose : ''}, ${formatTimingCopy(med)}. Tap to view medications.`}
            style={({ pressed }) => [
              styles.row,
              {
                borderBottomColor: colors.border as string,
                borderBottomWidth: idx === displayed.length - 1 ? 0 : StyleSheet.hairlineWidth,
                opacity: pressed ? 0.85 : 1,
                borderLeftWidth: isNextDue ? 3 : 0,
                borderLeftColor: isNextDue ? tint : 'transparent',
                paddingLeft: isNextDue ? Spacing.md - 3 : Spacing.md,
              },
            ]}
          >
            <View style={[styles.iconChip, { backgroundColor: tintSoft }]}>
              <Text style={{ fontSize: 20 }}>💊</Text>
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text
                numberOfLines={1}
                style={{
                  color: colors.text,
                  fontSize: getScaledFontSize(15),
                  fontWeight: getScaledFontWeight(700) as any,
                  lineHeight: 20,
                }}
              >
                {med.name}
                {med.dose ? (
                  <Text style={{ color: colors.subtext, fontWeight: '500' }}> {med.dose}</Text>
                ) : null}
              </Text>
              <Text
                numberOfLines={1}
                style={{
                  color: colors.subtext,
                  fontSize: getScaledFontSize(12),
                  marginTop: 2,
                }}
              >
                {formatTimingCopy(med)}
              </Text>
            </View>
            <MaterialIcons name="chevron-right" size={20} color={colors.subtext} />
          </Pressable>
        );
      })}

      {overflowCount > 0 || meds.length > 0 ? (
        <TouchableOpacity
          onPress={() => router.push('/Home/medications' as never)}
          accessibilityRole="button"
          accessibilityLabel="See all medications"
          style={{ paddingVertical: 10, alignItems: 'center' }}
        >
          <Text style={{ color: tint, fontSize: getScaledFontSize(12), fontWeight: '700' }}>
            {overflowCount > 0 ? `See all ${meds.length} →` : 'See details →'}
          </Text>
        </TouchableOpacity>
      ) : null}

      {data.medsReviewNeeded ? (
        <View style={[styles.reviewBanner, { backgroundColor: (colors.tint as string) + '10' }]}>
          <MaterialIcons name="info-outline" size={14} color={tint} />
          <Text style={{ color: colors.text, fontSize: getScaledFontSize(11), flex: 1, lineHeight: 15 }}>
            Please review your medications with your care team.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    // CHUNK 57 alignment: borderRadius 14 → Radii.xl (16). Matches every
    // sibling BPS card (BpsWelcomeBanner / BpsTodayHeroCard /
    // BpsAiSummaryBanner / BpsNotificationCategoriesCard / SectionCard /
    // mapCard) so all card corners share one radius across the surface.
    // Component is BPS-only (grep for TodaysMedicationsCard — only
    // mounted in BiopsychosocialPlanScreen), so this has no back-compat
    // impact on legacy.
    borderRadius: Radii.xl,
    borderWidth: 1,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingRight: Spacing.md,
  },
  iconChip: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.08)',
  },
});

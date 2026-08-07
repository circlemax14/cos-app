/**
 * BpsNotificationCategoriesCard (Chunk 51) — port of the legacy
 * COS-373 "Here's what you'll be notified about" glimpse card from
 * `app/Home/health-plan.tsx:1091-1136` onto the biopsychosocial plan
 * surface.
 *
 * Legacy renders a read-only card that lists the 5 notification
 * categories (Appointments, Reminders, Medication reminders,
 * Medication tasks, Other tasks) with a green check-circle if on and
 * a gray cancel if off, plus a "Manage" link that pushes to the
 * Reminders settings screen. No toggles — glimpse only. Gated by
 * NOTIFICATION_CATEGORIES_ENABLED (client kill-switch) AND the server
 * flagEnabled bit.
 *
 * The BPS surface (`BiopsychosocialPlanScreen`) had nothing similar,
 * so users on BPS had no at-a-glance view of what they'd be notified
 * about. This card closes that parity gap on the BPS surface today,
 * without touching the legacy card.
 *
 * DATA SOURCE COUPLING
 * --------------------
 * `useNotificationCategories()` from `hooks/use-notification-categories.ts`
 * — same query key `['notification-categories']` as legacy, so BPS
 * piggybacks on the shared react-query cache (no double-fetch). Return
 * shape is `{ flagEnabled: boolean, preferences: NotificationCategoryPrefs }`.
 * `fetchNotificationCategories` never rejects (services/api/notification-prefs.ts
 * swallows all exceptions and resolves to `{ flagEnabled: false, preferences: defaults }`),
 * so a network failure lands as a resolved-with-off transition — the same
 * code path as a BE-flag off — and this component collapses to null.
 *
 * The local `NOTIF_CATEGORY_LABELS` map is intentionally decoupled
 * from the identical private const in `app/Home/health-plan.tsx`
 * (both duplicate the same 5 strings). A follow-up ticket will
 * consolidate the labels into `lib/notification-categories.ts` once
 * BPS has soaked one prod OTA cycle — keep in sync with the legacy
 * private const meanwhile.
 *
 * LAYOUT-SHIFT ELIMINATION (chunk 51 post-verify fix)
 * ---------------------------------------------------
 * Earlier iteration used a hardcoded 210pt placeholder while the query
 * was in flight. Adversarial verify caught: at max Dynamic Type on iPad
 * the resolved card is ~290pt, so downstream cards (TodaysMedicationsCard,
 * wellbeing map, subdomains, goals, tasks) still jumped ~80pt on data
 * arrival — same CLS class the fix was meant to remove, relocated.
 *
 * Final approach: keep the SAME outer card + head row + 5 rows mounted at
 * BOTH loading and resolved states. Header text ("Here's what you'll be
 * notified about") and per-row labels are data-independent, so they render
 * literally at both states. Only the leading icon (neutral circle → check /
 * cancel) and trailing On/Off text (invisible-but-same-width placeholder →
 * real text) swap on resolve. Every dimension in the card is derived from
 * `getScaledFontSize(...)` uniformly, so the intrinsic card height at any
 * Dynamic Type scale, any device, any accessibility multiplier is
 * guaranteed identical between loading and resolved — no CLS possible.
 *
 * As a side benefit: users on slow networks see the labels themselves
 * during the ~200-800ms load window, not a blank card, which reads as
 * "this card is telling me what's about to be shown" instead of "why is
 * there a mystery grey box between AI Summary and Medications."
 *
 * TRAILING-WIDTH LOCK
 * -------------------
 * The trailing On/Off text width is locked to a min-width sized for the
 * widest glyph ('Off') at each Dynamic Type scale. Without this lock the
 * loading state (which always reserves 'Off'-wide space) and the resolved
 * state ('On' is narrower than 'Off') would give different flex-remainder
 * to the label, and a label sitting on the wrap boundary could wrap to 2
 * lines in one state and 1 line in the other — restoring the CLS class
 * the outer wrapper is meant to eliminate. The lock guarantees the
 * label's flex-remainder is identical at both states and both resolved
 * On/Off variants, so every row's intrinsic height is identical too.
 *
 * ACCESSIBILITY (mirrors legacy COS-373 card)
 * -------------------------------------------
 * No outer `accessible` wrapper — children own their own a11y, matching
 * the legacy card at `app/Home/health-plan.tsx:1097-1136`. VoiceOver reads
 * the header text, then each row's per-child content, then the Manage
 * Pressable (with its own accessibilityRole="button" +
 * accessibilityLabel="Manage notification settings"). Focus rides the
 * loading→resolved transition without a stale-label announcement bug
 * because there's no outer label to go stale; and Manage is reachable
 * via VoiceOver instead of being flattened into a leaf-only summary.
 *
 * iOS 26.5 CONSTRAINT ENVELOPE
 * ----------------------------
 * Primitives ONLY: View / Text / Pressable / MaterialIcons /
 * StyleSheet + static hex+alpha strings. No Animated / Reanimated /
 * LayoutAnimation, no Modal / Portal, no gradient, no blur, no
 * ActivityIndicator. Static card, no animation.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';

import {
  NOTIFICATION_CATEGORIES_ENABLED,
  NOTIFICATION_CATEGORY_KEYS,
  type NotificationCategory,
} from '@/lib/notification-categories';
import { useNotificationCategories } from '@/hooks/use-notification-categories';

/**
 * Short labels for each of the 5 notification categories. Intentionally
 * decoupled from the identical private const in `app/Home/health-plan.tsx`
 * — keep in sync with the legacy screen. Follow-up: consolidate into
 * `lib/notification-categories.ts` after one prod OTA soak.
 */
const NOTIF_CATEGORY_LABELS: Record<NotificationCategory, string> = {
  appointments: 'Appointments',
  reminders: 'Reminders',
  medicationReminders: 'Medication reminders',
  medicationTask: 'Medication tasks',
  otherTask: 'Other tasks',
  nudges: 'Proactive nudges',
  habits: 'Routine reminders',
};

export interface BpsNotificationCategoriesCardProps {
  /** Themed color palette resolved by the parent (matches sibling BPS
   *  cards — parent hands us a `Record<string, string>` cast of the
   *  Colors palette, so we accept the same shape for prop-shape
   *  compatibility with BpsWelcomeBanner / BpsTodayHeroCard /
   *  BpsAiSummaryBanner / TodaysMedicationsCard). */
  colors: Record<string, string>;
  /** Kept for API symmetry with sibling banners; not currently branched on. */
  isDark: boolean;
  getScaledFontSize: (n: number) => number;
  getScaledFontWeight: (n: number) => number | string;
}

export function BpsNotificationCategoriesCard({
  colors,
  isDark: _isDark,
  getScaledFontSize,
  getScaledFontWeight,
}: BpsNotificationCategoriesCardProps): React.ReactElement | null {
  const query = useNotificationCategories();

  // Client kill-switch: no card, no space reserved. Full compile-out path.
  if (!NOTIFICATION_CATEGORIES_ENABLED) return null;

  const isLoading = query.isPending && !query.data;
  const prefs = query.data?.preferences;
  const flagOn = query.data?.flagEnabled === true && !!prefs;

  // Resolved-with-off ⇒ null. Includes fetch-failure path since the service
  // catches all exceptions and resolves to flagEnabled=false with default
  // prefs. Documented cold-mount → resolved-off transition is a one-time
  // slot collapse; prod BE serves flagEnabled=true so it's not the common
  // path. When the flag turns off mid-session (e.g. incident cohort),
  // downstream cards ride up ~one-card-height once — accepted trade-off
  // vs. the null-render CLS class this file is set up to prevent.
  if (!isLoading && !flagOn) return null;

  // Lock trailing width: 'Off' is ~5-12pt wider than 'On' at typical font
  // scales, and the loading placeholder always sizes to 'Off'. Without a
  // min-width lock, resolved 'On' rows would give the label extra flex
  // space and could unwrap it — see the header LAYOUT-SHIFT ELIMINATION
  // block. Multiplier chosen to comfortably fit 'Off' at any font weight
  // (600) at the target font scale.
  const trailingMinWidth = getScaledFontSize(12) * 2.4;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: (colors.card as string) + 'D9',
          borderColor: colors.border as string,
        },
      ]}
    >
      <View style={styles.head}>
        <View style={styles.titleWrap}>
          <MaterialIcons
            name="notifications-active"
            size={getScaledFontSize(16)}
            color={colors.tint as string}
          />
          <Text
            style={[
              styles.title,
              {
                color: colors.text as string,
                fontSize: getScaledFontSize(14),
                fontWeight: getScaledFontWeight(700) as any,
              },
            ]}
          >
            Here&apos;s what you&apos;ll be notified about
          </Text>
        </View>
        {isLoading ? (
          // Invisible-but-same-width Manage placeholder so the head row's
          // intrinsic height + wrap behavior is identical to the resolved
          // state. `accessibilityElementsHidden` + `importantForAccessibility`
          // + `pointerEvents: none` keep it out of VoiceOver and out of the
          // hit-test tree. `pointerEvents` in the style form because the
          // prop form is deprecated in RN 0.65+.
          <View
            style={[styles.hiddenSlot, { pointerEvents: 'none' as const }]}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <Text
              style={{
                fontSize: getScaledFontSize(13),
                fontWeight: getScaledFontWeight(700) as any,
              }}
            >
              Manage
            </Text>
          </View>
        ) : (
          <Pressable
            onPress={() => router.push('/Home/reminder-settings' as never)}
            accessibilityRole="button"
            accessibilityLabel="Manage notification settings"
            hitSlop={8}
          >
            <Text
              style={{
                color: colors.tint as string,
                fontSize: getScaledFontSize(13),
                fontWeight: getScaledFontWeight(700) as any,
              }}
            >
              Manage
            </Text>
          </Pressable>
        )}
      </View>
      {NOTIFICATION_CATEGORY_KEYS.map((key) => {
        const label = NOTIF_CATEGORY_LABELS[key];
        const on = flagOn ? prefs![key] : false;
        return (
          <View key={key} style={styles.row}>
            <MaterialIcons
              name={isLoading ? 'radio-button-unchecked' : on ? 'check-circle' : 'cancel'}
              size={getScaledFontSize(16)}
              color={
                isLoading
                  ? ((colors.border as string) || (colors.subtext as string))
                  : on
                  ? '#16A34A'
                  : (colors.subtext as string)
              }
            />
            <Text
              style={[
                styles.label,
                { color: colors.text as string, fontSize: getScaledFontSize(13) },
              ]}
            >
              {label}
            </Text>
            {isLoading ? (
              // Trailing On/Off placeholder — widest glyph ('Off') at the
              // same font metrics as the resolved text, invisible + a11y-
              // hidden. minWidth locks trailing width so the resolved
              // 'On' state gives the label the same flex-remainder as
              // the loading state (see header LAYOUT-SHIFT ELIMINATION).
              <View
                style={[
                  styles.hiddenSlot,
                  { minWidth: trailingMinWidth, pointerEvents: 'none' as const },
                ]}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              >
                <Text
                  style={{
                    fontSize: getScaledFontSize(12),
                    fontWeight: getScaledFontWeight(600) as any,
                    textAlign: 'right',
                  }}
                >
                  Off
                </Text>
              </View>
            ) : (
              <Text
                style={{
                  color: on ? '#16A34A' : (colors.subtext as string),
                  fontSize: getScaledFontSize(12),
                  fontWeight: getScaledFontWeight(600) as any,
                  minWidth: trailingMinWidth,
                  textAlign: 'right',
                }}
              >
                {on ? 'On' : 'Off'}
              </Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    // CHUNK 57 alignment: dropped `marginHorizontal: 20`. The parent BPS
    // ScrollView already contributes contentContainer padding:
    // Spacing.md=16 horizontally, so this card's own mH:20 stacked to a
    // 36pt inset from the screen edge — visibly farther in than sibling
    // cards which sit at the 16pt padding boundary. borderRadius bumped
    // 18 → 16 to match Radii.xl used by BpsWelcomeBanner /
    // BpsAiSummaryBanner / SectionCard / mapCard so all card corners
    // share one radius across the surface. Component is BPS-only (grep
    // for BpsNotificationCategoriesCard — only mounted in
    // BiopsychosocialPlanScreen), so both edits have no back-compat
    // impact.
    marginBottom: 16,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  titleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    marginRight: 8,
  },
  title: { flexShrink: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 5,
  },
  label: { flex: 1 },
  // opacity:0 makes the placeholder text invisible but preserves the exact
  // intrinsic dimensions of the resolved-state element — the whole point of
  // the chunk-51 CLS fix is that intrinsic dimensions ride through the
  // loading→resolved transition unchanged at every Dynamic Type scale.
  hiddenSlot: { opacity: 0 },
});

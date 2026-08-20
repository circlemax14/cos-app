/**
 * COS-742 — the Billing screen: what the patient pays, and what else is on
 * offer.
 *
 * Renamed from "subscription"/"Your plan" because PLAN already meant two other
 * things here — the daily health plan on the Plan tab, and the assessment
 * intensity on the plan-type chooser. A third sense of the word sent people
 * looking for their tasks to a pricing page.
 *
 * ─── THE BACK ARROW IS LOAD-BEARING ──────────────────────────────────
 *
 * This screen is registered with `headerShown: false`, so it has no native
 * chrome. It used to offer only a "Close" button at the BOTTOM of the scroll,
 * below every plan card — off the fold as soon as there was more than one
 * plan. Tapping a card from the Plan tab therefore dropped patients somewhere
 * with no visible way out. The header arrow is the fix; the Close button stays
 * as a convenience for anyone who has scrolled to the end.
 *
 * COS-737 — the plans an admin publishes, rendered.
 *
 * ─── WHY THIS IS SEPARATE FROM plan-type-chooser ─────────────────────
 *
 * "Plan" means two different things in this app and conflating them would be a
 * clinical bug, not just a naming one.
 *
 *   plan-type-chooser  asks "how intensively should we assess you?" — its four
 *                      options drive screener depth and assessment expiry
 *                      (cos-backend assessments.service.ts:492). Free, instant,
 *                      self-service, and it must stay that way.
 *   THIS screen        asks "what are you paying for?" — the plans from
 *                      /v1/patients/me/plans, which carry pricing.
 *
 * Merging them would mean a patient changing their clinical assessment depth by
 * picking a price, or being charged for choosing more screeners. They stay
 * separate until someone decides a plan should imply an assessment level.
 *
 * ─── THE UPGRADE ACTION IS DARK (COS-740) ────────────────────────────
 *
 * The button exists and is gated on `subscription_upgrade_enabled`, which is
 * FALSE on every stage. There is still no payment integration — cos-backend
 * has Stripe schema fields and nothing else.
 *
 * Shipping it dark rather than not shipping it means Stripe can be turned on
 * without another release. Shipping it LIVE would repeat SCRUM-319: a premium
 * surface that cannot transact is App Store Guideline 2.1 placeholder content,
 * and a button that self-assigned a paid plan would let any patient grant
 * themselves `advanced` for free.
 *
 * With the flag off the screen answers "what do I have, and what else exists",
 * which is useful and honest on its own.
 *
 * ─── iOS 26 ENVELOPE ─────────────────────────────────────────────────
 *
 * View / Text / ScrollView / Pressable / ActivityIndicator only. This app has
 * crashed in production from cold-mount rendering; a new screen is not the
 * place to introduce a primitive.
 */

import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { apiClient } from '@/lib/api-client';
import { priceLines } from '@/lib/plan-price';
import { useSubscriptionUpgradeFlag } from '@/hooks/use-subscription-upgrade-flag';
import { useAccessibility } from '@/stores/accessibility-store';
import { Colors } from '@/constants/theme';

// COS-723 has landed, so this screen gets the same boundary as every other
// route: a render error costs this screen, not the whole app.
export { ErrorBoundary } from '@/components/RouteErrorBoundary';

interface PlanCard {
  planKey: string;
  name: string;
  shortDescription: string | null;
  tier: string | null;
  pricing: { monthlyPriceCents: number | null; annualPriceCents: number | null; currency: string } | null;
  highlights: string[];
  isCurrent: boolean;
}

/**
 * A plan you can actually buy. Without a price there is nothing to charge, so
 * an upgrade button would lead to a checkout with no amount — internal and
 * care-team-assigned plans are exactly this case.
 */
function isPurchasable(plan: PlanCard): boolean {
  const m = plan.pricing?.monthlyPriceCents ?? null;
  const a = plan.pricing?.annualPriceCents ?? null;
  return (m !== null && m > 0) || (a !== null && a > 0);
}

/** COS-742 — the patient's current billing state, from the same call. */
export interface BillingSummary {
  planKey: string | null;
  planName: string | null;
  billingCycle: string | null;
  billingStatus: string | null;
  currentPeriodEnd: string | null;
  pricing: PlanCard['pricing'];
  trial: { endsAt: string | null; daysRemaining: number | null; convertsTo: string | null } | null;
}

async function fetchBilling(): Promise<{ plans: PlanCard[]; billing: BillingSummary | null }> {
  const res = await apiClient.get('/v1/patients/me/plans');
  const body = (res.data as { data?: { plans?: unknown; billing?: unknown } })?.data;
  return {
    plans: Array.isArray(body?.plans) ? (body.plans as PlanCard[]) : [],
    billing: (body?.billing as BillingSummary | null) ?? null,
  };
}

/** ISO → "20 Sep 2026". Returns null for absent or malformed dates. */
function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Plain-English billing status. The raw enum is written for admins
 * (`trial_expired`, `past_due`) and putting it in front of a patient is both
 * unclear and slightly alarming.
 */
function statusLabel(status: string | null): string | null {
  switch (status) {
    case 'active': return 'Active';
    case 'trial': return 'Free trial';
    case 'past_due': return 'Payment overdue';
    case 'canceled': return 'Cancelled';
    case 'expired': return 'Expired';
    case 'trial_expired': return 'Trial ended';
    default: return null;
  }
}

export default function BillingScreen() {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const upgradeEnabled = useSubscriptionUpgradeFlag();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];

  const { data, isLoading, isError } = useQuery({
    queryKey: ['patient-plans'],
    queryFn: fetchBilling,
    staleTime: 5 * 60 * 1000,
  });

  const plans = data?.plans ?? [];
  const billing = data?.billing ?? null;
  const renewal = formatDate(billing?.currentPeriodEnd ?? null);
  const status = statusLabel(billing?.billingStatus ?? null);

  return (
    <ScrollView style={[styles.screen, { backgroundColor: colors.background }]} contentContainerStyle={styles.content}>
      {/*
        COS-742 — a back arrow at the TOP.

        This screen previously had only a "Close" button at the BOTTOM of the
        scroll, below every plan card. With more than one plan it sat off the
        fold, so tapping a card from the Plan tab dropped people onto a screen
        with no visible way out. `headerShown: false` means there is no native
        chrome to fall back on either. Same pattern as about.tsx.
      */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Back">
          <Text style={{ color: colors.text, fontSize: getScaledFontSize(26) }}>{'\u2190'}</Text>
        </Pressable>
        <Text
          style={[styles.title, { color: colors.text, fontSize: getScaledFontSize(24), fontWeight: getScaledFontWeight(700) as never }]}
        >
          Billing
        </Text>
      </View>

      {/* Current billing state, above the shelf: what someone opened this
          screen to check is what they are on now, not what else exists. */}
      {!isLoading && billing?.planName && (
        <View style={[styles.current, { borderColor: colors.tint }]}>
          <Text style={[styles.currentLabel, { color: colors.tint, fontSize: getScaledFontSize(11) }]}>
            CURRENT PLAN
          </Text>
          <Text
            style={[styles.currentName, { color: colors.text, fontSize: getScaledFontSize(20), fontWeight: getScaledFontWeight(700) as never }]}
          >
            {billing.planName}
          </Text>

          {(() => {
            const { monthly, annual } = priceLines(billing.pricing);
            // Which figure to show follows the cycle they are actually billed
            // on; showing both would raise "so which am I paying?".
            const line = billing.billingCycle === 'annual' ? annual : monthly;
            return line ? (
              <Text style={[styles.currentPrice, { color: colors.text, fontSize: getScaledFontSize(16) }]}>
                {line}
              </Text>
            ) : (
              <Text style={[styles.currentPrice, { color: colors.text, fontSize: getScaledFontSize(16) }]}>
                No charge
              </Text>
            );
          })()}

          {status && (
            <Text style={[styles.metaRow, { color: colors.text, fontSize: getScaledFontSize(13) }]}>
              {`Status  ·  ${status}`}
            </Text>
          )}
          {renewal && (
            <Text style={[styles.metaRow, { color: colors.text, fontSize: getScaledFontSize(13) }]}>
              {`${billing.billingStatus === 'canceled' ? 'Access ends' : 'Renews'}  ·  ${renewal}`}
            </Text>
          )}
          {billing.trial?.daysRemaining != null && (
            <Text style={[styles.metaRow, { color: colors.text, fontSize: getScaledFontSize(13) }]}>
              {`Free trial  ·  ${String(billing.trial.daysRemaining)} day${billing.trial.daysRemaining === 1 ? '' : 's'} left`}
            </Text>
          )}

          {/* Said plainly rather than left to be discovered at a checkout. */}
          <Text style={[styles.currentNote, { color: colors.text, fontSize: getScaledFontSize(12) }]}>
            Billing is handled by your care team — you won&apos;t be charged in the app.
          </Text>
        </View>
      )}

      {plans.length > 0 && (
        <Text
          style={[styles.sectionHeading, { color: colors.text, fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(700) as never }]}
        >
          Available plans
        </Text>
      )}

      {isLoading && (
        <View style={styles.centre}>
          <ActivityIndicator color={colors.tint} />
        </View>
      )}

      {/* An empty list and a failed request read the same to a patient, so they
          get the same honest message rather than a scary error. */}
      {!isLoading && (isError || plans.length === 0) && (
        <Text style={[styles.body, { color: colors.text, fontSize: getScaledFontSize(15) }]}>
          Plan details aren&apos;t available right now. Your access is unchanged — please check back later.
        </Text>
      )}

      {plans.map((plan) => {
        const { monthly, annual, annualSavingPct } = priceLines(plan.pricing);
        return (
          <View
            key={plan.planKey}
            style={[
              styles.card,
              { borderColor: plan.isCurrent ? colors.tint : colors.border ?? '#E5E7EB' },
              plan.isCurrent && { borderWidth: 2 },
            ]}
          >
            <View style={styles.cardHead}>
              <Text
                style={[styles.planName, { color: colors.text, fontSize: getScaledFontSize(18), fontWeight: getScaledFontWeight(700) as never }]}
              >
                {plan.name}
              </Text>
              {plan.isCurrent && (
                <Text style={[styles.badge, { color: colors.tint, fontSize: getScaledFontSize(11) }]}>CURRENT</Text>
              )}
            </View>

            {/* No price means not-for-sale — say so rather than showing "$0". */}
            {monthly ? (
              <Text style={[styles.price, { color: colors.text, fontSize: getScaledFontSize(20), fontWeight: getScaledFontWeight(700) as never }]}>
                {monthly}
              </Text>
            ) : null}
            {annual ? (
              <Text style={[styles.sub, { color: colors.text, fontSize: getScaledFontSize(13) }]}>
                {annual}
                {annualSavingPct ? `  ·  save ${String(annualSavingPct)}%` : ''}
              </Text>
            ) : null}

            {plan.shortDescription ? (
              <Text style={[styles.body, { color: colors.text, fontSize: getScaledFontSize(14) }]}>
                {plan.shortDescription}
              </Text>
            ) : null}

            {plan.highlights.map((h) => (
              <Text key={h} style={[styles.bullet, { color: colors.text, fontSize: getScaledFontSize(14) }]}>
                {`✓  ${h}`}
              </Text>
            ))}

            {/* Dark until Stripe is wired — see the header. Never shown on the
                plan the patient already has: "Upgrade" to your own plan is
                the kind of detail that makes people distrust the whole screen. */}
            {upgradeEnabled && !plan.isCurrent && isPurchasable(plan) && (
              <Pressable
                onPress={() => router.push('/Home/billing-checkout' as never)}
                accessibilityRole="button"
                accessibilityLabel={`Upgrade to ${plan.name}`}
                style={[styles.upgrade, { backgroundColor: colors.tint }]}
              >
                <Text style={[styles.upgradeText, { fontSize: getScaledFontSize(15) }]}>
                  {`Upgrade to ${plan.name}`}
                </Text>
              </Pressable>
            )}
          </View>
        );
      })}

      {plans.length > 0 && (
        <Text style={[styles.footnote, { color: colors.text, fontSize: getScaledFontSize(12) }]}>
          Prices are shown in USD. Your care team can answer any billing question.
        </Text>
      )}

      <Pressable onPress={() => router.back()} style={[styles.back, { borderColor: colors.border ?? '#E5E7EB' }]} accessibilityRole="button">
        <Text style={[styles.backText, { color: colors.text, fontSize: getScaledFontSize(15) }]}>Close</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 20, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  backBtn: { paddingRight: 14, paddingVertical: 4 },
  title: {},
  current: { borderWidth: 2, borderRadius: 14, padding: 16, marginBottom: 22 },
  currentLabel: { letterSpacing: 1, fontWeight: '700', marginBottom: 4 },
  currentName: {},
  currentPrice: { marginTop: 6, fontWeight: '600' },
  metaRow: { marginTop: 6, opacity: 0.8 },
  currentNote: { marginTop: 12, opacity: 0.7, lineHeight: 17 },
  sectionHeading: { marginBottom: 10 },
  centre: { paddingVertical: 40, alignItems: 'center' },
  card: { borderWidth: 1, borderRadius: 14, padding: 16, marginBottom: 14 },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  planName: {},
  badge: { letterSpacing: 1, fontWeight: '700' },
  price: { marginTop: 8 },
  sub: { marginTop: 2, opacity: 0.75 },
  body: { marginTop: 8, lineHeight: 20 },
  bullet: { marginTop: 6, lineHeight: 20 },
  footnote: { marginTop: 4, marginBottom: 16, opacity: 0.7, textAlign: 'center' },
  upgrade: { marginTop: 14, borderRadius: 999, paddingVertical: 13, alignItems: 'center' },
  upgradeText: { color: '#FFFFFF', fontWeight: '700' },
  back: { borderWidth: 1, borderRadius: 999, paddingVertical: 12, alignItems: 'center' },
  backText: { fontWeight: '600' },
});

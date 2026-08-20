/**
 * COS-737 — the subscription screen: the plans an admin publishes, rendered.
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

async function fetchPlans(): Promise<PlanCard[]> {
  const res = await apiClient.get('/v1/patients/me/plans');
  const plans = (res.data as { data?: { plans?: unknown } })?.data?.plans;
  return Array.isArray(plans) ? (plans as PlanCard[]) : [];
}

export default function SubscriptionScreen() {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const upgradeEnabled = useSubscriptionUpgradeFlag();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];

  const { data, isLoading, isError } = useQuery({
    queryKey: ['patient-plans'],
    queryFn: fetchPlans,
    staleTime: 5 * 60 * 1000,
  });

  const plans = data ?? [];

  return (
    <ScrollView style={[styles.screen, { backgroundColor: colors.background }]} contentContainerStyle={styles.content}>
      <Text
        style={[styles.title, { color: colors.text, fontSize: getScaledFontSize(24), fontWeight: getScaledFontWeight(700) as never }]}
      >
        Your plan
      </Text>

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
                onPress={() => router.push('/Home/subscription-checkout' as never)}
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
          To change your plan, talk to your care team.
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
  title: { marginBottom: 16 },
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

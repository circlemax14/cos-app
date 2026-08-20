/**
 * COS-740 — the plan cards, rendered on the Plan tab.
 *
 * ─── WHY THIS EXISTS ─────────────────────────────────────────────────
 *
 * The subscription screen had exactly one entry point: a button on the
 * plan-type chooser, which is itself only reachable from a card that renders
 * AFTER a health plan exists. `health-plan.tsx` returns its "Generate your
 * Health Plan" empty state early, so a patient who had not generated one could
 * not reach their own plan or its price by any route in the app.
 *
 * This puts the cards on the Plan tab itself, in both states.
 *
 * ─── EVERYTHING HERE COMES FROM THE DASHBOARD ────────────────────────
 *
 * Name, description, price and highlights are all `PlanRow` fields an admin
 * edits via PATCH /admin/entitlements/plans/:key/card. Nothing on this card is
 * hardcoded, which is the entire point — the previous version of this surface
 * had its copy baked into the app, so nothing an admin changed ever reached a
 * patient.
 *
 * ─── FAILING QUIETLY IS THE RIGHT FAILURE ────────────────────────────
 *
 * The Plan tab's real job is the health plan. If the plans request fails, this
 * section renders NOTHING rather than an error — a patient looking for their
 * daily tasks should not meet a red box about billing. The subscription screen
 * itself reports the failure honestly, because there the plans are the point.
 *
 * ─── iOS 26 ENVELOPE ─────────────────────────────────────────────────
 *
 * View / Text / Pressable only. This app has crashed in production from
 * cold-mount rendering, and the Plan tab is a cold-mount surface.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { apiClient } from '@/lib/api-client';
import { priceLines } from '@/lib/plan-price';

export interface PatientPlanCard {
  planKey: string;
  name: string;
  shortDescription: string | null;
  tier: string | null;
  pricing: { monthlyPriceCents: number | null; annualPriceCents: number | null; currency: string } | null;
  highlights: string[];
  isCurrent: boolean;
}

async function fetchPlans(): Promise<PatientPlanCard[]> {
  const res = await apiClient.get('/v1/patients/me/plans');
  const plans = (res.data as { data?: { plans?: unknown } })?.data?.plans;
  return Array.isArray(plans) ? (plans as PatientPlanCard[]) : [];
}

/**
 * Shared query key with the subscription screen, so opening one and coming
 * back does not refetch, and an admin edit lands on both at the same time.
 */
export function usePatientPlans() {
  return useQuery({
    queryKey: ['patient-plans'],
    queryFn: fetchPlans,
    staleTime: 5 * 60 * 1000,
  });
}

interface Props {
  colors: { text: string; subtext?: string; tint: string; card?: string; border?: string };
  getScaledFontSize: (n: number) => number;
  getScaledFontWeight: (n: number) => number | string;
}

export default function PlanCardsSection({ colors, getScaledFontSize, getScaledFontWeight }: Props) {
  const { data, isError } = usePatientPlans();
  const plans = data ?? [];

  // Silent on failure and silent when empty — see header. There is no loading
  // spinner either: a placeholder that resolves to nothing is worse than the
  // section simply appearing once it has something to say.
  if (isError || plans.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <Text
        style={[
          styles.heading,
          { color: colors.text, fontSize: getScaledFontSize(18), fontWeight: getScaledFontWeight(700) as never },
        ]}
      >
        Your plan
      </Text>

      {plans.map((plan) => {
        const { monthly, annual, annualSavingPct } = priceLines(plan.pricing);
        return (
          <Pressable
            key={plan.planKey}
            onPress={() => router.push('/Home/billing' as never)}
            accessibilityRole="button"
            accessibilityLabel={`${plan.name}${plan.isCurrent ? ', your current plan' : ''}. Tap to see plan details.`}
            style={[
              styles.card,
              {
                backgroundColor: colors.card ?? 'transparent',
                borderColor: plan.isCurrent ? colors.tint : colors.border ?? '#E5E7EB',
              },
              plan.isCurrent && styles.cardCurrent,
            ]}
          >
            <View style={styles.head}>
              <Text
                style={[
                  styles.name,
                  { color: colors.text, fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(700) as never },
                ]}
              >
                {plan.name}
              </Text>
              {plan.isCurrent && (
                <Text style={[styles.badge, { color: colors.tint, fontSize: getScaledFontSize(10) }]}>CURRENT</Text>
              )}
            </View>

            {/* No price means not-for-sale — say nothing rather than "$0". */}
            {monthly ? (
              <Text
                style={[
                  styles.price,
                  { color: colors.text, fontSize: getScaledFontSize(18), fontWeight: getScaledFontWeight(700) as never },
                ]}
              >
                {monthly}
              </Text>
            ) : null}
            {annual ? (
              <Text style={[styles.sub, { color: colors.subtext ?? colors.text, fontSize: getScaledFontSize(12) }]}>
                {annual}
                {annualSavingPct ? `  ·  save ${String(annualSavingPct)}%` : ''}
              </Text>
            ) : null}

            {plan.shortDescription ? (
              <Text style={[styles.body, { color: colors.subtext ?? colors.text, fontSize: getScaledFontSize(13) }]}>
                {plan.shortDescription}
              </Text>
            ) : null}

            {/* Capped at three here; the subscription screen shows them all.
                A plan tile that runs longer than the health plan below it has
                the priorities backwards. */}
            {plan.highlights.slice(0, 3).map((h) => (
              <Text key={h} style={[styles.bullet, { color: colors.subtext ?? colors.text, fontSize: getScaledFontSize(13) }]}>
                {`✓  ${h}`}
              </Text>
            ))}
            {plan.highlights.length > 3 && (
              <Text style={[styles.more, { color: colors.tint, fontSize: getScaledFontSize(12) }]}>
                {`+${String(plan.highlights.length - 3)} more`}
              </Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  heading: { marginBottom: 10 },
  card: { borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 10 },
  cardCurrent: { borderWidth: 2 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  name: {},
  badge: { letterSpacing: 1, fontWeight: '700' },
  price: { marginTop: 6 },
  sub: { marginTop: 2, opacity: 0.75 },
  body: { marginTop: 6, lineHeight: 19 },
  bullet: { marginTop: 5, lineHeight: 19 },
  more: { marginTop: 6, fontWeight: '600' },
});

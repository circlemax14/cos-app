/**
 * COS-744 — the plan strip at the top of the Care Plan tab.
 *
 * ─── TWO STATES, BECAUSE THERE ARE TWO QUESTIONS ─────────────────────
 *
 * A patient who has NOT chosen a plan needs to choose one, so they get the
 * cards. A patient who HAS chosen needs their care plan, so they get a single
 * line naming their plan and a way to change it.
 *
 * COS-740 got this wrong: it rendered the full shelf unconditionally. Someone
 * already on Advanced opened their care plan every morning to a four-item
 * price list, and had to scroll past everything they had already bought to
 * reach today's tasks. Shopping is not what that tab is for once the shopping
 * is done.
 *
 * ─── AND IT FIXES A LAYOUT BUG ───────────────────────────────────────
 *
 * The "Generate your Health Plan" block below is `flex: 1` with
 * `minHeight: 500`, centred — it was written to own the whole screen. Stacking
 * ~600px of cards on top of it left the CTA floating in the middle of its own
 * empty box, with a large dead gap above. A one-line chip does not do that.
 *
 * ─── WHERE THE SHELF LIVES NOW ───────────────────────────────────────
 *
 * Billing. It is the screen about what you pay, which is what a price list is
 * for, and it already renders the same cards with an Upgrade action.
 *
 * ─── iOS 26 ENVELOPE ─────────────────────────────────────────────────
 *
 * View / Text / Pressable only. This app has crashed in production from
 * cold-mount rendering, and the Plan tab is a cold-mount surface.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { apiClient } from '@/lib/api-client';
import { priceLines } from '@/lib/plan-price';

export interface PatientPlanCard {
  status: string | null;
  icon: string | null;
  planKey: string;
  name: string;
  shortDescription: string | null;
  tier: string | null;
  pricing: { monthlyPriceCents: number | null; annualPriceCents: number | null; currency: string } | null;
  highlights: string[];
  isCurrent: boolean;
}

export interface BillingSummary {
  planKey: string | null;
  planName: string | null;
  billingCycle: string | null;
  billingStatus: string | null;
  currentPeriodEnd: string | null;
  pricing: PatientPlanCard['pricing'];
  trial: { endsAt: string | null; daysRemaining: number | null; convertsTo: string | null } | null;
}

async function fetchPlans(): Promise<{ plans: PatientPlanCard[]; billing: BillingSummary | null }> {
  const res = await apiClient.get('/v1/patients/me/plans');
  const body = (res.data as { data?: { plans?: unknown; billing?: unknown } })?.data;
  return {
    plans: Array.isArray(body?.plans) ? (body.plans as PatientPlanCard[]) : [],
    billing: (body?.billing as BillingSummary | null) ?? null,
  };
}

/**
 * Shared query key with the Billing screen, so moving between them does not
 * refetch and an admin's edit lands on both at once.
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

export default function PlanStatusSection({ colors, getScaledFontSize, getScaledFontWeight }: Props) {
  const { data, isError } = usePatientPlans();
  const plans = data?.plans ?? [];
  const billing = data?.billing ?? null;

  // Silent on failure — the Care Plan tab's job is the health plan, and
  // someone looking for today's tasks should not meet an error about billing.
  if (isError) return null;

  // ── Chosen: one line, then out of the way ──────────────────────────
  //
  // Keyed off the billing summary rather than a card's isCurrent flag: a
  // patient can be on a plan that is not for sale (free, or care-team
  // assigned), and those are filtered out of `plans` entirely. Reading
  // isCurrent would show such a patient the chooser they already used.
  if (billing?.planName) {
    return (
      <View style={styles.chipRow}>
        <View style={[styles.chip, { backgroundColor: colors.tint }]}>
          <Text style={[styles.chipText, { fontSize: getScaledFontSize(11) }]}>
            {billing.planName.toUpperCase()}
          </Text>
        </View>
        <Pressable
          onPress={() => router.push('/Home/billing' as never)}
          accessibilityRole="button"
          accessibilityLabel={`Your plan is ${billing.planName}. Tap to change plan or see billing.`}
          style={[styles.changeBtn, { borderColor: colors.border ?? '#E0E0E0' }]}
        >
          <Text style={[styles.changeText, { color: colors.tint, fontSize: getScaledFontSize(12) }]}>
            Change plan
          </Text>
        </Pressable>
      </View>
    );
  }

  // ── Not chosen: the shelf, because there is a choice to make ───────
  if (plans.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <Text
        style={[
          styles.heading,
          { color: colors.text, fontSize: getScaledFontSize(18), fontWeight: getScaledFontWeight(700) as never },
        ]}
      >
        Choose your plan
      </Text>
      <Text style={[styles.sub, { color: colors.subtext ?? colors.text, fontSize: getScaledFontSize(13) }]}>
        You can change it at any time.
      </Text>

      {plans.map((plan) => {
        const { monthly, annual, annualSavingPct } = priceLines(plan.pricing);
        // COS-753 — the prod chooser advertised Family as a disabled card with
        // a COMING SOON badge (COS-432). Same treatment, driven by the plan's
        // status from the dashboard rather than a hardcoded list in the app.
        const comingSoon = plan.status === 'coming-soon';

        return (
          <Pressable
            key={plan.planKey}
            onPress={() => {
              if (!comingSoon) router.push('/Home/billing' as never);
            }}
            disabled={comingSoon}
            accessibilityRole="button"
            accessibilityState={{ disabled: comingSoon }}
            accessibilityLabel={
              comingSoon
                ? `${plan.name} plan — coming soon. ${plan.shortDescription ?? ''}`
                : `${plan.name}. Tap to see details and choose.`
            }
            style={[
              styles.card,
              {
                backgroundColor: colors.card ?? 'transparent',
                borderColor: comingSoon ? (colors.text ?? '#11181C') + '20' : colors.border ?? '#E0E0E0',
              },
              comingSoon && styles.cardSoon,
            ]}
          >
            <View style={styles.cardHead}>
              <MaterialIcons
                name={(plan.icon ?? 'workspace-premium') as never}
                size={getScaledFontSize(26)}
                color={comingSoon ? colors.subtext ?? colors.text : colors.tint}
              />
              <Text
                style={[
                  styles.name,
                  { color: colors.text, fontSize: getScaledFontSize(18), fontWeight: getScaledFontWeight(700) as never },
                ]}
              >
                {plan.name}
              </Text>
              {comingSoon && (
                <Text style={[styles.soonBadge, { color: colors.subtext ?? colors.text, fontSize: getScaledFontSize(10) }]}>
                  COMING SOON
                </Text>
              )}
            </View>

            {/* A coming-soon tier has no price to quote, and inventing one
                would be a promise we have not made. */}
            {!comingSoon && monthly ? (
              <Text
                style={[
                  styles.price,
                  { color: colors.text, fontSize: getScaledFontSize(20), fontWeight: getScaledFontWeight(700) as never },
                ]}
              >
                {monthly}
              </Text>
            ) : null}
            {!comingSoon && annual ? (
              <Text style={[styles.annual, { color: colors.subtext ?? colors.text, fontSize: getScaledFontSize(12) }]}>
                {annual}
                {annualSavingPct ? `  ·  save ${String(annualSavingPct)}%` : ''}
              </Text>
            ) : null}

            {plan.shortDescription ? (
              <Text style={[styles.body, { color: colors.subtext ?? colors.text, fontSize: getScaledFontSize(13) }]}>
                {plan.shortDescription}
              </Text>
            ) : null}

            {plan.highlights.map((h) => (
              <Text key={h} style={[styles.bullet, { color: colors.subtext ?? colors.text, fontSize: getScaledFontSize(13) }]}>
                {`✓  ${h}`}
              </Text>
            ))}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  chipRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingTop: 12 },
  chip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  chipText: { color: '#FFFFFF', fontWeight: '700', letterSpacing: 0.8 },
  changeBtn: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 5 },
  changeText: { fontWeight: '600' },

  wrap: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  heading: { marginBottom: 2 },
  sub: { marginBottom: 12, opacity: 0.8 },
  card: { borderWidth: 1, borderRadius: 14, padding: 16, marginBottom: 12 },
  // Dashed + faded, exactly as the prod chooser rendered Family.
  cardSoon: { borderStyle: 'dashed', opacity: 0.7 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 6 },
  soonBadge: { letterSpacing: 0.8, fontWeight: '700' },
  name: { flex: 1 },
  price: { marginTop: 6 },
  annual: { marginTop: 2, opacity: 0.75 },
  body: { marginTop: 6, lineHeight: 19 },
  bullet: { marginTop: 5, lineHeight: 19 },
});

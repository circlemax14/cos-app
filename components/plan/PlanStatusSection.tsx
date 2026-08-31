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

import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { apiClient } from '@/lib/api-client';
import { priceLines } from '@/lib/plan-price';
import { useSubscriptionUpgradeFlag } from '@/hooks/use-subscription-upgrade-flag';
import { usePlanSelfSwitchFlag } from '@/hooks/use-plan-self-switch-flag';
import { usePaymentGateways } from '@/hooks/use-payment-gateways';
import { switchToPlan } from '@/services/api/patient-plans';
import { useQueryClient } from '@tanstack/react-query';

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
  /**
   * COS-788 — the patient is parked on the DEFAULT plan, i.e. nobody has
   * chosen. Optional so an app running against a backend that predates the
   * field falls back to the chip, which is the safe half: a stale app can
   * under-offer the chooser, never mis-state which plan someone is on.
   *
   * NOTE: this interface duplicates BillingSummary in
   * services/api/patient-plans.ts — COS-744 declared one here, COS-784 declared
   * another there, and both describe /v1/patients/me/plans. Worth collapsing
   * into one; not today.
   */
  isDefaultPlan?: boolean;
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
  // One open at a time. An accordion rather than per-card flags because the
  // whole point of collapsing the detail was to stop this section pushing the
  // daily tasks off the screen — several open at once puts it straight back.
  const [openKey, setOpenKey] = useState<string | null>(null);
  // Same gate the Billing screen uses. There is no payment integration, so
  // the subscribe controls ship dark on prod and live on dev.
  const subscribeEnabled = useSubscriptionUpgradeFlag();
  /*
   * COS-798 — "can they pay" is the SERVER's gateway list, not a flag.
   *
   * My first version keyed both of these off subscription_upgrade_enabled,
   * which was wrong. That flag means "the upgrade button is un-darked"; it
   * does not mean a patient can actually pay. On dev it has been true since
   * COS-740 while every gateway is off, and the result was two dead ends:
   *
   *   a PAID plan offered Subscribe, which routed to a screen saying payments
   *   are not available;
   *
   *   a FREE plan showed NOTHING — the Subscribe buttons need a price, Switch
   *   was suppressed by !subscribeEnabled, and the explanation was gated on
   *   the same flag.
   *
   * canPay comes from GET /v1/payments/gateways, which is the real answer:
   * a gateway that is enabled, legal for this platform, and configured. Both
   * controls hang off it, so exactly one of them shows and neither dead-ends.
   */
  const { canPay } = usePaymentGateways();
  const canSubscribe = subscribeEnabled && canPay;
  const canSwitch = usePlanSelfSwitchFlag() && !canPay;
  const queryClient = useQueryClient();
  const [switching, setSwitching] = useState<string | null>(null);
  const [switchError, setSwitchError] = useState<string | null>(null);

  async function onSwitch(planKey: string) {
    if (switching) return;
    setSwitching(planKey);
    setSwitchError(null);
    try {
      await switchToPlan(planKey);
      setOpenKey(null);
      await queryClient.invalidateQueries({ queryKey: ['patient-plans'] });
    } catch (err) {
      setSwitchError(
        err instanceof Error ? err.message : 'Could not change your plan. Please try again.',
      );
    } finally {
      setSwitching(null);
    }
  }
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
  //
  // COS-788 — keyed off isDefaultPlan, NOT "do they have a plan name".
  // COS-787 made the backend report the default plan for a patient who had
  // never chosen one, which is correct, but it meant every patient suddenly
  // had a planName and the chooser above vanished for first-time users. Being
  // parked on the default IS the un-chosen state; it just has a name now.
  if (billing?.planName && billing.isDefaultPlan !== true) {
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
        // The plan they are already on. Reads the server's flag rather than
        // comparing keys here — see PlanShelfCard.isCurrent.
        const current = plan.isCurrent === true;
        const open = openKey === plan.planKey;

        return (
          // A View, not a Pressable. Each card now carries its own explicit
          // "Upgrade to this plan" control, and a whole-card tap target on top
          // of that gives VoiceOver two ways to do one thing, one of them
          // unlabelled. The current plan has nothing to tap at all.
          <View
            key={plan.planKey}
            style={[
              styles.card,
              {
                // Transparent, so AppWrapper's background circles run behind
                // the cards instead of being clipped into squares by them.
                backgroundColor: 'transparent',
                borderColor: current
                  ? colors.tint
                  : comingSoon
                    ? (colors.text ?? '#11181C') + '20'
                    : colors.border ?? '#E0E0E0',
              },
              current && styles.cardCurrent,
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
              {current && (
                <View style={[styles.currentBadge, { backgroundColor: colors.tint }]}>
                  <Text style={[styles.currentBadgeText, { fontSize: getScaledFontSize(10) }]}>
                    YOUR PLAN
                  </Text>
                </View>
              )}
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

            {/* Your own plan lists what you get without asking. On the others
                it is the payload of the expander, so a shelf of four plans is
                four short cards rather than a wall the daily tasks sit below. */}
            {(current || open) &&
              plan.highlights.map((h) => (
                <Text key={h} style={[styles.bullet, { color: colors.subtext ?? colors.text, fontSize: getScaledFontSize(13) }]}>
                  {`✓  ${h}`}
                </Text>
              ))}

            {/* Nothing to upgrade to on the plan you hold, and a coming-soon
                tier cannot be chosen yet — so neither gets a control. */}
            {!current && !comingSoon && (
              <Pressable
                onPress={() => setOpenKey(open ? null : plan.planKey)}
                accessibilityRole="button"
                accessibilityState={{ expanded: open }}
                accessibilityLabel={
                  open
                    ? `Hide details for the ${plan.name} plan.`
                    : `Upgrade to the ${plan.name} plan. Shows what is included and how to subscribe.`
                }
                style={({ pressed }) => [
                  styles.upgradeBtn,
                  { backgroundColor: colors.tint, opacity: pressed ? 0.85 : 1 },
                ]}
              >
                <Text style={[styles.upgradeText, { fontSize: getScaledFontSize(14) }]}>
                  {open ? 'Hide details' : 'Upgrade to this plan'}
                </Text>
              </Pressable>
            )}

            {/* ── the expanded detail ─────────────────────────────────────
                Opens in place. It deliberately does NOT navigate: the whole
                value of the shelf is comparing plans side by side, and pushing
                a screen to read one of them throws that away. */}
            {!current && !comingSoon && open && (
              <View style={[styles.detail, { borderTopColor: colors.border ?? '#E0E0E0' }]}>
                {canSubscribe && monthly ? (
                  <Pressable
                    onPress={() =>
                      router.push({
                        pathname: '/Home/billing-checkout',
                        params: { planKey: plan.planKey, planName: plan.name, cycle: 'monthly' },
                      } as never)
                    }
                    accessibilityRole="button"
                    accessibilityLabel={`Subscribe to ${plan.name} monthly at ${monthly}.`}
                    style={({ pressed }) => [
                      styles.subscribeBtn,
                      { backgroundColor: colors.tint, opacity: pressed ? 0.85 : 1 },
                    ]}
                  >
                    <Text style={[styles.subscribeText, { fontSize: getScaledFontSize(14) }]}>
                      {`Subscribe monthly · ${monthly}`}
                    </Text>
                  </Pressable>
                ) : null}

                {/* Only offered when the plan actually has an annual price —
                    a second button quoting the monthly figure twice would be
                    a worse lie than having one button. */}
                {canSubscribe && annual ? (
                  <Pressable
                    onPress={() =>
                      router.push({
                        pathname: '/Home/billing-checkout',
                        params: { planKey: plan.planKey, planName: plan.name, cycle: 'annual' },
                      } as never)
                    }
                    accessibilityRole="button"
                    accessibilityLabel={
                      `Subscribe to ${plan.name} annually at ${annual}.` +
                      (annualSavingPct ? ` Saves ${String(annualSavingPct)} percent.` : '')
                    }
                    style={({ pressed }) => [
                      styles.subscribeBtnAlt,
                      { borderColor: colors.tint, opacity: pressed ? 0.85 : 1 },
                    ]}
                  >
                    <Text style={[styles.subscribeTextAlt, { color: colors.tint, fontSize: getScaledFontSize(14) }]}>
                      {`Subscribe annually · ${annual}${annualSavingPct ? `  ·  save ${String(annualSavingPct)}%` : ''}`}
                    </Text>
                  </Pressable>
                ) : null}

                {/* COS-797 — no payment in the loop: the patient just moves.
                    Offered only when Subscribe is NOT, so enabling payments
                    takes the free path off the screen. */}
                {canSwitch && (
                  <Pressable
                    onPress={() => void onSwitch(plan.planKey)}
                    disabled={switching !== null}
                    accessibilityRole="button"
                    accessibilityLabel={`Switch to the ${plan.name} plan`}
                    style={({ pressed }) => [
                      styles.subscribeBtn,
                      { backgroundColor: colors.tint, opacity: pressed || switching ? 0.7 : 1 },
                    ]}
                  >
                    <Text style={[styles.subscribeText, { fontSize: getScaledFontSize(14) }]}>
                      {switching === plan.planKey ? 'Switching…' : 'Switch to this plan'}
                    </Text>
                  </Pressable>
                )}

                {canSwitch && switchError !== null && (
                  <Text style={[styles.switchError, { fontSize: getScaledFontSize(13) }]}>
                    {switchError}
                  </Text>
                )}

                {/* Flag off: say why there is no button rather than showing a
                    dead one. Guideline 2.1 pulled a surface for less. */}
                {!canSubscribe && !canSwitch && (
                  <Text style={[styles.detailNote, { color: colors.subtext ?? colors.text, fontSize: getScaledFontSize(13) }]}>
                    Your care team can switch you to this plan — in-app subscribing is not available yet.
                  </Text>
                )}
              </View>
            )}
          </View>
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
  // The plan they are on: a heavier tinted edge, so it reads as selected at a
  // glance without a fill that would clip the background circles.
  cardCurrent: { borderWidth: 2 },
  currentBadge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  currentBadgeText: { color: '#FFFFFF', fontWeight: '700', letterSpacing: 0.8 },
  upgradeBtn: { marginTop: 14, borderRadius: 999, paddingVertical: 12, alignItems: 'center' },
  upgradeText: { color: '#FFFFFF', fontWeight: '700' },
  detail: { marginTop: 14, paddingTop: 14, borderTopWidth: 1, gap: 10 },
  subscribeBtn: { borderRadius: 999, paddingVertical: 12, alignItems: 'center' },
  subscribeText: { color: '#FFFFFF', fontWeight: '700' },
  subscribeBtnAlt: { borderWidth: 1, borderRadius: 999, paddingVertical: 12, alignItems: 'center' },
  subscribeTextAlt: { fontWeight: '700' },
  detailNote: { lineHeight: 19 },
  switchError: { color: '#B91C1C', lineHeight: 19 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 6 },
  soonBadge: { letterSpacing: 0.8, fontWeight: '700' },
  name: { flex: 1 },
  price: { marginTop: 6 },
  annual: { marginTop: 2, opacity: 0.75 },
  body: { marginTop: 6, lineHeight: 19 },
  bullet: { marginTop: 5, lineHeight: 19 },
});

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
import { serverMessage } from '@/lib/server-message';
import { useQueryClient } from '@tanstack/react-query';

export interface PatientPlanCard {
  status: string | null;
  icon: string | null;
  planKey: string;
  name: string;
  shortDescription: string | null;
  tier: string | null;
  pricing: {
    monthlyPriceCents: number | null;
    annualPriceCents: number | null;
    currency: string;
    /** COS-807 — an admin's own words, e.g. "Free forever". */
    displayPriceLabel?: string | null;
  } | null;
  /** COS-807 — length of the free trial, when the plan has one. */
  trialDays?: number | null;
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

/**
 * COS-801 — the two gates, in one place.
 *
 * The Care Plan tab needs `canSwitch` to decide whether to open on the plan
 * chooser (see `showPlanGate` in app/Home/health-plan.tsx). It was already
 * computed here; exporting it beats a second copy of the expressions that
 * can drift out of step with this one.
 */
export function usePlanChoiceControls(): { canSubscribe: boolean; canSwitch: boolean } {
  // Same gate the Billing screen uses. There is no payment integration, so
  // the subscribe controls ship dark on prod and live on dev.
  const subscribeEnabled = useSubscriptionUpgradeFlag();
  const selfSwitchEnabled = usePlanSelfSwitchFlag();
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
  return {
    canSubscribe: subscribeEnabled && canPay,
    canSwitch: selfSwitchEnabled && !canPay,
  };
}

interface Props {
  colors: { text: string; subtext?: string; tint: string; card?: string; border?: string };
  getScaledFontSize: (n: number) => number;
  getScaledFontWeight: (n: number) => number | string;
  /**
   * COS-801 — fired after a switch lands, so the Care Plan tab can close the
   * chooser and show the plan. "Once the plan is switched ... we will show
   * that original screen."
   */
  onSwitched?: () => void;
  /**
   * COS-801 — `chooser` keeps the full shelf up even for a patient who has
   * already picked, because that screen exists to be picked from. The default
   * `strip` is the COS-744 behaviour: cards until you choose, then one line.
   */
  variant?: 'strip' | 'chooser';
  /**
   * COS-806 — the way OUT of the chooser, rendered on the card that is
   * already yours.
   *
   * It used to be a pill floating in the top-right corner, which put the exit
   * nowhere near the thing it referred to: your plan is one of the cards, and
   * "go to your plan" is an instruction about that card. On it, the button
   * needs no context to make sense, and the card that has nothing else to
   * offer — you cannot switch to the plan you hold — becomes the one with the
   * clearest action.
   *
   * Omitted = no button. The Billing screen renders this same shelf and has
   * no plan to go to.
   */
  onGoToPlan?: () => void;
}

export default function PlanStatusSection({ colors, getScaledFontSize, getScaledFontWeight, onSwitched, variant = 'strip', onGoToPlan }: Props) {
  const { data, isError } = usePatientPlans();
  // One open at a time. An accordion rather than per-card flags because the
  // whole point of collapsing the detail was to stop this section pushing the
  // daily tasks off the screen — several open at once puts it straight back.
  const [openKey, setOpenKey] = useState<string | null>(null);
  const { canSubscribe, canSwitch } = usePlanChoiceControls();
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
      onSwitched?.();
    } catch (err) {
      setSwitchError(serverMessage(err, 'Could not change your plan. Please try again.'));
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
  //
  // COS-800 hung `&& !canSwitch` here, so that while payments were parked the
  // shelf never collapsed. That fixed a real ONE-WAY DOOR — leave the default
  // plan once and the chooser vanished — but it fixed it by parking a price
  // list on top of the care plan, which is the exact thing COS-744 removed.
  //
  // COS-801 moves the fix up a level: the Care Plan tab now OPENS on the
  // chooser whenever canSwitch is true, with "Go to your plan" one tap away.
  // The door stays open, and this strip goes back to being one line — so the
  // condition reverts to COS-788's.
  if (variant === 'strip' && billing?.planName && billing.isDefaultPlan !== true) {
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
        {billing?.isDefaultPlan === false ? 'Change your plan' : 'Choose your plan'}
      </Text>
      <Text style={[styles.sub, { color: colors.subtext ?? colors.text, fontSize: getScaledFontSize(13) }]}>
        You can change it at any time.
      </Text>

      {plans.map((plan) => {
        const { monthly, annual, annualSavingPct, label: priceLabel } = priceLines(plan.pricing);
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
            {/*
              COS-807 — the card, rebuilt to carry what the plan actually says.

              It rendered a name, a monthly figure and one line of description.
              Everything else the API sends — the tier, the admin's own price
              wording, the trial, the highlights — was either dropped on the
              floor by the client interface or hidden behind an expander. Four
              cards that all looked the same and told you almost nothing.

              The old hardcoded plan-type chooser read far better, and the
              reason is structure rather than content: an icon you can find the
              card by, a tinted badge, then labelled rows. Same language here,
              driven by real data.
            */}
            <View style={styles.cardHead}>
              <View
                style={[
                  styles.iconCircle,
                  {
                    backgroundColor:
                      (comingSoon ? (colors.subtext ?? colors.text) : (colors.tint as string)) + '18',
                  },
                ]}
              >
                <MaterialIcons
                  name={(plan.icon ?? 'workspace-premium') as never}
                  size={getScaledFontSize(22)}
                  color={comingSoon ? colors.subtext ?? colors.text : colors.tint}
                />
              </View>
              <View style={styles.headText}>
                <Text
                  style={{
                    color: colors.text,
                    fontSize: getScaledFontSize(18),
                    fontWeight: getScaledFontWeight(700) as never,
                  }}
                >
                  {plan.name}
                </Text>
                {/* The tier is the plan's shape in one word, and the shelf was
                    throwing it away entirely. */}
                {plan.tier ? (
                  <Text
                    style={[
                      styles.tier,
                      { color: colors.subtext ?? colors.text, fontSize: getScaledFontSize(10) },
                    ]}
                  >
                    {plan.tier.toUpperCase()}
                  </Text>
                ) : null}
              </View>
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
                would be a promise we have not made.

                COS-807: `priceLabel` is the admin's own wording and outranks
                the computed figure. Without it a free plan showed no price at
                all — the single biggest reason these cards read as empty. */}
            {!comingSoon && (priceLabel ?? monthly) ? (
              <Text
                style={[
                  styles.price,
                  { color: colors.text, fontSize: getScaledFontSize(20), fontWeight: getScaledFontWeight(700) as never },
                ]}
              >
                {priceLabel ?? monthly}
              </Text>
            ) : null}
            {/* When the admin wrote a label AND a figure exists, the figure
                becomes the supporting line rather than being lost. */}
            {!comingSoon && priceLabel && monthly ? (
              <Text style={[styles.annual, { color: colors.subtext ?? colors.text, fontSize: getScaledFontSize(12) }]}>
                {monthly}
              </Text>
            ) : null}
            {!comingSoon && annual ? (
              <Text style={[styles.annual, { color: colors.subtext ?? colors.text, fontSize: getScaledFontSize(12) }]}>
                {annual}
                {annualSavingPct ? `  ·  save ${String(annualSavingPct)}%` : ''}
              </Text>
            ) : null}
            {!comingSoon && typeof plan.trialDays === 'number' && plan.trialDays > 0 ? (
              <View style={[styles.trialPill, { backgroundColor: (colors.tint as string) + '18' }]}>
                <MaterialIcons name="schedule" size={getScaledFontSize(12)} color={colors.tint} />
                <Text
                  style={[
                    styles.trialText,
                    { color: colors.tint, fontSize: getScaledFontSize(11) },
                  ]}
                >
                  {`${String(plan.trialDays)}-day free trial`}
                </Text>
              </View>
            ) : null}

            {plan.shortDescription ? (
              <Text style={[styles.body, { color: colors.subtext ?? colors.text, fontSize: getScaledFontSize(13) }]}>
                {plan.shortDescription}
              </Text>
            ) : null}

            {/*
              COS-807 — what you get, visible without asking.

              COS-789 hid these behind the expander because the shelf then sat
              ON the care plan screen, above the daily tasks, and four open
              cards buried them. It is now its own screen whose entire job is
              choosing, so the reason is gone — and a card listing nothing is
              exactly what made these feel empty. The strip variant still
              collapses, because it is still inline above other content.
            */}
            {(variant === 'chooser' || current || open) && plan.highlights.length > 0 ? (
              <View style={styles.highlights}>
                {plan.highlights.map((h) => (
                  <View key={h} style={styles.highlightRow}>
                    <MaterialIcons
                      name="check-circle"
                      size={getScaledFontSize(15)}
                      color={comingSoon ? colors.subtext ?? colors.text : colors.tint}
                      style={styles.highlightIcon}
                    />
                    <Text
                      style={[
                        styles.highlightText,
                        { color: colors.text, fontSize: getScaledFontSize(13) },
                      ]}
                    >
                      {h}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}

            {/* COS-806 — your own card is where "go to your plan" belongs.
                It is also the only card with no other control: there is
                nothing to switch to on the plan you already hold. */}
            {current && onGoToPlan && (
              <Pressable
                onPress={onGoToPlan}
                accessibilityRole="button"
                accessibilityLabel={`Go to your ${plan.name} plan`}
                accessibilityHint="Closes the plan chooser and opens your care plan"
                style={({ pressed }) => [
                  styles.upgradeBtn,
                  styles.goRow,
                  { backgroundColor: colors.tint, opacity: pressed ? 0.85 : 1 },
                ]}
              >
                <Text style={[styles.upgradeText, { fontSize: getScaledFontSize(14) }]}>
                  Go to your plan
                </Text>
                <MaterialIcons
                  name="arrow-forward"
                  size={getScaledFontSize(16)}
                  color="#FFFFFF"
                  style={{ marginLeft: 6 }}
                />
              </Pressable>
            )}

            {/* Nothing to upgrade to on the plan you hold, and a coming-soon
                tier cannot be chosen yet — so neither gets a control. */}
            {/*
              COS-804 — the primary button DOES the thing it is named after.

              It used to read "Upgrade to this plan" and only expand a panel;
              the actual Switch control was one level down inside it. Vishal
              tapped it, nothing visible happened, and he went looking for
              another route out — the button promised an action and delivered
              a disclosure. The backend never even saw a request.

              When switching is the way plans change, the switch IS the
              primary action. Details move to a quiet secondary toggle, so
              COS-789's short shelf survives.

              When payments are on, the expander stays primary: monthly vs
              annual is a real choice that has to be made before there is
              anything to press.
            */}
            {!current && !comingSoon && canSwitch && (
              <Pressable
                onPress={() => void onSwitch(plan.planKey)}
                disabled={switching !== null}
                accessibilityRole="button"
                accessibilityLabel={`Switch to the ${plan.name} plan`}
                style={({ pressed }) => [
                  styles.upgradeBtn,
                  { backgroundColor: colors.tint, opacity: pressed || switching ? 0.7 : 1 },
                ]}
              >
                <Text style={[styles.upgradeText, { fontSize: getScaledFontSize(14) }]}>
                  {switching === plan.planKey ? 'Switching…' : 'Switch to this plan'}
                </Text>
              </Pressable>
            )}

            {!current && !comingSoon && (
              <Pressable
                onPress={() => setOpenKey(open ? null : plan.planKey)}
                accessibilityRole="button"
                accessibilityState={{ expanded: open }}
                accessibilityLabel={
                  open
                    ? `Hide details for the ${plan.name} plan.`
                    : canSwitch
                      ? `See what is included in the ${plan.name} plan.`
                      : `Upgrade to the ${plan.name} plan. Shows what is included and how to subscribe.`
                }
                style={({ pressed }) => [
                  canSwitch ? styles.detailsBtn : styles.upgradeBtn,
                  canSwitch
                    ? { opacity: pressed ? 0.7 : 1 }
                    : { backgroundColor: colors.tint, opacity: pressed ? 0.85 : 1 },
                ]}
              >
                <Text
                  style={
                    canSwitch
                      ? [styles.detailsText, { color: colors.tint, fontSize: getScaledFontSize(13) }]
                      : [styles.upgradeText, { fontSize: getScaledFontSize(14) }]
                  }
                >
                  {open ? 'Hide details' : canSwitch ? "What's included" : 'Upgrade to this plan'}
                </Text>
              </Pressable>
            )}

            {/* The error belongs beside the button that failed, not inside a
                panel the patient may never open. */}
            {canSwitch && switching === null && switchError !== null && (
              <Text style={[styles.switchError, { fontSize: getScaledFontSize(13) }]}>
                {switchError}
              </Text>
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

                {/* COS-804 — the Switch control moved OUT of here and onto the
                    card, where the label already promised it. Two of them
                    would be VoiceOver reading the same action twice. */}

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

      {/*
        COS-806 — the exit, when no card can host it.

        `onGoToPlan` normally rides the card badged YOUR PLAN, and the backend
        exempts the current plan from BOTH shelf filters (isPurchasable and
        isVisibleTo) so that card is nearly always there. Nearly: retire the
        plan row an admin has a patient on and it stops existing, every card
        reads isCurrent false, and the button has nowhere to live.

        That would leave someone standing in a chooser with no way out — the
        one failure this surface has produced four times already, and most
        likely exactly while an admin is editing plans, which is what this tab
        is for. Ten lines is cheaper than finding out.
      */}
      {onGoToPlan && !plans.some((p) => p.isCurrent === true) && (
        <Pressable
          onPress={onGoToPlan}
          accessibilityRole="button"
          accessibilityLabel="Go to your plan"
          accessibilityHint="Closes the plan chooser and opens your care plan"
          style={({ pressed }) => [
            styles.upgradeBtn,
            styles.goRow,
            { backgroundColor: colors.tint, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Text style={[styles.upgradeText, { fontSize: getScaledFontSize(14) }]}>
            Go to your plan
          </Text>
          <MaterialIcons
            name="arrow-forward"
            size={getScaledFontSize(16)}
            color="#FFFFFF"
            style={{ marginLeft: 6 }}
          />
        </Pressable>
      )}
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
  // Quiet by design — it discloses, it does not act.
  detailsBtn: { marginTop: 8, paddingVertical: 8, alignItems: 'center' },
  goRow: { flexDirection: 'row', justifyContent: 'center' },
  detailsText: { fontWeight: '600' },
  upgradeText: { color: '#FFFFFF', fontWeight: '700' },
  detail: { marginTop: 14, paddingTop: 14, borderTopWidth: 1, gap: 10 },
  subscribeBtn: { borderRadius: 999, paddingVertical: 12, alignItems: 'center' },
  subscribeText: { color: '#FFFFFF', fontWeight: '700' },
  subscribeBtnAlt: { borderWidth: 1, borderRadius: 999, paddingVertical: 12, alignItems: 'center' },
  subscribeTextAlt: { fontWeight: '700' },
  detailNote: { lineHeight: 19 },
  switchError: { color: '#B91C1C', lineHeight: 19 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 6 },
  // A findable anchor per card — the old chooser's cards read better largely
  // because you could tell them apart at a glance.
  iconCircle: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  headText: { flex: 1 },
  tier: { fontWeight: '700', letterSpacing: 0.8, marginTop: 2, opacity: 0.8 },
  trialPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
    marginTop: 8,
    gap: 4,
  },
  trialText: { fontWeight: '700' },
  highlights: { marginTop: 10, gap: 7 },
  highlightRow: { flexDirection: 'row', alignItems: 'flex-start' },
  highlightIcon: { marginTop: 1 },
  highlightText: { flex: 1, marginLeft: 8, lineHeight: 19 },
  soonBadge: { letterSpacing: 0.8, fontWeight: '700' },
  price: { marginTop: 6 },
  annual: { marginTop: 2, opacity: 0.75 },
  body: { marginTop: 6, lineHeight: 19 },
});

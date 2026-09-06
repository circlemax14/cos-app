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

import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppWrapper } from '@/components/app-wrapper';
import { Linking } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import {
  cancelSubscription,
  resumeSubscription,
  fetchPaymentHistory,
  formatPaymentAmount,
} from '@/services/api/payments';
import { usePaymentGateways } from '@/hooks/use-payment-gateways';
import { usePlanSelfSwitchFlag } from '@/hooks/use-plan-self-switch-flag';
import { switchToPlan } from '@/services/api/patient-plans';
import { serverMessage } from '@/lib/server-message';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { apiClient } from '@/lib/api-client';
import { planChoice, priceLines } from '@/lib/plan-price';
import { useSubscriptionUpgradeFlag } from '@/hooks/use-subscription-upgrade-flag';
import { useAccessibility } from '@/stores/accessibility-store';
import { Colors } from '@/constants/theme';
import { useCanRender } from '@/hooks/use-entitlement';

// COS-723 has landed, so this screen gets the same boundary as every other
// route: a render error costs this screen, not the whole app.
export { ErrorBoundary } from '@/components/RouteErrorBoundary';

interface PlanCard {
  planKey: string;
  name: string;
  shortDescription: string | null;
  tier: string | null;
  pricing: {
    monthlyPriceCents: number | null;
    annualPriceCents: number | null;
    currency: string;
    /** COS-925 — needed by planChoice; a plan priced in words is not free. */
    displayPriceLabel?: string | null;
  } | null;
  highlights: string[];
  isCurrent: boolean;
  /**
   * COS-925 — this card type had NO status, so the screen could not tell a
   * coming-soon plan from any other. It did not matter while Switch was gated
   * on `isPurchasable` (coming-soon plans are unpriced, so they fell out by
   * accident); the moment COS-924 inverted that predicate, "Switch to this
   * plan" appeared on plans that are not yet available. The server sends it.
   */
  status?: string | null;
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
  /**
   * COS-792 — they asked to stop renewing, and when it actually ends.
   *
   * NOTE: this is the THIRD declaration of this shape in the app —
   * components/plan/PlanStatusSection.tsx and services/api/patient-plans.ts
   * have the other two, all describing /v1/patients/me/plans. Every field
   * added to the endpoint now has to be added in three places, which is
   * exactly how they drift. Collapsing them is overdue.
   */
  cancelAtPeriodEnd?: boolean;
  cancelEffectiveAt?: string | null;
  isDefaultPlan?: boolean;
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
  const canView = useCanRender('billing.view');
  const canCheckout = useCanRender('billing.checkout');
  const canCancel = useCanRender('billing.cancel');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['patient-plans'],
    queryFn: fetchBilling,
    staleTime: 5 * 60 * 1000,
  });

  const plans = data?.plans ?? [];
  const billing = data?.billing ?? null;
  const renewal = formatDate(billing?.currentPeriodEnd ?? null);
  const status = statusLabel(billing?.billingStatus ?? null);

  /*
   * COS-792 — cancelling ends the plan at the END of the paid period, never
   * today. So a patient mid-cancellation is still fully entitled, and the only
   * honest thing to show them is the date. `cancelAtPeriodEnd` without
   * `cancelEffectiveAt` would read as "cancelled" to someone who has eleven
   * months left.
   */
  const queryClient = useQueryClient();

  /*
   * COS-799 — this screen is where plan management actually happens.
   *
   * The Care Plan tab shows a one-line chip once a patient has chosen a plan
   * (COS-788, and still right — that tab is about today's care, not shopping).
   * Its "Change plan" button lands HERE. So if switching is not possible here,
   * a patient who switches once can never switch again: the chooser is gone
   * from the Plan tab and this screen only offered a dead Upgrade button.
   *
   * Same canPay rule as the shelf (COS-798): the gateway list is the truth
   * about whether anyone can pay, not the un-darkening flag.
   */
  const { canPay } = usePaymentGateways();
  const canSubscribe = upgradeEnabled && canPay;
  /*
   * COS-924 — `&& !canPay` dropped, exactly as on the shelf.
   *
   * This screen renders the same cards as PlanStatusSection, and had the same
   * platform-wide exclusivity: switching on a gateway set canPay, which
   * silenced Switch on EVERY card including the free ones. Which control a
   * card gets is a question about that PLAN's price, not about whether the
   * platform can take money at all — see isPurchasable below.
   */
  const canSwitch = usePlanSelfSwitchFlag();
  const [switching, setSwitching] = useState<string | null>(null);

  async function onSwitchPlan(planKey: string) {
    if (switching) return;
    setSwitching(planKey);
    setNotice(null);
    try {
      const r = await switchToPlan(planKey);
      setNotice(`You are now on ${r.planName ?? r.planKey}.`);
      await queryClient.invalidateQueries({ queryKey: ['patient-plans'] });
    } catch (err) {
      setNotice(serverMessage(err, 'Could not change your plan. Please try again.'));
    } finally {
      setSwitching(null);
    }
  }

  const cancelling = billing?.cancelAtPeriodEnd === true;
  const endsOn = formatDate(billing?.cancelEffectiveAt ?? null);
  const [busy, setBusy] = useState<null | 'cancel' | 'resume'>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const history = useQuery({
    queryKey: ['payment-history'],
    queryFn: fetchPaymentHistory,
    staleTime: 60_000,
  });

  async function onCancel() {
    if (busy) return;
    setBusy('cancel');
    setNotice(null);
    try {
      const out = await cancelSubscription();
      setNotice(out.message);
      // Apple and Google cannot be cancelled from a server — the patient has
      // to finish in the store, so send them straight there rather than
      // leaving a message they have to act on later.
      if (!out.scheduled && out.manageUrl) {
        const can = await Linking.canOpenURL(out.manageUrl);
        if (can) await Linking.openURL(out.manageUrl);
      }
      await queryClient.invalidateQueries({ queryKey: ['patient-plans'] });
    } catch (err) {
      setNotice(serverMessage(err, 'Could not cancel. Please try again.'));
    } finally {
      setBusy(null);
    }
  }

  async function onResume() {
    if (busy) return;
    setBusy('resume');
    setNotice(null);
    try {
      await resumeSubscription();
      setNotice('Your plan will keep renewing.');
      await queryClient.invalidateQueries({ queryKey: ['patient-plans'] });
    } catch (err) {
      setNotice(serverMessage(err, 'Could not resume. Please try again.'));
    } finally {
      setBusy(null);
    }
  }

  return (
    // COS-788 — the hamburger / logo / accessibility chrome every other screen
    // has. This was the only plan surface without it: about.tsx and plans.tsx
    // both wrap, billing did not, so opening it from the Care Plan tab dropped
    // you somewhere that did not look like the rest of the app.
    //
    // No backgroundColor here on purpose — AppWrapper paints it and then draws
    // the brand circles on top, so an opaque fill below would clip them.
    <AppWrapper>
      {canView && (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
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

          {/* COS-792 — the date is the message. "Cancelled" on its own would
              alarm someone who still has the whole period left. */}
          {cancelling && (
            <Text style={[styles.endsOn, { fontSize: getScaledFontSize(13) }]}>
              {endsOn
                ? `Ends on ${endsOn} · you keep everything until then`
                : 'Your plan will not renew · you keep everything until the end of the period'}
            </Text>
          )}

          {cancelling && (
            <Pressable
              onPress={() => void onResume()}
              disabled={busy !== null}
              accessibilityRole="button"
              accessibilityLabel="Keep my plan and continue renewing"
              style={[styles.manageBtn, { borderColor: colors.tint, opacity: busy ? 0.6 : 1 }]}
            >
              <Text style={[styles.manageText, { color: colors.tint, fontSize: getScaledFontSize(14) }]}>
                {busy === 'resume' ? 'Working…' : 'Keep my plan'}
              </Text>
            </Pressable>
          )}

          {/* No cancel control on the free default — there is nothing to
              cancel, and offering one implies there is something to lose. */}
          {canCancel && !cancelling && !billing.isDefaultPlan && (
            <Pressable
              onPress={() => void onCancel()}
              disabled={busy !== null}
              accessibilityRole="button"
              accessibilityLabel="Cancel my subscription at the end of the paid period"
              style={[styles.manageBtn, { borderColor: colors.border ?? '#E5E7EB', opacity: busy ? 0.6 : 1 }]}
            >
              <Text style={[styles.manageText, { color: colors.text, fontSize: getScaledFontSize(14) }]}>
                {busy === 'cancel' ? 'Working…' : 'Cancel subscription'}
              </Text>
            </Pressable>
          )}

          {notice !== null && (
            <Text style={[styles.notice, { color: colors.text, fontSize: getScaledFontSize(13) }]}>
              {notice}
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

            {/* Never shown on the plan the patient already has: "Upgrade" to
                your own plan is the kind of detail that makes people distrust
                the whole screen.

                COS-924 — `isPurchasable` was INVERTED here. Switch was offered
                only on plans that COST MONEY, and the free plans — the only
                ones a patient can actually move themselves onto without paying
                — were the ones it hid. Combined with the `!canPay` above, a
                free plan on this screen had no control at all. Vishal:
                "the plans where we have not configured any payment ... I can
                directly switch to those plans. So there should not be any
                restrictions." */}
            {canSwitch && !plan.isCurrent && planChoice(plan.pricing).isFree && plan.status !== 'coming-soon' && (
              <Pressable
                onPress={() => void onSwitchPlan(plan.planKey)}
                disabled={switching !== null}
                accessibilityRole="button"
                accessibilityLabel={`Switch to ${plan.name}`}
                style={[styles.upgrade, { backgroundColor: colors.tint, opacity: switching ? 0.6 : 1 }]}
              >
                <Text style={[styles.upgradeText, { fontSize: getScaledFontSize(15) }]}>
                  {switching === plan.planKey ? 'Switching…' : `Switch to ${plan.name}`}
                </Text>
              </Pressable>
            )}

            {canCheckout && canSubscribe && !plan.isCurrent && planChoice(plan.pricing).costsMoney && plan.status !== 'coming-soon' && (
              <Pressable
                /* COS-924 — carries the plan and the cycle. It pushed the
                   checkout with NO params at all, so the screen it landed on
                   could not name the plan being bought, let alone charge for
                   it. Monthly is the cycle this button's own label implies. */
                onPress={() =>
                  router.push({
                    pathname: '/Home/billing-checkout',
                    params: { planKey: plan.planKey, planName: plan.name, cycle: 'monthly' },
                  } as never)
                }
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

      {/* COS-791 — what they have actually been charged. A subscription screen
          without a receipt list is where "was I charged twice?" becomes a
          support message. */}
      {(history.data?.length ?? 0) > 0 && (
        <View style={{ marginTop: 8, marginBottom: 20 }}>
          <Text
            style={[styles.sectionHeading, { color: colors.text, fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(700) as never }]}
          >
            Payment history
          </Text>
          {history.data?.map((h) => (
            <View
              key={h.paymentId}
              style={[styles.historyRow, { borderBottomColor: colors.border ?? '#E5E7EB' }]}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.historyPlan, { color: colors.text, fontSize: getScaledFontSize(14) }]}>
                  {h.planName}
                </Text>
                <Text style={[styles.historyMeta, { color: colors.text, fontSize: getScaledFontSize(12) }]}>
                  {`${formatDate(h.createdAt) ?? ''}  ·  ${h.cycle}${h.status === 'succeeded' ? '' : `  ·  ${h.status}`}`}
                </Text>
              </View>
              <Text style={[styles.historyAmount, { color: colors.text, fontSize: getScaledFontSize(14) }]}>
                {formatPaymentAmount(h.amountCents, h.currency)}
              </Text>
            </View>
          ))}
        </View>
      )}

      <Pressable onPress={() => router.back()} style={[styles.back, { borderColor: colors.border ?? '#E5E7EB' }]} accessibilityRole="button">
        <Text style={[styles.backText, { color: colors.text, fontSize: getScaledFontSize(15) }]}>Close</Text>
      </Pressable>
      </ScrollView>
      )}
    </AppWrapper>
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
  endsOn: { marginTop: 10, color: '#B45309', fontWeight: '600', lineHeight: 19 },
  manageBtn: { marginTop: 12, borderWidth: 1, borderRadius: 999, paddingVertical: 11, alignItems: 'center' },
  manageText: { fontWeight: '600' },
  notice: { marginTop: 10, lineHeight: 19, opacity: 0.85 },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, borderBottomWidth: 1 },
  historyPlan: { fontWeight: '600' },
  historyMeta: { marginTop: 2, opacity: 0.7 },
  historyAmount: { fontWeight: '700' },
  back: { borderWidth: 1, borderRadius: 999, paddingVertical: 12, alignItems: 'center' },
  backText: { fontWeight: '600' },
});

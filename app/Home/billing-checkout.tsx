/**
 * COS-742 — the checkout seam (renamed from subscription-checkout).
 *
 * ─── WHY THIS EXISTS AS A REAL SCREEN ────────────────────────────────
 *
 * The Upgrade button on the subscription screen is gated on
 * `subscription_upgrade_enabled`, which is FALSE everywhere. A dark button
 * pointing at a route that does not exist would mean the flag could never be
 * flipped without crashing the app — the gate would look ready and would not
 * be. This screen makes the flag genuinely flippable.
 *
 * ─── WHAT IS ACTUALLY MISSING ────────────────────────────────────────
 *
 * Everything server-side. cos-backend has Stripe SCHEMA FIELDS
 * (`stripeSubscriptionId`, `stripeProductId`, `stripeMonthlyPriceId`) and
 * nothing else: no SDK dependency, no API keys in SSM, no checkout-session
 * endpoint, no webhook handler to turn a completed payment into a plan
 * assignment.
 *
 * When that lands, this screen's job is to POST for a Checkout Session and
 * open the returned URL. Until then it says so plainly rather than pretending.
 *
 * ─── AND ONE PRODUCT DECISION BEFORE ANY OF IT ───────────────────────
 *
 * Apple Guideline 3.1.1 requires In-App Purchase for digital content consumed
 * in the app. Stripe checkout inside the binary is the case Apple rejects most
 * often. Raised when Stripe was chosen; restated here because this file is
 * where that decision becomes code.
 *
 * ─── iOS 26 ENVELOPE ─────────────────────────────────────────────────
 *
 * View / Text / Pressable only.
 */

import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { usePaymentGateways } from '@/hooks/use-payment-gateways';
import { launchPurchase, describeOutcome } from '@/lib/launch-purchase';
import { router, useLocalSearchParams } from 'expo-router';
import { useAccessibility } from '@/stores/accessibility-store';
import { Colors } from '@/constants/theme';

export { ErrorBoundary } from '@/components/RouteErrorBoundary';

export default function BillingCheckoutScreen() {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];

  /*
   * COS-789 — the shelf now sends WHICH plan and WHICH billing cycle. Nothing
   * here can act on them yet, but naming them back is the difference between
   * "this app ignored what I tapped" and "this app understood me and cannot
   * finish". Subscribe-monthly and subscribe-annually are two different
   * requests, and a screen that answers both identically reads as broken.
   *
   * When the Checkout Session endpoint lands these are exactly the two values
   * it needs, so they are already being carried.
   */
  const { planKey, planName, cycle } = useLocalSearchParams<{
    planKey?: string;
    planName?: string;
    cycle?: string;
  }>();
  const cycleLabel = cycle === 'annual' ? 'annually' : cycle === 'monthly' ? 'monthly' : null;

  /*
   * COS-791 — the screen now attempts a real purchase when a gateway is live.
   *
   * `canPay` is FALSE while the query is loading and false on error, so the
   * honest "not available yet" copy below is what renders by default. A
   * Subscribe button that cannot complete is worse than none — and on iOS a
   * premium surface that cannot transact is exactly what Guideline 2.1 pulled
   * the Services entry for (SCRUM-319).
   */
  const { gateways, isLoading: gatewaysLoading, canPay } = usePaymentGateways();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function onSubscribe() {
    const gateway = gateways[0];
    if (!gateway || !planKey || busy) return;
    setBusy(true);
    setProblem(null);
    try {
      const outcome = await launchPurchase({
        gateway: gateway.id,
        planKey,
        cycle: cycle === 'annual' ? 'annual' : 'monthly',
      });
      // 'opened-external' means the system browser has taken over; saying
      // anything here would talk over it. The other two need explaining.
      if (outcome.status !== 'opened-external') {
        setProblem(describeOutcome(outcome));
      }
    } catch (err) {
      setProblem(
        err instanceof Error ? err.message : 'Could not start checkout. Please try again, or ask your care team.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Text
        style={[
          styles.title,
          { color: colors.text, fontSize: getScaledFontSize(20), fontWeight: getScaledFontWeight(700) as never },
        ]}
      >
        Payments aren&apos;t available yet
      </Text>
      {planName ? (
        <Text style={[styles.chosen, { color: colors.text, fontSize: getScaledFontSize(15) }]}>
          {cycleLabel ? `${planName} · billed ${cycleLabel}` : planName}
        </Text>
      ) : null}
      {canPay && (
        <Text style={[styles.body, { color: colors.text, fontSize: getScaledFontSize(15) }]}>
          You&apos;ll finish subscribing securely in your browser, then come straight back here.
        </Text>
      )}
      {canPay && (
        <Pressable
          onPress={() => void onSubscribe()}
          disabled={busy || !planKey}
          accessibilityRole="button"
          accessibilityState={{ disabled: busy || !planKey, busy }}
          accessibilityLabel={`Subscribe to ${planName ?? 'this plan'}${cycleLabel ? `, billed ${cycleLabel}` : ''}`}
          style={({ pressed }) => [
            styles.subscribe,
            { backgroundColor: colors.tint, opacity: pressed || busy || !planKey ? 0.7 : 1 },
          ]}
        >
          {/* A Text label rather than a spinner: this screen is inside the
              iOS 26 primitive envelope (View / Text / Pressable only), and
              the envelope exists because this app has crashed in production
              from cold-mount rendering. */}
          <Text style={[styles.subscribeText, { fontSize: getScaledFontSize(15) }]}>
            {busy ? 'Opening…' : 'Subscribe'}
          </Text>
        </Pressable>
      )}
      {!canPay && (
        <Text style={[styles.body, { color: colors.text, fontSize: getScaledFontSize(15) }]}>
          {gatewaysLoading
            ? 'Checking payment options…'
            : "We can't take payment in the app just yet. To change your plan, talk to your care team — they can move you over straight away."}
        </Text>
      )}
      {problem !== null && (
        <Text style={[styles.problem, { fontSize: getScaledFontSize(13) }]}>{problem}</Text>
      )}
      <Pressable
        onPress={() => router.back()}
        accessibilityRole="button"
        style={[styles.back, { borderColor: colors.border ?? '#E5E7EB' }]}
      >
        <Text style={[styles.backText, { color: colors.text, fontSize: getScaledFontSize(15) }]}>Go back</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 24, justifyContent: 'center' },
  title: { marginBottom: 10, textAlign: 'center' },
  chosen: { textAlign: 'center', marginBottom: 14, fontWeight: '700' },
  body: { lineHeight: 22, textAlign: 'center', marginBottom: 28 },
  subscribe: { borderRadius: 999, paddingVertical: 14, alignItems: 'center', marginBottom: 14 },
  subscribeText: { color: '#FFFFFF', fontWeight: '700' },
  problem: { color: '#B91C1C', textAlign: 'center', marginBottom: 14, lineHeight: 19 },
  back: { borderWidth: 1, borderRadius: 999, paddingVertical: 12, alignItems: 'center' },
  backText: { fontWeight: '600' },
});

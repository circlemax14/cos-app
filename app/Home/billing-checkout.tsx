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

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
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
  const { planName, cycle } = useLocalSearchParams<{ planName?: string; cycle?: string }>();
  const cycleLabel = cycle === 'annual' ? 'annually' : cycle === 'monthly' ? 'monthly' : null;

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
      <Text style={[styles.body, { color: colors.text, fontSize: getScaledFontSize(15) }]}>
        We can&apos;t take payment in the app just yet. To change your plan, talk to your care team — they can move
        you over straight away.
      </Text>
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
  back: { borderWidth: 1, borderRadius: 999, paddingVertical: 12, alignItems: 'center' },
  backText: { fontWeight: '600' },
});

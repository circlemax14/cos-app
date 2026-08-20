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
import { router } from 'expo-router';
import { useAccessibility } from '@/stores/accessibility-store';
import { Colors } from '@/constants/theme';

export { ErrorBoundary } from '@/components/RouteErrorBoundary';

export default function BillingCheckoutScreen() {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];

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
  body: { lineHeight: 22, textAlign: 'center', marginBottom: 28 },
  back: { borderWidth: 1, borderRadius: 999, paddingVertical: 12, alignItems: 'center' },
  backText: { fontWeight: '600' },
});

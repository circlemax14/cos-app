/**
 * COS-742 / COS-793 — the checkout seam, and the one question it asks.
 *
 * ─── WHAT THIS SCREEN IS FOR ─────────────────────────────────────────
 *
 * The shelf sends WHICH plan and WHICH billing cycle. This screen adds the
 * third thing a subscription needs: HOW. Vishal's ask, verbatim, is that
 * tapping switch-to-plan offers Apple or Stripe on iOS and Play or Stripe on
 * Android, with each gateway independently switchable from the dashboard.
 *
 * ─── THE CLIENT DECIDES NOTHING ──────────────────────────────────────
 *
 * Which gateways exist for this platform right now is a server answer
 * (GET /v1/payments/gateways, re-checked on every /start). Nothing here adds
 * to that list, reorders it, or infers it from Platform.OS — a platform rule
 * in client code is an App Store rejection waiting for a refactor. The screen
 * renders what came back and nothing else.
 *
 * ─── AND IT NEVER ASKS A QUESTION WITH ONE ANSWER ────────────────────
 *
 * Three states, from usePaymentMethods:
 *
 *   choose  more than one way to pay → ask, one button each
 *   single  exactly one → do NOT ask. Name it, and offer the one button.
 *   none    no way to pay in this build → say so plainly, in words that tell
 *           the patient what to do instead, and render NO pay button at all.
 *
 * A method the server offered that this BUILD cannot complete (StoreKit and
 * Play Billing are native modules and this binary has neither) is listed with
 * its reason rather than hidden: an option that silently vanishes reads as a
 * broken app, and a button that silently does nothing is worse than both.
 *
 * ─── iOS 26 ENVELOPE ─────────────────────────────────────────────────
 *
 * View / Text / Pressable only. Hooks unconditional, before any branch. Every
 * conditional a plain {cond && <X />}. This app has crashed in production on
 * cold mount (ADR-0003) and a payment screen is not where to find out again.
 */

import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { usePaymentMethods, type PaymentMethod } from '@/hooks/use-payment-methods';
import { useAccessibility } from '@/stores/accessibility-store';
import { Colors } from '@/constants/theme';

export { ErrorBoundary } from '@/components/RouteErrorBoundary';

export default function BillingCheckoutScreen() {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];

  /*
   * COS-789 — subscribe-monthly and subscribe-annually are two different
   * requests, and a screen that answers both identically reads as broken.
   *
   * planKey can legitimately be absent: billing.tsx pushes this route from
   * Upgrade without picking a plan first. That is a different failure from
   * "no way to pay" and gets its own sentence.
   */
  const { planKey, planName, cycle } = useLocalSearchParams<{
    planKey?: string;
    planName?: string;
    cycle?: string;
  }>();
  const billingCycle = cycle === 'annual' ? 'annual' : 'monthly';
  const cycleLabel = cycle === 'annual' ? 'annually' : cycle === 'monthly' ? 'monthly' : null;

  const { isLoading, methods, mode, only, pay } = usePaymentMethods();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const hasPlan = typeof planKey === 'string' && planKey.length > 0;
  // Buttons render only when there is a plan to buy AND something to buy it
  // with. Both halves have to be true or there is nothing to press.
  const canPay = hasPlan && !isLoading && (mode === 'single' || mode === 'choose');

  const queryClient = useQueryClient();

  async function onPay(method: PaymentMethod) {
    if (!hasPlan || busyId !== null) return;
    setBusyId(method.id);
    setProblem(null);
    try {
      /*
       * COS-924 — 'cancelled' and 'handed-off' both say nothing. The first is
       * the patient's own decision and does not need a message; the second
       * means the system browser owns the screen and anything here talks over
       * it. Only a real failure, or money that moved without landing, speaks.
       */
      const outcome = await pay(method, { planKey, cycle: billingCycle });
      setProblem(
        outcome.status === 'failed' || outcome.status === 'pending' ? outcome.message : null,
      );
      /*
       * COS-925 — 'applied' has to DO something here too.
       *
       * This screen collapsed applied / cancelled / handed-off to "clear the
       * message", so a patient who successfully paid sat on the checkout
       * screen with nothing changed and no confirmation — every other purchase
       * and switch site in the app invalidates. Sending them back to the plans
       * is what makes the purchase visible: the shelf re-reads and shows the
       * plan as theirs.
       */
      if (outcome.status === 'applied') {
        await queryClient.invalidateQueries({ queryKey: ['patient-plans'] });
        await queryClient.invalidateQueries({ queryKey: ['billing'] });
        router.replace('/Home/care-plan-plus' as never);
      }
    } catch (err) {
      setProblem(
        err instanceof Error
          ? err.message
          : 'Could not start checkout. Please try again, or ask your care team.',
      );
    } finally {
      setBusyId(null);
    }
  }

  // The one state that has to keep its exact words: tests/unit pins this copy
  // so the screen can never quietly grow a "processing" fiction.
  const noWayToPay = hasPlan && !isLoading && mode === 'none';
  const title = !hasPlan
    ? 'Pick a plan first'
    : isLoading
      ? 'Checking payment options…'
      : mode === 'choose'
        ? 'How would you like to pay?'
        : 'Confirm your subscription';
  const titleStyle = [
    styles.title,
    {
      color: colors.text,
      fontSize: getScaledFontSize(20),
      fontWeight: getScaledFontWeight(700) as never,
    },
  ];

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      {noWayToPay && <Text style={titleStyle}>Payments aren&apos;t available yet</Text>}
      {!noWayToPay && <Text style={titleStyle}>{title}</Text>}

      {hasPlan && planName ? (
        <Text style={[styles.chosen, { color: colors.text, fontSize: getScaledFontSize(15) }]}>
          {cycleLabel ? `${planName} · billed ${cycleLabel}` : planName}
        </Text>
      ) : null}

      {!hasPlan && (
        <Text style={[styles.body, { color: colors.text, fontSize: getScaledFontSize(15) }]}>
          Choose the plan you want from the plans list, then come back here to pay.
        </Text>
      )}

      {/* ONE way to pay: naming it is the whole answer. Asking a question with
          a single option is a decision the patient cannot make. */}
      {hasPlan && mode === 'single' && only !== null && (
        <Text style={[styles.body, { color: colors.text, fontSize: getScaledFontSize(15) }]}>
          {`Paying with ${only.label}. ${only.detail}`}
        </Text>
      )}

      {hasPlan && mode === 'choose' && (
        <Text style={[styles.body, { color: colors.text, fontSize: getScaledFontSize(15) }]}>
          Both work the same way — pick whichever you&apos;d rather manage it in.
        </Text>
      )}

      {noWayToPay && (
        <Text style={[styles.body, { color: colors.text, fontSize: getScaledFontSize(15) }]}>
          {methods.length === 0
            ? "We can't take payment in the app just yet. To change your plan, talk to your care team — they can move you over straight away."
            : 'None of the payment methods below work in this version of the app yet. Your care team can move you over straight away, or update the app and try again.'}
        </Text>
      )}

      {canPay &&
        methods.map((method) => (
          <View key={method.id}>
            {method.usable && (
              <Pressable
                onPress={() => void onPay(method)}
                disabled={busyId !== null}
                accessibilityRole="button"
                accessibilityState={{ disabled: busyId !== null, busy: busyId === method.id }}
                accessibilityHint={method.detail}
                accessibilityLabel={
                  `Pay with ${method.label} for ${planName ?? 'this plan'}` +
                  (cycleLabel ? `, billed ${cycleLabel}` : '')
                }
                style={({ pressed }) => [
                  styles.subscribe,
                  {
                    backgroundColor: colors.tint,
                    opacity: pressed || busyId !== null ? 0.7 : 1,
                  },
                ]}
              >
                {/* A Text label rather than a spinner: this screen is inside
                    the iOS 26 primitive envelope, and the envelope exists
                    because this app has crashed on cold mount in production. */}
                <Text style={[styles.subscribeText, { fontSize: getScaledFontSize(15) }]}>
                  {busyId === method.id ? 'Opening…' : `Pay with ${method.label}`}
                </Text>
              </Pressable>
            )}
            {method.usable && (
              <Text style={[styles.detail, { color: colors.text, fontSize: getScaledFontSize(13) }]}>
                {method.detail}
              </Text>
            )}
          </View>
        ))}

      {/* Offered by the server, impossible in this build. Shown with the
          reason and NOT as a button — an option that silently disappears
          reads as a broken app, and a dead button reads worse. */}
      {hasPlan &&
        !isLoading &&
        methods
          .filter((m) => !m.usable)
          .map((method) => (
            <View
              key={method.id}
              style={[styles.unusable, { borderColor: colors.border ?? '#E5E7EB' }]}
            >
              <Text
                style={[
                  styles.unusableLabel,
                  { color: colors.text, fontSize: getScaledFontSize(15) },
                ]}
              >
                {method.label}
              </Text>
              <Text style={[styles.detail, { color: colors.text, fontSize: getScaledFontSize(13) }]}>
                {method.reason}
              </Text>
            </View>
          ))}

      {problem !== null && (
        <Text style={[styles.problem, { fontSize: getScaledFontSize(13) }]}>{problem}</Text>
      )}

      {/*
        COS-924 — NAMES ITS DESTINATION. router.back() sent the patient Home.

        Vishal: "when I click on the go back, I was taken to the home screen,
        which is wrong."

        Not a stack bug — @react-navigation/routers' TabRouter defaults
        backBehavior to 'firstRoute', so back() from ANY screen under app/Home
        pops to the navigator's FIRST route, which is Home. It is wrong here
        specifically because the patient arrived from the plan shelf and every
        other exit from this screen returns them to it.

        replace(), not push(): the checkout should not stay on the stack behind
        the plans, or backing out of the shelf lands on an abandoned checkout.
      */}
      <Pressable
        onPress={() => router.replace('/Home/care-plan-plus' as never)}
        accessibilityRole="button"
        accessibilityLabel="Go back to plans"
        style={[styles.back, { borderColor: colors.border ?? '#E5E7EB' }]}
      >
        <Text style={[styles.backText, { color: colors.text, fontSize: getScaledFontSize(15) }]}>
          Go back to plans
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 24, justifyContent: 'center' },
  title: { marginBottom: 10, textAlign: 'center' },
  chosen: { textAlign: 'center', marginBottom: 14, fontWeight: '700' },
  body: { lineHeight: 22, textAlign: 'center', marginBottom: 24 },
  subscribe: { borderRadius: 999, paddingVertical: 14, alignItems: 'center', marginBottom: 6 },
  subscribeText: { color: '#FFFFFF', fontWeight: '700' },
  detail: { textAlign: 'center', lineHeight: 18, opacity: 0.75, marginBottom: 14 },
  unusable: { borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 14 },
  unusableLabel: { fontWeight: '700', textAlign: 'center', marginBottom: 4 },
  problem: { color: '#B91C1C', textAlign: 'center', marginBottom: 14, lineHeight: 19 },
  back: { borderWidth: 1, borderRadius: 999, paddingVertical: 12, alignItems: 'center' },
  backText: { fontWeight: '600' },
});

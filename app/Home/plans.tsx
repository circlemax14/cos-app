import { AppWrapper } from '@/components/app-wrapper';
import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';
import { router } from 'expo-router';
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { fetchPlanShelf, formatPlanPrice, type PlanShelfCard } from '@/services/api/patient-plans';

/**
 * COS-784 — the plans a patient can see, and which one is theirs.
 *
 * The dashboard has had a full plan editor since COS-768 and nothing in this
 * app read a line of it: `/v1/patients/me/plans` had no consumer, so every
 * plan an admin composed — price, highlights, trial, icon — was invisible to
 * the people the plans are for. This is the missing reader.
 *
 * ─── READ-ONLY, DELIBERATELY ───────────────────────────────────────────────
 *
 * Nothing here is tappable and there is no "choose this plan". Switching plans
 * means Stripe — checkout, proration, webhooks, and an unresolved question
 * about whether Apple requires IAP for an in-app subscription. Shipping a
 * button that cannot complete would be worse than shipping none: a patient who
 * taps it and lands nowhere has been told this app is broken.
 *
 * Vishal approved read-only for v1 on 2026-08-27. The screen is honest about
 * it — it presents what each plan IS, and says to contact the care team to
 * change, rather than implying an action it cannot perform.
 *
 * ─── iOS 26 ENVELOPE ───────────────────────────────────────────────────────
 *
 * View / Text / Pressable / ScrollView / ActivityIndicator only, no new wrapper
 * components, and every conditional is a plain `{cond && <X />}`. This app has
 * crashed in production from cold-mount rendering (ADR-0003), and a new screen
 * is exactly where an unfamiliar primitive would get introduced without anyone
 * noticing until a device did.
 *
 * The hook count is FIXED across every render — the three hooks run before any
 * early return, and the loading/empty/loaded states are branches of the
 * returned tree rather than separate return paths taken before a hook. A
 * changing hook count between renders is a SIGABRT, not a warning.
 */
export default function PlansScreen() {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];

  const { data, isLoading } = useQuery({
    queryKey: ['patient-plans'],
    queryFn: fetchPlanShelf,
    // The shelf changes when an admin edits it, not when the patient does
    // anything, so it does not need to be fresh to the second. Five minutes
    // keeps a re-entry instant without pinning stale pricing for a session.
    staleTime: 5 * 60 * 1000,
  });

  const plans = data?.plans ?? [];
  const current = plans.find((p) => p.isCurrent) ?? null;

  return (
    <AppWrapper showBellIcon={false}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 }}>
          <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back">
            <MaterialIcons name="arrow-back" size={getScaledFontSize(24)} color={colors.text} />
          </Pressable>
          <Text
            style={{
              color: colors.text,
              fontSize: getScaledFontSize(22),
              fontWeight: getScaledFontWeight(700) as never,
              marginLeft: 12,
              flex: 1,
            }}
          >
            Your plan
          </Text>
        </View>

        {isLoading && (
          <View style={{ paddingVertical: 40, alignItems: 'center' }}>
            <ActivityIndicator color={colors.tint} />
          </View>
        )}

        {!isLoading && plans.length === 0 && (
          /*
           * The empty state is the FAILURE state too, on purpose. fetchPlanShelf
           * returns an empty shelf rather than throwing, and the endpoint does
           * the same server-side — so "no plans" and "we could not load plans"
           * arrive identically. Saying "no plans available right now" is true of
           * both; inventing an error banner would be a guess about which one
           * happened, and this screen grants nothing, so being wrong about it
           * costs a patient nothing.
           */
          <View style={{ paddingHorizontal: 20, paddingVertical: 40 }}>
            <Text style={{ color: colors.icon, fontSize: getScaledFontSize(15), textAlign: 'center', lineHeight: 22 }}>
              No plans are available right now. Your care team can tell you what
              your plan includes.
            </Text>
          </View>
        )}

        {!isLoading && plans.length > 0 && (
          <ScrollView
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
            showsVerticalScrollIndicator={false}
          >
            {current && (
              <Text
                style={{
                  color: colors.icon,
                  fontSize: getScaledFontSize(13),
                  lineHeight: 20,
                  marginBottom: 14,
                }}
              >
                You are on {current.name}. Contact your care team to change plans.
              </Text>
            )}
            {!current && (
              // Every patient defaults to `basic` (COS-738), so no current plan
              // means the shelf and their assignment disagree. Say nothing
              // rather than assert something wrong — the cards still render.
              <View style={{ height: 4 }} />
            )}

            {plans.map((plan) => (
              <PlanCard
                key={plan.planKey}
                plan={plan}
                colors={colors}
                getScaledFontSize={getScaledFontSize}
                getScaledFontWeight={getScaledFontWeight}
              />
            ))}
          </ScrollView>
        )}
      </View>
    </AppWrapper>
  );
}

/**
 * One plan.
 *
 * A local function component, not a new file and not a shared component: it is
 * used once, it is presentational, and keeping it here means the whole screen
 * can be read top to bottom. It takes the theme and scaling functions as props
 * rather than calling useAccessibility itself — one subscription for the screen
 * instead of one per card.
 */
function PlanCard({
  plan,
  colors,
  getScaledFontSize,
  getScaledFontWeight,
}: {
  plan: PlanShelfCard;
  colors: (typeof Colors)['light'];
  getScaledFontSize: (n: number) => number;
  getScaledFontWeight: (n: number) => string;
}) {
  // 'coming-soon' is shown, dimmed, with a badge — its whole purpose is to say
  // "this is on the way". Drafts never arrive here; the API filters them.
  const comingSoon = plan.status === 'coming-soon';

  return (
    <View
      style={{
        borderWidth: plan.isCurrent ? 2 : 1,
        borderColor: plan.isCurrent ? colors.tint : colors.border,
        borderRadius: 14,
        padding: 16,
        marginBottom: 12,
        backgroundColor: colors.card,
        opacity: comingSoon ? 0.6 : 1,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {plan.icon && (
          <MaterialIcons
            name={plan.icon as never}
            size={getScaledFontSize(20)}
            color={colors.tint}
            style={{ marginRight: 8 }}
          />
        )}
        <Text
          style={{
            color: colors.text,
            fontSize: getScaledFontSize(17),
            fontWeight: getScaledFontWeight(700) as never,
            flex: 1,
          }}
        >
          {plan.name}
        </Text>
        {plan.isCurrent && (
          <Text
            style={{
              color: colors.tint,
              fontSize: getScaledFontSize(11),
              fontWeight: getScaledFontWeight(700) as never,
            }}
          >
            YOUR PLAN
          </Text>
        )}
        {comingSoon && (
          <Text style={{ color: colors.icon, fontSize: getScaledFontSize(11), fontWeight: getScaledFontWeight(700) as never }}>
            COMING SOON
          </Text>
        )}
      </View>

      {plan.shortDescription && (
        <Text style={{ color: colors.icon, fontSize: getScaledFontSize(13), marginTop: 4, lineHeight: 19 }}>
          {plan.shortDescription}
        </Text>
      )}

      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10 }}>
        <Text
          style={{
            color: colors.text,
            fontSize: getScaledFontSize(20),
            fontWeight: getScaledFontWeight(700) as never,
          }}
        >
          {formatPlanPrice(plan.pricing)}
        </Text>
        {/* The trial is the thing most likely to make someone look twice, and
            it never reached this screen before COS-784 added it to the card. */}
        {plan.trialDays !== null && plan.trialDays > 0 && (
          <Text
            style={{
              color: colors.tint,
              fontSize: getScaledFontSize(12),
              fontWeight: getScaledFontWeight(600) as never,
              marginLeft: 10,
            }}
          >
            {plan.trialDays}-day free trial
          </Text>
        )}
      </View>

      {plan.highlights.length > 0 && (
        <View style={{ marginTop: 12 }}>
          {plan.highlights.map((h) => (
            <View key={h} style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6 }}>
              <MaterialIcons
                name="check"
                size={getScaledFontSize(16)}
                color={colors.tint}
                style={{ marginRight: 8, marginTop: 2 }}
              />
              <Text style={{ color: colors.text, fontSize: getScaledFontSize(14), flex: 1, lineHeight: 20 }}>
                {h}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

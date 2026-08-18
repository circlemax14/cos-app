import React from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextStyle,
  TouchableOpacity,
  View,
} from 'react-native';
import { AppWrapper } from '@/components/app-wrapper';
import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';
import { useHealthSummary } from '@/hooks/use-health-summary';
import IntakeCtaCard from '@/components/health-plan/patient-intake/IntakeCtaCard';
import { usePatientIntake } from '@/hooks/use-patient-intake';
import BpsHistorySection from '@/components/health-summary/BpsHistorySection';
import CurrentConditionsSection from '@/components/health-summary/CurrentConditionsSection';
import MedicationsByConditionSection from '@/components/health-summary/MedicationsByConditionSection';
import LabsByConditionSection from '@/components/health-summary/LabsByConditionSection';
import VitalsRedFlagSection from '@/components/health-summary/VitalsRedFlagSection';
import TreatmentsSupportsSection from '@/components/health-summary/TreatmentsSupportsSection';
import RecommendationsSection from '@/components/health-summary/RecommendationsSection';
import ShareSummarySection from '@/components/health-summary/ShareSummarySection';
import UpdatedAtFooter from '@/components/health-summary/UpdatedAtFooter';
import { useVitalsRedFlagNotifications } from '@/hooks/use-vitals-red-flag-notifications';
import { useCanRender } from '@/hooks/use-entitlement';
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary';

/**
 * Renamed from the default export and wrapped below. This screen crashed the
 * whole app on 2026-08-15 — a JS throw with no boundary anywhere in the app
 * meant expo-updates' error recovery aborted the process rather than the screen
 * degrading. The boundary is inside the tab, so the tab bar survives and the
 * patient can walk away from a broken screen instead of losing the app.
 */
function HealthSummaryScreenInner() {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];

  // SCRUM-715 — per-section entitlement gates.
  //
  // Declared at the very top, above every early return, because these are
  // hooks and this component returns early on both loading (:64) and error
  // (:77). `canVitals` in particular must exist before the observer call
  // below it.
  //
  // useCanRender FAILS OPEN: it is false only on an affirmative deny, never
  // while loading, on a failed /v1/auth/me, or when entitlements are absent.
  // Hiding a patient's own labs because a request timed out would be
  // indistinguishable from a correct deny, and nobody would report it.
  const canIntakeCta = useCanRender('plan.intake-cta');
  const canBpsHistory = useCanRender('plan.bps-history');
  const canConditions = useCanRender('plan.current-conditions');
  const canMedications = useCanRender('plan.medications-by-condition');
  const canLabs = useCanRender('plan.labs-by-condition');
  const canVitals = useCanRender('plan.vitals-red-flag');
  const canTreatments = useCanRender('plan.treatments-supports');
  const canRecommendations = useCanRender('plan.recommendations');
  const canShare = useCanRender('plan.share-summary');

  const { isLoading, isError, refetch } = useHealthSummary();

  // HS-3b overlay: mount the vitals red-flag observer. Rules-of-hooks — called
  // unconditionally, before any early returns. The hook itself no-ops when the
  // patient is on Android or has Apple Health OFF (via useHealthKitTrends'
  // `disabled` gate, COS-397 / SCRUM-535), so this line is safe on every
  // device. Zero visual impact on v5's UI — the observer only computes
  // verdicts from HK trends and, on fresh amber/red transitions, fires a
  // local push + POSTs the verdict label to
  // /v1/patients/me/vitals-red-flag-event. No new render subtree, and it
  // mirrors the VitalsRedFlagSection's own iosDisabled short-circuit.
  // SCRUM-715: gated on the same key as the card it belongs to. The observer
  // is invisible — it fires local push and POSTs verdicts without rendering
  // anything — so hiding VitalsRedFlagSection alone would leave the patient
  // getting alerts about a card that is no longer on their screen.
  useVitalsRedFlagNotifications(canVitals);

  // Gate the 9-section view behind a completed intake — Ken's directive:
  // "whenever anyone opens health summary, they need to go through intake
  // first; after that the current view will be visible". Pre-intake users
  // see ONLY the intake CTA with an explainer. Intake query stays silent
  // (returns null on load/error) so we don't flash the gate before the
  // status is known — if the intake query itself is loading we treat as
  // gated so we don't briefly show the full summary and then snap back.
  const intakeQuery = usePatientIntake();
  const intakeComplete = intakeQuery.data?.intake?.status === 'complete';
  const intakeGateOpen = intakeComplete === true;

  if (isLoading) {
    return (
      <AppWrapper>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.tint} />
          <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(14), marginTop: 12 }}>
            Loading your health summary...
          </Text>
        </View>
      </AppWrapper>
    );
  }

  if (isError) {
    return (
      <AppWrapper>
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Intake CTA is reachable even when the summary fetch errors,
              so first-time patients (who have no summary yet) can still
              start their intake from this tab. Gated identically to the
              happy-path copy at :193 — otherwise revoking the key would hide
              the card on the normal screen but leave it on the error screen. */}
          {canIntakeCta && <IntakeCtaCard />}
          <View style={styles.centered}>
            <Text style={{ fontSize: getScaledFontSize(48), marginBottom: 16 }}>🩺</Text>
            <Text
              style={{
                color: colors.text,
                fontSize: getScaledFontSize(16),
                fontWeight: getScaledFontWeight(600) as TextStyle['fontWeight'],
                marginBottom: 8,
                textAlign: 'center',
              }}
            >
              Unable to load health summary
            </Text>
            <Text
              style={{
                color: colors.subtext,
                fontSize: getScaledFontSize(14),
                marginBottom: 20,
                textAlign: 'center',
              }}
            >
              Please check your connection and try again.
            </Text>
            <TouchableOpacity
              onPress={() => refetch()}
              style={[styles.retryButton, { backgroundColor: colors.tint }]}
              accessibilityRole="button"
              accessibilityLabel="Retry loading health summary"
            >
              <Text
                style={{
                  color: '#fff',
                  fontSize: getScaledFontSize(16),
                  fontWeight: getScaledFontWeight(600) as TextStyle['fontWeight'],
                }}
              >
                Retry
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </AppWrapper>
    );
  }

  return (
    <AppWrapper>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header — anchors the tab. */}
        <View style={styles.headerSection}>
          <Text style={{ fontSize: getScaledFontSize(40), marginBottom: 12 }}>🩺</Text>
          <Text
            style={{
              color: colors.text,
              fontSize: getScaledFontSize(22),
              fontWeight: getScaledFontWeight(700) as TextStyle['fontWeight'],
              textAlign: 'center',
              marginBottom: 4,
            }}
            accessibilityRole="header"
          >
            Health Summary
          </Text>
          <Text
            style={{
              color: colors.subtext,
              fontSize: getScaledFontSize(13),
              textAlign: 'center',
              marginTop: 2,
            }}
          >
            Tap any section to expand
          </Text>
        </View>

        {/* Intake sits below the header — self-gates on status. */}
        {canIntakeCta && <IntakeCtaCard />}

        {intakeGateOpen ? (
          <>
            {canBpsHistory && <BpsHistorySection />}
            {canConditions && <CurrentConditionsSection />}
            {canMedications && <MedicationsByConditionSection />}
            {canLabs && <LabsByConditionSection />}
            {canVitals && <VitalsRedFlagSection />}
            {canTreatments && <TreatmentsSupportsSection />}
            {canRecommendations && <RecommendationsSection />}
            {canShare && <ShareSummarySection />}
            <UpdatedAtFooter />
          </>
        ) : (
          <View
            style={{
              alignItems: 'center',
              paddingVertical: 32,
              paddingHorizontal: 24,
            }}
          >
            <Text
              style={{
                color: colors.subtext,
                fontSize: getScaledFontSize(14),
                textAlign: 'center',
                lineHeight: 22,
              }}
            >
              Your personalized health summary — biopsychosocial history,
              current conditions, medications, labs, vitals, treatments, and
              recommendations — will appear here once you complete your intake.
            </Text>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </AppWrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    flexGrow: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  retryButton: {
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 24,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerSection: {
    alignItems: 'center',
    marginBottom: 20,
  },
});

export default function HealthSummaryScreen() {
  return (
    <ScreenErrorBoundary screen="health-summary">
      <HealthSummaryScreenInner />
    </ScreenErrorBoundary>
  );
}

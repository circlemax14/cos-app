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
import RebuildingBanner from '@/components/health-summary/RebuildingBanner';
import CurrentConditionsSection from '@/components/health-summary/CurrentConditionsSection';
import MedicationsByConditionSection from '@/components/health-summary/MedicationsByConditionSection';
import LabsByConditionSection from '@/components/health-summary/LabsByConditionSection';
import VitalsRedFlagSection from '@/components/health-summary/VitalsRedFlagSection';
import ReportsSection from '@/components/health-summary/ReportsSection';
import TreatmentsSupportsSection from '@/components/health-summary/TreatmentsSupportsSection';
import RecommendationsSection from '@/components/health-summary/RecommendationsSection';
import ShareSummarySection from '@/components/health-summary/ShareSummarySection';
import UpdatedAtFooter from '@/components/health-summary/UpdatedAtFooter';
import { useVitalsRedFlagNotifications } from '@/hooks/use-vitals-red-flag-notifications';
import { useCanRender } from '@/hooks/use-entitlement';
import { router } from 'expo-router';
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary';
import { HealthAlertBadge } from '@/components/health-summary/HealthAlertBadge';
import { useHealthAlerts } from '@/hooks/use-health-alerts';
import { useHealthAlertsFlag } from '@/hooks/use-health-alerts-flag';

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
  //
  // COS-856 — `plan.view` is the screen-level sibling of the section keys
  // below. The tab entry is already denied by `canShow('plan')` in
  // app/Home/_layout.tsx:185; without this, a deep link still lands on the
  // screen the layout has already hidden.
  const canView = useCanRender('plan.view');
  const canIntakeCta = useCanRender('plan.intake-cta');
  const canBpsHistory = useCanRender('plan.bps-history');
  const canConditions = useCanRender('plan.current-conditions');
  const canMedications = useCanRender('plan.medications-by-condition');
  const canLabs = useCanRender('plan.labs-by-condition');
  const canVitals = useCanRender('plan.vitals-red-flag');
  /*
   * COS-1045 — Reports, gated like every other section on this screen.
   *
   * `useCanRender` is fail-open on an unknown, which is the right default for
   * clinical content the patient owns: hiding a patient's own reports because
   * /v1/auth/me timed out is a safety problem that looks identical to a
   * correct deny, so nobody reports it.
   */
  /*
   * COS-1108 — NOT `plan.reports`. That key exists in no catalog and no plan on
   * any stage, so it is a permanent deny wherever entitlements are enforced:
   * the section was invisible on dev (plan_tier_enabled=true) and visible on
   * staging/production only because the resolver returns a WILDCARD there,
   * which useCanRender reads as a grant. `reports.view` is a real catalog key
   * granted by every plan on every stage, so this survives prod enforcement
   * being switched on.
   */
  const canReports = useCanRender('reports.view');
  // COS-1112 — the flag is threaded INTO the hook, not wrapped around it:
  // hooks cannot be conditional, and an "off" feature must not still fetch.
  const healthAlertsEnabled = useHealthAlertsFlag();
  const healthAlerts = useHealthAlerts(healthAlertsEnabled);
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

  // Applied below every hook above — useHealthSummary, the red-flag observer
  // and usePatientIntake all still run on a denied render, same as the other
  // `.view` screens.
  if (!canView) return <AppWrapper><View /></AppWrapper>;

  if (isLoading) {
    return (
      <AppWrapper>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.tint} />
          <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(14), marginTop: 12 }}>
            Loading your health status…
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
              Unable to load health status
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
              accessibilityLabel="Retry loading health status"
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
        {/*
          COS-1112 — Ken's health-alert indicator, "up in the top of the page in
          the corner". Gated: it mounts an animated SVG in a screen body, which
          is outside the envelope ADR-0003 draws after the 2026-08-18 cold-mount
          crash. Flag off ⇒ this subtree does not exist and the header is
          byte-identical to today.
        */}
        {healthAlertsEnabled && (
          <View style={styles.alertCorner}>
            <HealthAlertBadge
              level={healthAlerts.level}
              firingCount={healthAlerts.firing.length}
              isLoading={healthAlerts.isLoading}
              onPress={() => router.push('/Home/health-alerts')}
            />
          </View>
        )}
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
            Health Status
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
            {/*
              COS-984 — ABOVE the sections, never instead of them. See the note
              in RebuildingBanner: this page is read-only prose, so what is on
              screen stays true while a rebuild runs. Ungated by entitlements
              on purpose — it reports the state of the page itself, not a
              feature, and a patient whose plan is regenerating deserves to
              know regardless of what their plan includes.
            */}
            <RebuildingBanner />
            {canBpsHistory && <BpsHistorySection />}
            {canConditions && <CurrentConditionsSection />}
            {canMedications && <MedicationsByConditionSection />}
            {canLabs && <LabsByConditionSection />}
            {canVitals && <VitalsRedFlagSection />}
            {canReports && <ReportsSection />}
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
              Your personalized health status — biopsychosocial summary,
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
  alertCorner: {
    alignItems: 'flex-end',
    paddingHorizontal: 4,
    marginBottom: 4,
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

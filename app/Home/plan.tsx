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

export default function HealthSummaryScreen() {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];

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
  useVitalsRedFlagNotifications();

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
              start their intake from this tab. */}
          <IntakeCtaCard />
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
        <IntakeCtaCard />

        {intakeGateOpen ? (
          <>
            <BpsHistorySection />
            <CurrentConditionsSection />
            <MedicationsByConditionSection />
            <LabsByConditionSection />
            <VitalsRedFlagSection />
            <TreatmentsSupportsSection />
            <RecommendationsSection />
            <ShareSummarySection />
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

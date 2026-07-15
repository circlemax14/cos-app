import React, { useCallback } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextStyle,
  TouchableOpacity,
  View,
} from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { AppWrapper } from '@/components/app-wrapper';
import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';
import { useHealthSummary } from '@/hooks/use-health-summary';
import IntakeCtaCard from '@/components/health-plan/patient-intake/IntakeCtaCard';
import BpsHistorySection from '@/components/health-summary/BpsHistorySection';
import CurrentConditionsSection from '@/components/health-summary/CurrentConditionsSection';
import MedicationsByConditionSection from '@/components/health-summary/MedicationsByConditionSection';
import LabsByConditionSection from '@/components/health-summary/LabsByConditionSection';
import VitalsRedFlagSection from '@/components/health-summary/VitalsRedFlagSection';
import TreatmentsSupportsSection from '@/components/health-summary/TreatmentsSupportsSection';
import RecommendationsSection from '@/components/health-summary/RecommendationsSection';
import ShareSummarySection from '@/components/health-summary/ShareSummarySection';
import UpdatedAtFooter from '@/components/health-summary/UpdatedAtFooter';

export default function HealthSummaryScreen() {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];

  const qc = useQueryClient();
  const { isLoading, isError, refetch, isRefetching } = useHealthSummary();

  // Pull-to-refresh must invalidate ALL section queries — pulling only refetched
  // the top-level summary before, leaving the 6 section widgets stale.
  // isRefetching still binds to the summary query (the primary indicator);
  // the rest refresh in the background.
  const onPullToRefresh = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['health-summary'] });
    qc.invalidateQueries({ queryKey: ['biopsychosocial-plan'] });
    qc.invalidateQueries({ queryKey: ['patient-medications'] });
    qc.invalidateQueries({ queryKey: ['lab-reports'] });
    qc.invalidateQueries({ queryKey: ['healthkit-trends'] });
    qc.invalidateQueries({ queryKey: ['health-details'] });
    refetch();
  }, [qc, refetch]);

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
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={onPullToRefresh}
              tintColor={colors.tint}
            />
          }
        >
          {/* HS-1 / SCRUM-590 — intake CTA is reachable even when the summary
              fetch errors, so first-time patients (who have no summary yet)
              can still start their intake from this tab. */}
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
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={onPullToRefresh}
            tintColor={colors.tint}
          />
        }
      >
        {/* Section 1 — HS-1 / SCRUM-590 patient intake CTA. Self-gates on load/error/status. */}
        {/* Header — always first so the page title anchors the tab. */}
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
        </View>

        {/* Intake sits below the header — self-gates on status (pre-intake = CTA,
            post-intake = info card with completion date, count, and what it powers). */}
        <IntakeCtaCard />

        <BpsHistorySection />
        <CurrentConditionsSection />
        <MedicationsByConditionSection />
        <LabsByConditionSection />
        <VitalsRedFlagSection />
        <TreatmentsSupportsSection />
        <RecommendationsSection />
        <ShareSummarySection />
        <UpdatedAtFooter />

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

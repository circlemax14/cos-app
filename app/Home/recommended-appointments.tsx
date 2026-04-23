import { AppWrapper } from '@/components/app-wrapper';
import { RecommendedAppointmentsList } from '@/components/recommended-appointments-list';
import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';
import { useRecommendedAppointments } from '@/hooks/use-recommended-appointments';
import React, { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

/**
 * Standalone Recommended Appointments screen, kept for legacy deep-links.
 * Renders the shared list component inside the app wrapper. The main
 * entry point for this feature is now the Recommended tab inside the
 * Appointments screen, which shows the same list inline.
 */
export default function RecommendedAppointmentsScreen() {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  const [refreshing, setRefreshing] = useState(false);
  const { refetch } = useRecommendedAppointments({ status: 'pending' });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  return (
    <AppWrapper>
      <ScrollView
        style={styles.container}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.text} />
        }
      >
        <View style={styles.headerSection}>
          <Text style={{ fontSize: 40, marginBottom: 12 }}>📋</Text>
          <Text
            style={{
              color: colors.text,
              fontSize: getScaledFontSize(22),
              fontWeight: getScaledFontWeight(700) as any,
              textAlign: 'center',
              marginBottom: 4,
            }}
            accessibilityRole="header"
          >
            Recommended Appointments
          </Text>
          <Text
            style={{ color: colors.subtext, fontSize: getScaledFontSize(14), textAlign: 'center' }}
          >
            Based on your health records and care plan
          </Text>
        </View>
        <RecommendedAppointmentsList />
        <View style={{ height: 40 }} />
      </ScrollView>
    </AppWrapper>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16 },
  headerSection: { alignItems: 'center', paddingTop: 16, marginBottom: 20 },
});

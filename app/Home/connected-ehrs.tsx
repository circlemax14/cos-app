import { AppWrapper } from '@/components/app-wrapper';
import { ProfileContent } from '@/components/profile-content';
import { getColors } from '@/constants/design-system';
import { useConnectedEhrs } from '@/hooks/use-connected-ehrs';
import { useAccessibility } from '@/stores/accessibility-store';
import { router } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, View, ScrollView, RefreshControl } from 'react-native';

export default function ConnectedEhrsScreen() {
  const { settings, getScaledFontWeight, getScaledFontSize } = useAccessibility();
  const colors = getColors(settings.isDarkTheme);
  const { connectedHospitals, isLoadingClinics, refreshConnectedEhrs } = useConnectedEhrs();
  const [refreshing, setRefreshing] = React.useState(false);

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    await refreshConnectedEhrs();
    setRefreshing(false);
  }, [refreshConnectedEhrs]);

  // Show all connected hospitals (both EHR and Integrative)
  const actualConnectedHospitals = connectedHospitals;

  return (
    <AppWrapper>
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.text} />
        }
      >
        {/* Title Section */}
        <View style={styles.titleSection}>
          <Text style={[styles.title, { color: colors.text, fontSize: getScaledFontSize(24), fontWeight: getScaledFontWeight(600) as any }]} accessibilityRole="header">
            Connected EHRs{actualConnectedHospitals.length > 0 ? ` (${actualConnectedHospitals.length})` : ''}
          </Text>
        </View>

        <ProfileContent
          showProfileHeader={false}
          showProfileMenu={false}
          showSignOut={false}
          showEhrSection
          showEhrTitle={false}
          connectedHospitals={actualConnectedHospitals}
          isLoadingClinics={isLoadingClinics}
          onConnectEhr={() => router.push('/Home/connect-clinics')}
          containerStyle={styles.profileContentContainer}
        />
      </ScrollView>
    </AppWrapper>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  titleSection: {
    marginBottom: 24,
    paddingHorizontal: 4,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
  },
  profileContentContainer: {
    paddingTop: 0,
    paddingHorizontal: 0,
  },
});

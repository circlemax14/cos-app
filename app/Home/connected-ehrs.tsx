import { AppWrapper } from '@/components/app-wrapper';
import { ProfileContent } from '@/components/profile-content';
import { Colors } from '@/constants/theme';
import { useConnectedEhrs } from '@/hooks/use-connected-ehrs';
import { useAccessibility } from '@/stores/accessibility-store';
import { router } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, View, ScrollView } from 'react-native';

export default function ConnectedEhrsScreen() {
  const { settings, getScaledFontWeight, getScaledFontSize } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  const { connectedHospitals, isLoadingClinics } = useConnectedEhrs();

  // Show all connected hospitals (both EHR and Integrative)
  const actualConnectedHospitals = connectedHospitals;

  return (
    <AppWrapper>
      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {/* Title Section */}
        <View style={styles.titleSection}>
          <Text style={[styles.title, { color: colors.text, fontSize: getScaledFontSize(24), fontWeight: getScaledFontWeight(600) as any }]}>
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
          onConnectEhr={() => router.push('/(auth)/provider-selection')}
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

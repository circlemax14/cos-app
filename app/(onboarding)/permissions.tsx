import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Contacts from 'expo-contacts';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { requestTrackingPermissionsAsync } from 'expo-tracking-transparency';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { apiClient } from '@/lib/api-client';
import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';

/**
 * Requests essential device permissions sequentially using native OS dialogs.
 * Only asks for notifications and contacts during onboarding.
 * Camera and photo library permissions are requested at point of use
 * (e.g., when uploading a file from profile or doctor detail screens).
 */
export default function PermissionsScreen() {
  const { settings, getScaledFontSize } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  const [status, setStatus] = useState('Preparing...');

  useEffect(() => {
    requestPermissions();
  }, []);

  async function requestPermissions() {
    try {
      // 1. Push Notifications
      setStatus('Requesting notification access...');
      try {
        const { status: notifStatus } = await Notifications.requestPermissionsAsync();
        if (notifStatus === 'granted') {
          try {
            // getExpoPushTokenAsync can hang on simulators — add a timeout
            const tokenPromise = Notifications.getExpoPushTokenAsync({
              projectId: Constants.expoConfig?.extra?.eas?.projectId ?? '',
            });
            const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000));
            const tokenData = await Promise.race([tokenPromise, timeoutPromise]);
            if (tokenData) {
              await apiClient.post('/v1/notifications/register-token', {
                token: tokenData.data,
                platform: Platform.OS === 'ios' ? 'ios' : 'android',
              });
            }
          } catch {
            // Token registration is non-critical
          }
        }
      } catch {
        // Continue if notification permission fails
      }

      // 2. App Tracking Transparency (iOS only)
      if (Platform.OS === 'ios') {
        setStatus('Requesting tracking permission...');
        try {
          await requestTrackingPermissionsAsync();
        } catch {
          // Continue
        }
      }

      // 3. Contacts
      setStatus('Requesting contacts access...');
      try {
        await Contacts.requestPermissionsAsync();
      } catch {
        // Continue
      }

      // All done — mark as complete and move on
      await AsyncStorage.setItem('permissions_requested', 'true');
      setStatus('All set!');
      router.replace('/(onboarding)/fasten-connect' as never);
    } catch {
      // If anything goes catastrophically wrong, still proceed
      await AsyncStorage.setItem('permissions_requested', 'true');
      router.replace('/(onboarding)/fasten-connect' as never);
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={[styles.status, { color: colors.text, fontSize: getScaledFontSize(16) }]}>
        {status}
      </Text>
      <Text style={[styles.subtitle, { color: colors.subtext, fontSize: getScaledFontSize(14) }]}>
        Please allow permissions to get the best experience
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 16,
  },
  status: {
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 16,
  },
  subtitle: {
    textAlign: 'center',
    fontWeight: '500',
  },
});

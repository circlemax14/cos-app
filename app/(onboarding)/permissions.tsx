import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { apiClient } from '@/lib/api-client';
import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';

interface PermissionItem {
  id: string;
  icon: string;
  title: string;
  description: string;
  required: boolean;
}

const PERMISSIONS: PermissionItem[] = [
  {
    id: 'notifications',
    icon: '🔔',
    title: 'Push Notifications',
    description: 'Get alerted when your health data is ready, for appointment reminders, and care updates.',
    required: false,
  },
  {
    id: 'health',
    icon: '❤️',
    title: 'Health Data',
    description: 'Access Apple Health or Google Fit data to sync steps, heart rate, and activity.',
    required: false,
  },
];

export default function PermissionsScreen() {
  const { settings, getScaledFontSize } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  const [loading, setLoading] = useState(false);

  const requestPermissions = async () => {
    setLoading(true);
    try {
      // 1. Request push notification permissions
      const { status } = await Notifications.requestPermissionsAsync();

      if (status === 'granted') {
        const tokenData = await Notifications.getExpoPushTokenAsync();
        // Register device token with backend
        await apiClient
          .post('/v1/notifications/register-token', {
            token: tokenData.data,
            platform: Platform.OS === 'ios' ? 'ios' : 'android',
          })
          .catch(() => {
            // Non-critical — continue even if token registration fails
          });
      }

      // Health permissions are handled separately via react-native-health
      // and are optional — skip here, can be requested from settings

      router.replace('/Home' as never);
    } catch {
      // Even if permission request fails, navigate to home
      router.replace('/Home' as never);
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = () => {
    router.replace('/Home' as never);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        <Text style={styles.topIcon}>⚙️</Text>
        <Text style={[styles.title, { color: colors.text, fontSize: getScaledFontSize(24) }]}>
          Enable Permissions
        </Text>
        <Text style={[styles.subtitle, { color: colors.subtext, fontSize: getScaledFontSize(15) }]}>
          Allow access to get the most out of your healthcare experience.
        </Text>

        <View style={styles.permissionList}>
          {PERMISSIONS.map((p) => (
            <View key={p.id} style={[styles.permissionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={styles.permissionIcon}>{p.icon}</Text>
              <View style={styles.permissionText}>
                <Text style={[styles.permissionTitle, { color: colors.text, fontSize: getScaledFontSize(16) }]}>
                  {p.title}
                  {!p.required && (
                    <Text style={[styles.optionalBadge, { color: colors.subtext, fontSize: getScaledFontSize(12) }]}>
                      {' '}(Optional)
                    </Text>
                  )}
                </Text>
                <Text style={[styles.permissionDesc, { color: colors.subtext, fontSize: getScaledFontSize(13) }]}>
                  {p.description}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.primaryButton, { backgroundColor: colors.primary }]}
          onPress={requestPermissions}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={[styles.primaryButtonText, { fontSize: getScaledFontSize(16) }]}>
              Allow & Continue
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={handleSkip} disabled={loading}>
          <Text style={[styles.skipText, { color: colors.subtext, fontSize: getScaledFontSize(14) }]}>
            Skip for now
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 24 },
  content: { flex: 1, justifyContent: 'center', gap: 20 },
  topIcon: { fontSize: 56, textAlign: 'center' },
  title: { fontWeight: '700', textAlign: 'center' },
  subtitle: { textAlign: 'center', opacity: 0.8 },
  permissionList: { gap: 12 },
  permissionCard: {
    flexDirection: 'row',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
    alignItems: 'flex-start',
  },
  permissionIcon: { fontSize: 28 },
  permissionText: { flex: 1, gap: 4 },
  permissionTitle: { fontWeight: '600' },
  optionalBadge: { fontWeight: '400' },
  permissionDesc: {},
  actions: { paddingBottom: 40, gap: 16, alignItems: 'center' },
  primaryButton: {
    width: '100%',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryButtonText: { color: '#fff', fontWeight: '700' },
  skipText: { textDecorationLine: 'underline' },
});

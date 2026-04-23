import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';

/**
 * Blocking "Connect a Clinic" screen. Shown when the user has finished core
 * onboarding but still has zero EHR connections — for example, if they
 * skipped the Fasten flow during onboarding. The user can either connect a
 * clinic or tap "Skip for now" to land on Home and try again later. The
 * screen reappears on the next app open until a connection is made.
 */
export default function ConnectClinicScreen() {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];

  const handleConnect = useCallback(() => {
    router.replace('/(onboarding)/fasten-connect' as never);
  }, []);

  const handleSkip = useCallback(() => {
    router.replace('/Home' as never);
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.hero}>
        <View style={[styles.iconCircle, { backgroundColor: colors.primary + '1A' }]}>
          <MaterialIcons
            name="local-hospital"
            size={getScaledFontSize(56)}
            color={colors.primary}
          />
        </View>
        <Text
          style={[
            styles.title,
            {
              color: colors.text,
              fontSize: getScaledFontSize(26),
              fontWeight: getScaledFontWeight(700) as '700',
            },
          ]}
        >
          Connect a Clinic
        </Text>
        <Text
          style={[
            styles.subtitle,
            { color: colors.subtext, fontSize: getScaledFontSize(15) },
          ]}
        >
          Link your healthcare provider to securely access your medical
          records, medications, labs, and appointments — all in one place.
        </Text>
      </View>

      <View style={styles.actions}>
        <Pressable
          onPress={handleConnect}
          style={[styles.primaryButton, { backgroundColor: colors.primary }]}
          accessibilityRole="button"
          accessibilityLabel="Connect a clinic now"
        >
          <Text
            style={[
              styles.primaryButtonText,
              {
                fontSize: getScaledFontSize(16),
                fontWeight: getScaledFontWeight(600) as '600',
              },
            ]}
          >
            Connect Now
          </Text>
        </Pressable>

        <Pressable
          onPress={handleSkip}
          style={styles.secondaryButton}
          accessibilityRole="button"
          accessibilityLabel="Skip for now"
        >
          <Text
            style={[
              styles.secondaryButtonText,
              {
                color: colors.subtext,
                fontSize: getScaledFontSize(15),
                fontWeight: getScaledFontWeight(500) as '500',
              },
            ]}
          >
            Skip for now
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 72,
    paddingBottom: 40,
    justifyContent: 'space-between',
  },
  hero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
  },
  iconCircle: {
    width: 112,
    height: 112,
    borderRadius: 56,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  title: {
    textAlign: 'center',
  },
  subtitle: {
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 8,
  },
  actions: {
    gap: 12,
  },
  primaryButton: {
    paddingVertical: 16,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  primaryButtonText: {
    color: '#fff',
  },
  secondaryButton: {
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {},
});

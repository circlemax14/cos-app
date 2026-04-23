import { Image } from 'expo-image';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/theme';
import { checkSession, markWelcomeSeen } from '@/services/auth';
import { useAccessibility } from '@/stores/accessibility-store';

/**
 * One-time welcome screen shown after the user has connected at least one
 * EHR. Flags `hasSeenWelcome` on the server when the user taps Continue so
 * the screen never appears again for that account.
 */
export default function WelcomeScreen() {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  const [firstName, setFirstName] = useState<string | null>(null);
  const [continuing, setContinuing] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await checkSession();
      setFirstName(res.user?.firstName?.trim() || null);
    })();
  }, []);

  const handleContinue = useCallback(async () => {
    if (continuing) return;
    setContinuing(true);
    await markWelcomeSeen();
    router.replace('/Home' as never);
  }, [continuing]);

  const greeting = firstName ? `Welcome, ${firstName}!` : 'Welcome!';

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.hero}>
        <Image
          source={require('@/assets/images/logo.png')}
          style={{ width: getScaledFontSize(200), height: getScaledFontSize(130) }}
          contentFit="contain"
        />
        <Text
          style={[
            styles.title,
            {
              color: colors.text,
              fontSize: getScaledFontSize(30),
              fontWeight: getScaledFontWeight(700) as '700',
            },
          ]}
        >
          {greeting}
        </Text>
        <Text
          style={[
            styles.subtitle,
            { color: colors.subtext, fontSize: getScaledFontSize(16) },
          ]}
        >
          Your health journey starts here. We&apos;ve gathered your records in
          one secure place so you can focus on what matters most — your care.
        </Text>
      </View>

      <Pressable
        onPress={handleContinue}
        disabled={continuing}
        style={[styles.button, { backgroundColor: colors.primary }]}
        accessibilityRole="button"
        accessibilityLabel="Continue to home"
      >
        {continuing ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text
            style={[
              styles.buttonText,
              {
                fontSize: getScaledFontSize(16),
                fontWeight: getScaledFontWeight(600) as '600',
              },
            ]}
          >
            Continue
          </Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingVertical: 48,
    justifyContent: 'space-between',
  },
  hero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
  },
  title: {
    textAlign: 'center',
  },
  subtitle: {
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: 8,
  },
  button: {
    paddingVertical: 16,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  buttonText: {
    color: '#fff',
  },
});

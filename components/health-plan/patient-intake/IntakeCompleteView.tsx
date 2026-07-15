import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppWrapper } from '@/components/app-wrapper';
import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';

const CHECK_GREEN = '#22C55E';

export default function IntakeCompleteView() {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];

  return (
    <AppWrapper>
      <View
        style={[
          styles.container,
          { backgroundColor: colors.background },
        ]}
      >
        <MaterialIcons name="check-circle" size={72} color={CHECK_GREEN} />
        <Text
          style={{
            color: colors.text,
            marginTop: 16,
            fontSize: getScaledFontSize(22),
            fontWeight: getScaledFontWeight(700) as any,
            textAlign: 'center',
          }}
        >
          Intake complete
        </Text>
        <Text
          style={{
            color: colors.subtext,
            marginTop: 8,
            fontSize: getScaledFontSize(15),
            fontWeight: getScaledFontWeight(400) as any,
            textAlign: 'center',
          }}
        >
          Your health summary will be ready in your Care Plan soon.
        </Text>
        <Text
          style={{
            color: colors.subtext,
            marginTop: 8,
            fontSize: getScaledFontSize(13),
            fontWeight: getScaledFontWeight(400) as any,
            textAlign: 'center',
            opacity: 0.85,
          }}
        >
          You can retake your intake any time from Care Plan.
        </Text>
        <Pressable
          onPress={() => router.replace('/Home/health-plan' as never)}
          style={({ pressed }) => [
            styles.cta,
            {
              backgroundColor: colors.tint,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Back to Care Plan"
        >
          <Text
            style={{
              color: '#ffffff',
              fontSize: getScaledFontSize(15),
              fontWeight: getScaledFontWeight(600) as any,
            }}
          >
            Back to Care Plan
          </Text>
        </Pressable>
      </View>
    </AppWrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  cta: {
    marginTop: 28,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 200,
  },
});

import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppWrapper } from '@/components/app-wrapper';

import { useIntakeLegibility } from './use-intake-legibility';

const CHECK_GREEN = '#22C55E';

export default function IntakeCompleteView() {
  // COS-1221 — folder-wide conversion to the stepped scaler + AA text tokens.
  const { colors, fs, fw, muted } = useIntakeLegibility();

  return (
    <AppWrapper>
      <View
        style={[
          styles.container,
          { backgroundColor: colors.background },
        ]}
      >
        <MaterialIcons name="check-circle" size={fs(72)} color={CHECK_GREEN} />
        <Text
          style={{
            color: colors.text,
            marginTop: 16,
            fontSize: fs(22),
            fontWeight: fw(700) as any,
            textAlign: 'center',
          }}
        >
          Intake complete
        </Text>
        <Text
          style={{
            color: muted,
            marginTop: 8,
            fontSize: fs(15),
            fontWeight: fw(400) as any,
            textAlign: 'center',
          }}
        >
          Your health status will be ready shortly.
        </Text>
        <Text
          style={{
            color: muted,
            marginTop: 8,
            fontSize: fs(13),
            fontWeight: fw(400) as any,
            textAlign: 'center',
            // COS-1221 — `opacity: 0.85` composited this AA secondary text back
            // down to 5.10:1 on the #fff background (7.56:1 unfaded), and 4.80:1
            // had it sat on a card. De-emphasise with size and weight, never by
            // fading type for the one audience that cannot afford it.
          }}
        >
          You can retake your intake any time from Care Plan.
        </Text>
        <Pressable
          onPress={() => router.replace('/Home/plan' as never)}
          style={({ pressed }) => [
            styles.cta,
            {
              backgroundColor: colors.tint,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Back to Health Status"
        >
          <Text
            style={{
              color: '#ffffff',
              fontSize: fs(15),
              fontWeight: fw(600) as any,
            }}
          >
            Back to Health Status
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

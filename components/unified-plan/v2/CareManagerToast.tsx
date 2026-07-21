/**
 * CareManagerToast — CHUNK 12 (2026-07-21).
 *
 * Fires a non-blocking "Your care team updated your plan" toast when
 * `data.meta.generatedAt` advances between polls. First-mount is
 * suppressed (previousGeneratedAt starts null, first observed value
 * seeds it without firing).
 *
 * iOS 26 safety: no Modal, no Animated.timing on native driver, no
 * gesture-handler. Plain absolutely-positioned View + Pressable dismiss.
 * Conditional render + setTimeout for auto-hide (4s).
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View, type TextStyle } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';

const AUTO_HIDE_MS = 4_000;

export interface CareManagerToastProps {
  /** Timestamp of the currently-visible plan. Toast fires when this
   *  advances from a previously-seen value. */
  generatedAt?: string | null;
}

export function CareManagerToast({ generatedAt }: CareManagerToastProps): React.JSX.Element | null {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];

  const previousRef = React.useRef<string | null | undefined>(undefined);
  const [visible, setVisible] = React.useState(false);
  const hideTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    // First observed value seeds the ref without firing.
    if (previousRef.current === undefined) {
      previousRef.current = generatedAt ?? null;
      return;
    }
    // Only fire when we have both a previous and a new value AND they
    // actually differ. Null → new value is a first-load transition, not
    // a care-manager update — skip.
    if (
      generatedAt &&
      previousRef.current &&
      previousRef.current !== generatedAt
    ) {
      setVisible(true);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      hideTimerRef.current = setTimeout(() => setVisible(false), AUTO_HIDE_MS);
    }
    previousRef.current = generatedAt ?? null;
  }, [generatedAt]);

  React.useEffect(
    () => () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    },
    [],
  );

  const onDismiss = React.useCallback(() => {
    setVisible(false);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
  }, []);

  if (!visible) return null;

  return (
    <View pointerEvents="box-none" style={styles.container}>
      <Pressable
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel="Dismiss care-team update notice"
        style={({ pressed }) => [
          styles.toast,
          {
            backgroundColor: colors.background,
            borderColor: colors.tint,
            opacity: pressed ? 0.9 : 1,
          },
        ]}
      >
        <MaterialIcons
          name="notifications-active"
          size={getScaledFontSize(18)}
          color={colors.tint}
        />
        <Text
          style={{
            flex: 1,
            color: colors.text,
            fontSize: getScaledFontSize(13),
            fontWeight: getScaledFontWeight(500) as TextStyle['fontWeight'],
          }}
          numberOfLines={2}
        >
          Your care team updated your plan
        </Text>
        <MaterialIcons name="close" size={getScaledFontSize(16)} color={colors.subtext} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 12,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginHorizontal: 20,
    maxWidth: 420,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
});

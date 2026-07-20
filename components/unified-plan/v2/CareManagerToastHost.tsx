/**
 * CareManagerToastHost (COS-475, Phase 6.4).
 *
 * Absolute-positioned top toast that slides in whenever
 * useCareManagerSync bumps its token. Uses react-native Animated (NOT
 * Reanimated) — cheap, no worklet, no shared-value plumbing needed for a
 * single translate+opacity fade. Auto-dismisses after 4 seconds.
 *
 * Interaction: tap → invokes optional onPress (used to scroll the plan
 * screen to top + briefly highlight the changed section).
 *
 * Round 2 (COS-475): a toast that arrives while any row's Swipeable is
 * mid-swipe is deferred. When the swipe closes we wait a short debounce
 * (DEFER_DEBOUNCE_MS) and then slide the toast in. Multiple queued
 * tokens collapse into one — patients never see a stack of toasts.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, type TextStyle } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { Radii, Spacing } from '@/constants/design-system';
import { usePlanV2Session } from '@/lib/plan-v2/session-state';

type ColorMap = Record<string, string | undefined>;

export interface CareManagerToastHostProps {
  token: number;
  onPress?: () => void;
  colors: ColorMap;
  getScaledFontSize: (n: number) => number;
  getScaledFontWeight: (n: number) => string;
}

const VISIBLE_MS = 4000;
const DEFER_DEBOUNCE_MS = 250;

export function CareManagerToastHost({
  token,
  onPress,
  colors,
  getScaledFontSize,
  getScaledFontWeight,
}: CareManagerToastHostProps): React.JSX.Element | null {
  const { swipeInFlight } = usePlanV2Session();
  const [visible, setVisible] = useState(false);
  const [activeToken, setActiveToken] = useState(0);
  // A token that arrived while a swipe was in flight. Collapses multiple
  // queued bumps into whichever came latest.
  const [pendingToken, setPendingToken] = useState<number | null>(null);
  const translateY = useRef(new Animated.Value(-60)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Ingest incoming token bumps.
  useEffect(() => {
    if (token <= 0) return;
    if (swipeInFlight) {
      // Defer — collapse multiple bumps into "the latest one".
      setPendingToken(token);
    } else {
      setActiveToken(token);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // When a swipe closes and there's a pending token, wait the debounce
  // then promote it to active.
  useEffect(() => {
    if (swipeInFlight) {
      if (showTimerRef.current) {
        clearTimeout(showTimerRef.current);
        showTimerRef.current = null;
      }
      return;
    }
    if (pendingToken == null) return;
    if (showTimerRef.current) clearTimeout(showTimerRef.current);
    showTimerRef.current = setTimeout(() => {
      setActiveToken(pendingToken);
      setPendingToken(null);
      showTimerRef.current = null;
    }, DEFER_DEBOUNCE_MS);
    return () => {
      if (showTimerRef.current) {
        clearTimeout(showTimerRef.current);
        showTimerRef.current = null;
      }
    };
  }, [swipeInFlight, pendingToken]);

  // Drive the animation on activeToken changes.
  useEffect(() => {
    if (activeToken <= 0) return;
    setVisible(true);
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start();
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: -60,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start(() => setVisible(false));
    }, VISIBLE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeToken]);

  if (!visible) return null;

  const tint = (colors.tint as string) ?? '#008080';
  const bg = (colors.card as string) ?? '#FFFFFF';
  const border = tint + '55';

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[styles.wrap, { transform: [{ translateY }], opacity }]}
    >
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="Your care team updated your plan"
        style={({ pressed }) => [
          styles.toast,
          { backgroundColor: bg, borderColor: border, opacity: pressed ? 0.85 : 1 },
        ]}
        testID="plan-v2-care-manager-toast"
      >
        <MaterialIcons name="medical-services" size={getScaledFontSize(16)} color={tint} />
        <Text
          style={{
            color: colors.text ?? '#111827',
            fontSize: getScaledFontSize(12),
            fontWeight: getScaledFontWeight(700) as TextStyle['fontWeight'],
            marginLeft: 6,
            flex: 1,
          }}
          numberOfLines={2}
        >
          Your care team updated your plan · Tap to see what&apos;s new
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 8,
    left: Spacing.md,
    right: Spacing.md,
    zIndex: 40,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.sm + 2,
    borderRadius: Radii.md,
    borderWidth: 1,
  },
});

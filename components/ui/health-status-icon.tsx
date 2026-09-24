import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

interface HealthStatusIconProps {
  size?: number;
  color: string;
  /** Set false for a static mark — no waves. */
  animated?: boolean;
}

/**
 * COS-1104/1105 — the Health Status icon: the cross, broadcasting.
 *
 * A medical cross cut out of a solid disc, with two pairs of arcs that pulse
 * outward like a signal leaving a source.
 *
 * ─── WHY THE ARCS ────────────────────────────────────────────────────
 *
 * COS-1081's mark was a cross in a ring, with two problems that had nothing to
 * do with how well it was drawn. It said MEDICAL — first aid, hospital — where
 * Ken's definition of this tab is "an ACTIVE clinical status, not a generated
 * summary and not a history". And it COLLIDED WITH PLAN, which sits beside it
 * and is also a round custom mark; at tab size two adjacent circles of similar
 * weight read as one blob.
 *
 * ─── COS-1105: BIGGER, AND MOVING ────────────────────────────────────
 *
 * Vishal, having seen it on dev: "the icon is small compared to other icons in
 * the nav bar, and I want it to give dynamic waves also, like Plan has a
 * beating effect."
 *
 * Both were fair. The disc was r=5.8 — 48% of the viewBox — against a house
 * icon that fills about 75%, so the mark read light even though its arcs
 * reached the edges. The disc is now r=7 (58%) and the tab renders it at 28
 * rather than 26.
 *
 * The waves travel: the inner pair brightens and expands, the outer pair
 * follows about a third of a second later, then both fade. That stagger is
 * what makes it read as one wave moving outward rather than two rings
 * blinking. Cadence is slower than Plan's heartbeat on purpose — two animated
 * icons at the same tempo in one bar look like a fault.
 *
 * ─── CONSTRAINTS CARRIED FORWARD ─────────────────────────────────────
 *
 * The cross stays a HOLE via `fillRule="evenodd"`. A filled disc with a white
 * cross painted on top looks identical on a white tab bar and wrong on any
 * other — a white cross on a dark surface is a white cross, not a hole.
 *
 * The faded outer pair is the same colour at lower opacity, never a second
 * colour: this icon inherits ONE tint from the tab bar and cannot introduce
 * another.
 *
 * Animation is opacity + transform only, on the native driver — the same
 * envelope BeatingHeartIcon has used in this tab bar since SCRUM-644. ADR-0003
 * bars Animated from HOME's cards; this is the tab bar, where it is proven.
 */
export function HealthStatusIcon({
  size = 28,
  color,
  animated = true,
}: HealthStatusIconProps) {
  const inner = useRef(new Animated.Value(0)).current;
  const outer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!animated) return;

    // One wave: brighten quickly, fade slowly. The slow release is what makes
    // it read as something leaving rather than something flashing.
    const wave = (v: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(v, {
            toValue: 1,
            duration: 420,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(v, {
            toValue: 0,
            duration: 900,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
          // The rest is longer than Plan's, so the two icons never look like
          // they are keeping time with each other.
          Animated.delay(680),
        ]),
      );

    const a = wave(inner, 0);
    const b = wave(outer, 320);
    a.start();
    b.start();
    return () => {
      a.stop();
      b.stop();
    };
  }, [animated, inner, outer]);

  // Static values when animation is off, so the mark still reads complete.
  const innerOpacity = animated ? inner.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }) : 1;
  const outerOpacity = animated ? outer.interpolate({ inputRange: [0, 1], outputRange: [0.12, 0.6] }) : 0.45;
  const innerScale = animated ? inner.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1.06] }) : 1;
  const outerScale = animated ? outer.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1.08] }) : 1;

  return (
    <View style={[styles.box, { width: size, height: size }]}>
      {/* The disc, with the cross cut OUT of it. Static — the mark's anchor. */}
      <Svg width={size} height={size} viewBox="0 0 24 24" style={StyleSheet.absoluteFill}>
        <Path
          fill={color}
          fillRule="evenodd"
          d="M12 5a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM11 7.2h2v3.8h3.8v2H13v3.8h-2V13H7.2v-2H11Z"
        />
      </Svg>

      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { opacity: innerOpacity, transform: [{ scale: innerScale }] }]}
      >
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Path d="M20.09 17.88A10 10 0 0 0 20.09 6.12" stroke={color} strokeWidth={1.9} strokeLinecap="round" />
          <Path d="M3.91 17.88A10 10 0 0 1 3.91 6.12" stroke={color} strokeWidth={1.9} strokeLinecap="round" />
        </Svg>
      </Animated.View>

      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { opacity: outerOpacity, transform: [{ scale: outerScale }] }]}
      >
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Path d="M22.77 17.73A12.2 12.2 0 0 0 22.77 6.27" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
          <Path d="M1.23 17.73A12.2 12.2 0 0 1 1.23 6.27" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
        </Svg>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', justifyContent: 'center' },
});

export default HealthStatusIcon;

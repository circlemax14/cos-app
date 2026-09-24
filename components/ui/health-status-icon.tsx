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
 * ─── COS-1106: WHY THE WAVES WERE CUTTING ────────────────────────────
 *
 * Two mistakes, both mine, both about measuring the wrong thing.
 *
 * An arc's widest point is its MIDDLE, not its endpoints. COS-1104 checked the
 * endpoint x of each arc and found them inside the box — but the outer pair at
 * radius 12.2 bulges to 12 + 12.2 + half its stroke = 25.0 in a 24-wide
 * viewBox. It was clipped before anything animated.
 *
 * And the wave then SCALED IT UP. These Animated.Views are absoluteFill inside
 * a size x size box; scaling a filled view past 1 pushes its content beyond
 * the view bounds, where React Native clips. 1.06 and 1.08 put both pairs
 * outside.
 *
 * So the arcs are pulled in until their widest point clears the box — 9.6 and
 * 11.0 — and the wave now grows from 0.86 to 1.0 rather than through it.
 * Expansion reads the same; it simply never leaves the frame.
 *
 * ⚠️ Any future change to a radius, a stroke or a scale must be checked at
 * (12 + radius + strokeWidth/2) * maxScale <= 24. The endpoints are not the
 * binding constraint.
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
  size = 30,
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
  const innerScale = animated ? inner.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1] }) : 1;
  const outerScale = animated ? outer.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1] }) : 1;

  return (
    <View style={[styles.box, { width: size, height: size }]}>
      {/* The disc, with the cross cut OUT of it. Static — the mark's anchor. */}
      <Svg width={size} height={size} viewBox="0 0 24 24" style={StyleSheet.absoluteFill}>
        <Path
          fill={color}
          fillRule="evenodd"
          d="M12 4.6a7.4 7.4 0 1 0 0 14.8 7.4 7.4 0 0 0 0-14.8ZM10.95 6.9h2.1v4.05h4.05v2.1h-4.05v4.05h-2.1v-4.05H6.9v-2.1h4.05Z"
        />
      </Svg>

      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { opacity: innerOpacity, transform: [{ scale: innerScale }] }]}
      >
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Path d="M19.56 17.91A9.6 9.6 0 0 0 19.56 6.09" stroke={color} strokeWidth={1.9} strokeLinecap="round" />
          <Path d="M4.44 17.91A9.6 9.6 0 0 1 4.44 6.09" stroke={color} strokeWidth={1.9} strokeLinecap="round" />
        </Svg>
      </Animated.View>

      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { opacity: outerOpacity, transform: [{ scale: outerScale }] }]}
      >
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Path d="M21.53 17.5A11 11 0 0 0 21.53 6.5" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
          <Path d="M2.47 17.5A11 11 0 0 1 2.47 6.5" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
        </Svg>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', justifyContent: 'center' },
});

export default HealthStatusIcon;

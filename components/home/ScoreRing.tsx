/**
 * COS-1041 — a circular score dial for the Home hero tiles.
 *
 * Ken 2026-09-18: the Wellbeing and Health numbers on Home should look like
 * the dial on the detail screen, not a bare figure in a box.
 *
 * ─── WHY THIS IS NOT DialGauge ──────────────────────────────────────────
 *
 * The obvious move is to reuse components/health/DialGauge. It is the right
 * component and it is already on the wellbeing-score screen — but it draws
 * with react-native-svg, and Home's cards are deliberately SVG-free.
 *
 * DailyReadCard.tsx states the rule, and HealthAgeCard.tsx follows it:
 *   "Pure primitive envelope (View / Text / Pressable / MaterialIcons /
 *    StyleSheet) — iOS 26.5-hardened, no Animated, no LayoutAnimation,
 *    no react-native-svg."
 *
 * That is a decision someone made after this app crashed on production from
 * cold-mount rendering (ADR-0003), not an oversight to tidy up. cos-app's
 * CLAUDE.md says the same thing in general terms: on Home, keep changes
 * subtractive and do not introduce a new primitive. So the dial is rebuilt
 * here out of Views, and Home keeps its envelope.
 *
 * ─── HOW A RING IS DRAWN WITH NO SVG ────────────────────────────────────
 *
 * Two half-width windows with `overflow: 'hidden'`, each containing a full
 * circle that is half-coloured. Rotating the circle inside its window sweeps
 * a coloured arc across that half:
 *
 *   progress 0.00 - 0.50  →  right window rotates 0 - 180deg, left is empty
 *   progress 0.50 - 1.00  →  right window is fully swept and holds at 180deg,
 *                            left window rotates 0 - 180deg
 *
 * Each inner circle colours only its LEADING half (borderTopColor and
 * borderRightColor on the right; bottom and left on the left) and is
 * pre-rotated 45deg, which is what puts the coloured semicircle exactly on
 * the window's side before any progress rotation is applied.
 *
 * `transform: rotate` here is a static style on a static value, not Animated
 * and not LayoutAnimation — the two things the hardening note actually names.
 *
 * The geometry is pure and lives in `ringSweep` so it can be tested without a
 * renderer; see tests/unit/score-ring.test.ts.
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';

/**
 * Degrees to rotate each half-window for a given progress.
 *
 * Pure, exported and tested. Clamps rather than trusting the caller: a score
 * outside 0..1 would otherwise rotate an arc back over itself and render as a
 * smaller value than the real one, which on a health figure is worse than
 * rendering nothing.
 */
export function ringSweep(progress: number): { right: number; left: number } {
  const p = Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0;
  return {
    right: Math.min(p, 0.5) * 360,
    left: Math.max(0, p - 0.5) * 360,
  };
}

export function ScoreRing({
  progress,
  size,
  stroke,
  color,
  trackColor,
  children,
}: {
  /** 0..1. Clamped — see ringSweep. */
  progress: number;
  size: number;
  stroke: number;
  color: string;
  trackColor: string;
  children?: React.ReactNode;
}): React.JSX.Element {
  const half = size / 2;
  const sweep = ringSweep(progress);

  // One window and its inner circle. `side` decides which half of the inner
  // circle carries the colour and therefore which half of the ring it paints.
  const Half = ({ side, rotate }: { side: 'right' | 'left'; rotate: number }) => (
    <View
      style={[
        styles.window,
        { width: half, height: size, [side]: 0 } as never,
      ]}
      pointerEvents="none"
    >
      <View
        style={{
          width: size,
          height: size,
          borderRadius: half,
          borderWidth: stroke,
          borderTopColor: side === 'right' ? color : 'transparent',
          borderRightColor: side === 'right' ? color : 'transparent',
          borderBottomColor: side === 'left' ? color : 'transparent',
          borderLeftColor: side === 'left' ? color : 'transparent',
          // Pull the full circle so only its correct half sits in the window.
          marginLeft: side === 'right' ? -half : 0,
          // 45deg seats the coloured semicircle on the window's side; the
          // sweep then rotates it across.
          transform: [{ rotate: `${45 + rotate}deg` }],
        }}
      />
    </View>
  );

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {/* Track first, so the coloured arc paints over it. */}
      <View
        style={[
          styles.window,
          {
            width: size,
            height: size,
            borderRadius: half,
            borderWidth: stroke,
            borderColor: trackColor,
          },
        ]}
        pointerEvents="none"
      />
      {sweep.right > 0 && <Half side="right" rotate={sweep.right} />}
      {sweep.left > 0 && <Half side="left" rotate={sweep.left} />}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  window: { position: 'absolute', overflow: 'hidden' },
});

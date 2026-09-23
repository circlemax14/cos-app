import React from 'react';
import Svg, { Path } from 'react-native-svg';

interface HealthStatusIconProps {
  size?: number;
  color: string;
}

/**
 * COS-1081 — the Health Status icon, redrawn to Vishal's mark.
 *
 * A bold ring, a gap, and a solid disc with a medical cross cut out of it.
 *
 * ─── WHAT IT REPLACES, AND WHY ───────────────────────────────────────
 *
 * COS-964 drew a clipboard from Ken's sketch: a board, a clip, a small circled
 * cross and two record lines. Five separate elements inside a 26px tab icon.
 * At that size the clip reads as noise, the record lines merge into a grey
 * smudge, and the cross — the one part that says "health" — is a 3.1px circle
 * carrying a 1.4px stroke.
 *
 * Vishal's replacement keeps only the part that was doing the work and makes
 * it the whole mark. One idea at one weight, legible at 26px and still correct
 * blown up in a header.
 *
 * ─── WHY IT IS CUT OUT RATHER THAN DRAWN IN WHITE ────────────────────
 *
 * The supplied artwork is black-on-white, so the obvious translation is a
 * filled circle with a white cross on top. That breaks the moment the tab bar
 * is not white — a white cross on a dark surface is a white cross, not a hole,
 * and it stops matching the tint every other icon here follows.
 *
 * So the cross and the inner gap are HOLES, made with `fillRule="evenodd"`:
 * the shape is painted once in `color`, and the counters let the background
 * through, whatever the background happens to be. One colour in, correct on
 * light, dark, active and inactive.
 *
 * Geometry is against a 24x24 viewBox and scales, so there is no stroke weight
 * to tune per size and nothing thins out when the icon grows.
 */

/** A circle as a path, so it can share a fill rule with the shapes it cuts. */
const circle = (cx: number, cy: number, r: number): string =>
  `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 ${-r * 2} 0Z`;

/** A plus sign centred on (cx, cy): `arm` is half-thickness, `reach` half-length. */
const cross = (cx: number, cy: number, arm: number, reach: number): string =>
  `M${cx - arm} ${cy - reach}` +
  `H${cx + arm}V${cy - arm}` +
  `H${cx + reach}V${cy + arm}` +
  `H${cx + arm}V${cy + reach}` +
  `H${cx - arm}V${cy + arm}` +
  `H${cx - reach}V${cy - arm}` +
  `H${cx - arm}Z`;

export function HealthStatusIcon({ size = 26, color }: HealthStatusIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {/* Outer ring: disc with a hole. */}
      <Path d={`${circle(12, 12, 11.2)} ${circle(12, 12, 8.9)}`} fill={color} fillRule="evenodd" />
      {/* Inner disc with the cross cut out of it. The gap between this and the
          ring is simply the space neither path paints. */}
      <Path d={`${circle(12, 12, 7.7)} ${cross(12, 12, 1.7, 5.1)}`} fill={color} fillRule="evenodd" />
    </Svg>
  );
}

export default HealthStatusIcon;

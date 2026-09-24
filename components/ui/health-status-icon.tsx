import React from 'react';
import Svg, { Path } from 'react-native-svg';

interface HealthStatusIconProps {
  size?: number;
  color: string;
}

/**
 * COS-1104 — the Health Status icon: the cross, broadcasting.
 *
 * A medical cross cut out of a solid disc, with arcs radiating symmetrically
 * to either side. Option 2 ("Broadcast") from the 2026-09-24 proposal.
 *
 * ─── WHY THE ARCS ────────────────────────────────────────────────────
 *
 * COS-1081's mark was a cross in a ring, and it had two problems that had
 * nothing to do with how well it was drawn.
 *
 * It said MEDICAL. A cross means first aid, hospital, clinic. Ken's definition
 * of this tab is narrower — "an ACTIVE clinical status, not a generated
 * summary and not a history" — and nothing in a static cross says "where you
 * are right now". The arcs are what add that: they are the grammar of a live
 * signal, and they turn a symbol for medicine into a reading being taken.
 *
 * And it COLLIDED WITH ITS NEIGHBOUR. The Plan tab sits immediately beside it
 * and is also a round custom mark — a pulse in a circle. At 26px two adjacent
 * circles of similar weight read as one blob and the eye has to decode which
 * is which every time. The arcs break the silhouette, so the two no longer
 * rhyme.
 *
 * ─── WHY THE CROSS IS STILL A HOLE ───────────────────────────────────
 *
 * Carried forward from COS-1081, and it still matters. The obvious way to draw
 * this is a filled disc with a white cross painted on top. That looks identical
 * on a white tab bar and wrong on any other — a white cross on a dark surface
 * is a white cross, not a hole. `fillRule="evenodd"` makes it a genuine
 * cut-out, so the bar shows through whatever colour it is.
 *
 * ─── DENSITY ─────────────────────────────────────────────────────────
 *
 * Five elements: the disc, and four arcs. That is at the top of what survives
 * 26px, which is why the outer pair is drawn thinner and at 45% opacity — they
 * read as depth rather than as two more shapes. If they turn to haze on a real
 * device, deleting those two lines leaves a clean three-element mark; the
 * proposal recorded that trade before this shipped.
 *
 * Geometry is a 24x24 viewBox scaled to `size`, so it stays crisp at the 26px
 * tab size and correct enlarged in a header.
 */
export function HealthStatusIcon({ size = 26, color }: HealthStatusIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* The disc, with the cross cut OUT of it — see the header. */}
      <Path
        fill={color}
        fillRule="evenodd"
        d="M12 6.2a5.8 5.8 0 1 0 0 11.6 5.8 5.8 0 0 0 0-11.6Zm-.75 2v3.05H8.2v1.5h3.05v3.05h1.5v-3.05h3.05v-1.5H12.75V8.2Z"
      />

      {/* Inner arcs — the signal. Rounded caps so they do not look chopped. */}
      <Path
        d="M18.54 17.89A8.8 8.8 0 0 0 18.54 6.11"
        stroke={color}
        strokeWidth={1.9}
        strokeLinecap="round"
      />
      <Path
        d="M5.46 17.89A8.8 8.8 0 0 1 5.46 6.11"
        stroke={color}
        strokeWidth={1.9}
        strokeLinecap="round"
      />

      {/*
        Outer arcs. Thinner and faded — the same colour at lower opacity, never
        a second colour: this icon inherits ONE tint from the tab bar and
        cannot introduce another.
      */}
      <Path
        d="M21.35 17.4A10.8 10.8 0 0 0 21.35 6.6"
        stroke={color}
        strokeWidth={1.7}
        strokeLinecap="round"
        opacity={0.45}
      />
      <Path
        d="M2.65 17.4A10.8 10.8 0 0 1 2.65 6.6"
        stroke={color}
        strokeWidth={1.7}
        strokeLinecap="round"
        opacity={0.45}
      />
    </Svg>
  );
}

export default HealthStatusIcon;

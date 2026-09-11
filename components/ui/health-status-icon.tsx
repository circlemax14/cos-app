import React from 'react';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';

interface HealthStatusIconProps {
  size?: number;
  color: string;
  /** Stroke weight. Scales with size by default so it reads at any tab size. */
  strokeWidth?: number;
}

/**
 * COS-964 — the Health Status icon, drawn to Ken's sketch.
 *
 * A clipboard with a clip at the top, a circled medical cross in the upper
 * body, and three record lines beneath it. Line art only, single colour,
 * inheriting the tab's active/inactive tint like every other icon here.
 *
 * ─── WHY IT REPLACES AiClipboardIcon ON THIS TAB ─────────────────────
 *
 * That icon carries an AI sparkle, and its own comment explains the intent:
 * the tab was an "AI-synthesized snapshot", so it read as "chart, but smart".
 * The tab is becoming HEALTH STATUS — Ken's point being that it is an ACTIVE
 * CLINICAL STATUS, not a generated summary and not a history. A sparkle says
 * "the computer wrote this", which is the opposite of the message.
 *
 * AiClipboardIcon is deliberately NOT deleted: it still fits any surface that
 * genuinely is AI-generated, and removing it would be a second, unrelated
 * change riding along with a rename.
 *
 * ─── DRAWN, NOT IMPORTED ─────────────────────────────────────────────
 *
 * Ken supplied a specific mark. The nearest lucide equivalents
 * (ClipboardPlus, FilePlus) put the cross bare rather than circled and carry
 * no record lines, so they are recognisably a different icon. This is ~20
 * lines of SVG against a dependency that would not match the drawing.
 *
 * Geometry is expressed against a 24x24 viewBox and scaled, so it stays crisp
 * at the 26px tab size and at the larger sizes a header uses.
 */
export function HealthStatusIcon({
  size = 26,
  color,
  strokeWidth,
}: HealthStatusIconProps) {
  // Hairlines disappear on a large render; a fixed weight blocks up on a small
  // one. Scaling keeps the mark looking like the same icon at every size.
  const sw = strokeWidth ?? Math.max(1.4, size * 0.075);

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* The board */}
      <Rect
        x={4}
        y={3.5}
        width={16}
        height={18}
        rx={2.2}
        stroke={color}
        strokeWidth={sw}
      />
      {/* The clip at the top, drawn as a tab rather than a full rectangle so it
          reads as a clip and not as a second nested box at small sizes. */}
      <Path
        d="M9.6 3.5V2.9c0-.6.5-1.1 1.1-1.1h2.6c.6 0 1.1.5 1.1 1.1v.6"
        stroke={color}
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* The circled cross — the medical mark */}
      <Circle cx={12} cy={9.6} r={3.1} stroke={color} strokeWidth={sw} />
      <Line x1={12} y1={8.1} x2={12} y2={11.1} stroke={color} strokeWidth={sw} strokeLinecap="round" />
      <Line x1={10.5} y1={9.6} x2={13.5} y2={9.6} stroke={color} strokeWidth={sw} strokeLinecap="round" />
      {/* Record lines. Three, shortening slightly, so the lower half reads as
          written content rather than as an empty box. */}
      <Line x1={7.6} y1={15.6} x2={16.4} y2={15.6} stroke={color} strokeWidth={sw} strokeLinecap="round" />
      <Line x1={7.6} y1={18} x2={16.4} y2={18} stroke={color} strokeWidth={sw} strokeLinecap="round" />
    </Svg>
  );
}

export default HealthStatusIcon;

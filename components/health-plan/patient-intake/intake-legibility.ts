/**
 * COS-1216 / COS-1221 — legibility primitives for the Health Status intake.
 *
 * ─── 1. TYPE DID NOT SCALE WITH THE SCREEN ───────────────────────────
 *
 * Every size in this folder is a phone size handed straight to
 * `getScaledFontSize`. On a tablet with default settings that helper is the
 * identity function — `rawFontScale` is 1, `accessibilityMultiplier` is 1 — so
 * a 13pt hint renders at 13pt on a ~10" iPad held at arm's length. Its
 * internal `isTablet()` only REMOVES the phone dampening; it never enlarges
 * anything. Stakeholders reviewing the intake on iPad read it as "the font is
 * very small", and they were right: it is literally the phone's point size.
 *
 * So the base size gets a breakpoint step BEFORE the accessibility scaler
 * runs. Composition, not replacement:
 *
 *     getScaledFontSize(round(base * step))
 *
 * A patient who has already raised their system font keeps that multiplier on
 * top, and because `getScaledFontSize` caps at `base * 2` relative to whatever
 * base it is given, the cap grows with the step instead of swallowing it.
 *
 * The breakpoints are NOT redefined here. `HomeResponsiveProvider.layoutForWidth`
 * already owns the phone / tabletPortrait / tabletLandscape ladder and is
 * already pure; `use-intake-legibility.ts` calls it. A second set of thresholds
 * is the exact drift this codebase keeps shipping.
 *
 * ─── 2. CONTRAST ─────────────────────────────────────────────────────
 *
 * COS-1221 deleted this module's `IntakeTextColors`. It was a local copy of
 * tokens `constants/design-system.ts` already owns — whose own header reads
 * "Color Tokens (WCAG AAA Compliant)" — and one of its two dark values was
 * byte-identical to the token it shadowed. Secondary and validation text now
 * come from `getColors()` (see use-intake-legibility.ts), and the one token
 * that genuinely failed, `LightColors.error`, was fixed AT SOURCE.
 *
 * What stays here is the thing the design system cannot answer, because it is
 * a function of a colour chosen elsewhere: what is legible ON an accent.
 */

import type { HomeBreakpoint } from '@/components/home/HomeResponsiveProvider';

/**
 * Multiplier applied to a phone-tuned base size per breakpoint.
 *
 * phone is exactly 1 — phone sizing was confirmed good and must not move.
 * The tablet steps are modest on purpose: this is legibility, not a redesign,
 * and the product of step x system scale x accessibility mode still has to
 * wrap inside a card.
 */
export const INTAKE_TYPE_STEP: Record<HomeBreakpoint, number> = {
  phone: 1,
  tabletPortrait: 1.25,
  tabletLandscape: 1.35,
};

/**
 * Tablet step composed with the patient's own accessibility scale.
 *
 * `getScaledFontSize` is injected rather than imported so this stays a pure
 * function with no react-native in its import graph — which is what lets
 * tests/unit/intake-legibility.test.ts load it under `node --test`.
 */
export function intakeFontSize(
  base: number,
  breakpoint: HomeBreakpoint,
  getScaledFontSize: (n: number) => number,
): number {
  return getScaledFontSize(Math.round(base * INTAKE_TYPE_STEP[breakpoint]));
}

/*
 * COS-1221 — the selected option row rendered '#fff' on the section accent.
 * Measured against the BPS palette in IntakeProgressHeader.tsx:
 *
 *   life  #C97600  white 3.46:1    <- the section the LSNS questions live in
 *   body  #199C4F  white 3.55:1
 *   mind  #7B3FE4  white 5.72:1
 *
 * Two of three were under the 4.5:1 AA bar for normal text, on the exact
 * question the stakeholder complained about.
 *
 * No single label colour fixes all three: a light label needs the accent's
 * relative luminance at or below 0.183, a dark label needs it at or above
 * 0.372, and these three straddle that gap. So the label is DERIVED from the
 * accent instead of assumed, which also means a future change to Ken's BPS
 * palette cannot silently reintroduce the failure.
 *
 * The accents themselves are deliberately NOT darkened. They are also rendered
 * AS text (the inactive section chip) and as a fill on the near-black dark
 * card, and a colour dark enough for white text is too dark for both of those.
 * One hue cannot serve all three roles — see the notes on COS-1221.
 */

/** Colors.light.text. Literal because constants/theme.ts imports react-native. */
const ACCENT_LABEL_DARK = '#11181C';
const ACCENT_LABEL_LIGHT = '#FFFFFF';

function channel(c: number): number {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance. Accepts #rgb and #rrggbb. */
export function relativeLuminance(hex: string): number {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  return (
    0.2126 * channel((n >> 16) & 255) +
    0.7152 * channel((n >> 8) & 255) +
    0.0722 * channel(n & 255)
  );
}

/**
 * The more legible of near-black / white on `background`.
 *
 * Both candidates are compared by real contrast ratio rather than by a
 * luminance threshold, so the answer is the correct one at the boundary too.
 * Theme-independent on purpose: the accent is the same hex in light and dark,
 * so the label that reads on it is the same hex in both.
 */
export function readableOn(background: string): string {
  const bg = relativeLuminance(background);
  const dark = (bg + 0.05) / (relativeLuminance(ACCENT_LABEL_DARK) + 0.05);
  const light = (relativeLuminance(ACCENT_LABEL_LIGHT) + 0.05) / (bg + 0.05);
  return dark >= light ? ACCENT_LABEL_DARK : ACCENT_LABEL_LIGHT;
}

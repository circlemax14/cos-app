/**
 * COS-1216 / COS-1221 — the one hook every intake component calls.
 *
 * It replaces the `useAccessibility()` + `Colors[isDarkTheme ? …]` pair that
 * all fifteen components in this folder were repeating, and folds in the
 * breakpoint step. One call site per component means a future type or contrast
 * change lands in one place instead of fifteen.
 *
 * WHY THE WIDTH IS READ HERE AND NOT FROM `useHomeLayout()`: the intake wizard
 * is a health-plan screen, not a Home subtree, so it sits OUTSIDE
 * HomeResponsiveProvider — the context would hand back its `phone` default on
 * an iPad. `layoutForWidth` is the pure, exported derive from that same file,
 * so the thresholds are shared even though the provider is not.
 *
 * `useWindowDimensions()` re-renders on every dimension tick during an iPad
 * rotation. That is fine here: a question card is a handful of rows, and
 * `fs()` is arithmetic. The split-context dance in HomeResponsiveProvider
 * exists for a 3-column grid of score cards, not for this.
 *
 * TWO PALETTES, ON PURPOSE (COS-1221). `colors` is `constants/theme`'s Colors,
 * because that is what these components already paint their surfaces with
 * (card #f5f5f5 / #1e2022, background #fff / #151718) and repainting them is an
 * app-wide redesign, not a legibility fix. `muted` and `error` are the
 * design-system tokens — the app's declared "WCAG AAA Compliant" set, which
 * constants/theme itself re-exports — measured against those surfaces:
 *
 *   muted  = secondary  light #4B5563  6.93:1 on card   7.56:1 on background
 *                        dark #9CA3AF  6.44:1 on card   7.08:1 on background
 *   error              light #B91C1C  5.93:1 on card   6.47:1 on background
 *                        dark #F87171  5.91:1 on card   6.50:1 on background
 *
 * There is no third palette. The previous round added one (`IntakeTextColors`)
 * and it is gone; `LightColors.error` was 4.43:1 and was fixed where it lives.
 *
 * iOS 26.5 envelope: no primitives in this file at all — it is JS wiring.
 */

import { useWindowDimensions } from 'react-native';

import { layoutForWidth, type HomeBreakpoint } from '@/components/home/HomeResponsiveProvider';
import { Colors, getColors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';

import { intakeFontSize } from './intake-legibility';

export interface IntakeLegibility {
  /** Current breakpoint bucket, from HomeResponsiveProvider's ladder. */
  breakpoint: HomeBreakpoint;
  /** Theme palette for the active theme — same object the components used before. */
  colors: (typeof Colors)['light'];
  /** Dark mode, for the few components that pick an alpha per theme. */
  isDark: boolean;
  /** Breakpoint-stepped, accessibility-scaled font size. Use instead of getScaledFontSize. */
  fs: (base: number) => number;
  /** Unchanged pass-through of getScaledFontWeight. */
  fw: (base: number) => string;
  /** design-system `secondary`: AA secondary text (hints, notes, suffixes, placeholders). */
  muted: string;
  /** design-system `error`: AA validation text. */
  error: string;
  /**
   * COS-1223 — an accent that is legible AS TEXT.
   *
   * `colors.tint` (#008080) is an AA FILL, not an AA text colour: 4.38:1 on the
   * card and 3.42:1 on the dark card, both under 4.5. Any teal-coloured LABEL
   * must use this instead, so a tappable action keeps the brand hue without
   * dropping below AA for the 60+/low-vision audience this epic is for.
   * light `primaryDark` #0F766E 5.02:1 on card · dark `primary` #2DD4BF 8.78:1
   */
  actionTint: string;
}

export function useIntakeLegibility(): IntakeLegibility {
  const { width } = useWindowDimensions();
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();

  const isDark = !!settings.isDarkTheme;
  const { breakpoint } = layoutForWidth(width);
  const tokens = getColors(isDark);

  return {
    breakpoint,
    colors: Colors[isDark ? 'dark' : 'light'],
    isDark,
    // ponytail: not memoized — getScaledFontSize is a fresh closure on every
    // store render anyway, so a useCallback here would only ever miss.
    fs: (base: number) => intakeFontSize(base, breakpoint, getScaledFontSize),
    fw: getScaledFontWeight,
    muted: tokens.secondary,
    error: tokens.error,
    actionTint: isDark ? tokens.primary : tokens.primaryDark,
  };
}

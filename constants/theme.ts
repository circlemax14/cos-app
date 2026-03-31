import { Platform } from 'react-native';
import { LightColors, DarkColors, getColors } from './design-system';

// Explicit interface so Colors['light'] and Colors['dark'] share the same type,
// maintaining backwards compatibility with components typed as `typeof Colors['light']`.
interface ColorScheme {
  text: string;
  background: string;
  tint: string;
  icon: string;
  tabIconDefault: string;
  tabIconSelected: string;
  primary: string;
  subtext: string;
  border: string;
  card: string;
  cardBackground: string;
  disabled: string;
}

// Backwards-compatible Colors object for existing code
// New code should import from design-system.ts directly
export const Colors: { light: ColorScheme; dark: ColorScheme } = {
  light: {
    text: LightColors.text,
    background: LightColors.background,
    tint: LightColors.tint,
    icon: LightColors.icon,
    tabIconDefault: LightColors.tabIconDefault,
    tabIconSelected: LightColors.tabIconSelected,
    primary: LightColors.primary,
    subtext: LightColors.secondary,
    border: LightColors.border,
    card: LightColors.card,
    cardBackground: LightColors.surface,
    disabled: LightColors.disabled,
  },
  dark: {
    text: DarkColors.text,
    background: DarkColors.background,
    tint: DarkColors.tint,
    icon: DarkColors.icon,
    tabIconDefault: DarkColors.tabIconDefault,
    tabIconSelected: DarkColors.tabIconSelected,
    primary: DarkColors.primary,
    subtext: DarkColors.secondary,
    border: DarkColors.border,
    card: DarkColors.card,
    cardBackground: DarkColors.surface,
    disabled: DarkColors.disabled,
  },
};

export { getColors, LightColors, DarkColors } from './design-system';

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
});

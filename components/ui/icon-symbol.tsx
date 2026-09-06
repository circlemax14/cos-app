// Fallback for using MaterialIcons on Android and web.

import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { SymbolWeight } from 'expo-symbols';
import { ComponentProps } from 'react';
import { OpaqueColorValue, type StyleProp, type TextStyle } from 'react-native';

// SDK 55 widened SymbolViewProps['name'] to a cross-platform union
// (string SF symbol OR { ios, android, web } object). The cross-platform
// shape can't be a Record key, so we type-key with plain string and
// derive IconSymbolName from MAPPING's literal keys for consumer
// type safety.
type IconMapping = Record<string, ComponentProps<typeof MaterialIcons>['name']>;
type IconSymbolName = keyof typeof MAPPING;

/**
 * Add your SF Symbols to Material Icons mappings here.
 * - see Material Icons in the [Icons Directory](https://icons.expo.fyi).
 * - see SF Symbols in the [SF Symbols](https://developer.apple.com/sf-symbols/) app.
 */
const MAPPING = {
  'house.fill': 'home',
  'paperplane.fill': 'send',
  'chevron.left.forwardslash.chevron.right': 'code',
  'chevron.right': 'chevron-right',
  'sparkles': 'auto-awesome',
  'doc.text': 'description',
  'line.3.horizontal': 'menu',
  'list.bullet': 'format-list-bulleted',
  'accessibility': 'accessibility',
  'bell.fill': 'notifications',
  'xmark': 'close',
  'textformat.size': 'text-fields',
  'minus': 'remove',
  'plus': 'add',
  'bold': 'format-bold',
  'circle.fill': 'circle',
  'circle.lefthalf.filled': 'contrast',
  'moon.fill': 'dark-mode',
  'person.fill': 'person',
  'calendar': 'calendar-today',
  'slider.horizontal.3': 'tune',
  'slider.vertical.3': 'equalizer',
  'tray.fill': 'inbox',
  'message.fill': 'chat',
  'eye': 'visibility',
  'eye.slash': 'visibility-off',
  'checkmark.circle.fill': 'check-circle',
  'xmark.circle.fill': 'cancel',
  'square.and.arrow.up': 'share',
  'questionmark.circle': 'help-outline',
  'lock.shield': 'security',
  'lock': 'lock-outline',
  'envelope': 'mail-outline',
  'heart.fill': 'favorite',
  'checklist': 'checklist',
  'list.bullet.clipboard': 'assignment',
  'cross.case.fill': 'medical-services',
  'waveform.path.ecg': 'monitor-heart',
  /*
   * COS-928 — the ten names the app actually uses that had no Android entry.
   *
   * MAPPING[name] returned undefined for each, and MaterialIcons renders a
   * BLANK for an unknown name — so on Android the Calendar header toolbar, the
   * search field, the settings gear and the care-circle person icons were all
   * invisible. Silent: no warning, no error, just gaps where the buttons are.
   *
   * Found by diffing every `<IconSymbol name="...">` in app/ and components/
   * against this object, not by eye.
   */
  'chevron.left': 'chevron-left',
  'magnifyingglass': 'search',
  'gear': 'settings',
  'phone.fill': 'call',
  'envelope.fill': 'email',
  'person.2.fill': 'people',
  'building.2': 'apartment',
  'square.grid.2x2': 'grid-view',
  'exclamationmark.shield': 'gpp-maybe',
  'person.crop.circle.badge.exclamationmark': 'no-accounts',
} as IconMapping;

/**
 * An icon component that uses native SF Symbols on iOS, and Material Icons on Android and web.
 * This ensures a consistent look across platforms, and optimal resource usage.
 * Icon `name`s are based on SF Symbols and require manual mapping to Material Icons.
 */
export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
  weight?: SymbolWeight;
}) {
  /*
   * COS-928 — `?? 'help-outline'` so a missing mapping is VISIBLE.
   *
   * MaterialIcons renders a blank for an unknown name, so every gap above was
   * silent on Android and invisible on iOS (which uses the .ios.tsx SF Symbol
   * path and never consults this table). A question-mark glyph is ugly on
   * purpose: it shows up in the first screenshot instead of the first bug
   * report.
   */
  return (
    <MaterialIcons color={color} size={size} name={MAPPING[name] ?? 'help-outline'} style={style} />
  );
}

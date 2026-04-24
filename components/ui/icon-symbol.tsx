// Fallback for using MaterialIcons on Android and web.

import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { SymbolWeight, SymbolViewProps } from 'expo-symbols';
import { ComponentProps } from 'react';
import { OpaqueColorValue, type StyleProp, type TextStyle } from 'react-native';

type IconMapping = Record<SymbolViewProps['name'], ComponentProps<typeof MaterialIcons>['name']>;
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
  return <MaterialIcons color={color} size={size} name={MAPPING[name]} style={style} />;
}

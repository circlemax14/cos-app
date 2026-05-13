import React from 'react'
import {
  Image,
  View,
  type ImageStyle,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import {
  ENTITY_ICON,
  SPECIALTY_ICON,
  ACCENT_COLOR,
  type EntityType,
} from './icon-map'
import { specialtyToIcon } from '@/utils/specialty-to-icon'

const SIZE_PX: Record<'sm' | 'md' | 'lg', number> = { sm: 32, md: 48, lg: 96 }

export interface EntityIconProps {
  type: EntityType
  specialty?: string | null
  imageUrl?: string | null
  size?: 'sm' | 'md' | 'lg' | number
  name?: string
  style?: ViewStyle
}

function resolveSize(size: EntityIconProps['size']): number {
  if (typeof size === 'number') return size
  return SIZE_PX[size ?? 'md']
}

/**
 * RN counterpart of cos-frontend/src/components/icons/EntityIcon.tsx.
 * Same resolution chain, same accent-color rules. Image branch uses a
 * circular RN Image; icon branch wraps a Lucide RN icon in a centered View.
 *
 * testID="entity-icon-root" is the stable selector for future RN tests.
 * data-entity-icon / data-accent are also set so a snapshot or screenshot
 * test can read them if needed.
 */
export function EntityIcon({
  type,
  specialty,
  imageUrl,
  size = 'md',
  name,
  style,
}: EntityIconProps): React.JSX.Element {
  const px = resolveSize(size)
  const altOrLabel = name ?? type

  if (imageUrl) {
    // ViewStyle and ImageStyle overlap on the props we care about (size,
    // borderRadius). Cast so callers can pass a single `style` prop without
    // juggling two style types — RN ignores any leftover ViewStyle-only keys.
    const imageStyle: StyleProp<ImageStyle> = [
      { width: px, height: px, borderRadius: px / 2 },
      style as ImageStyle | undefined,
    ]
    return (
      <Image
        source={{ uri: imageUrl }}
        accessibilityLabel={altOrLabel}
        testID="entity-icon-root"
        style={imageStyle}
      />
    )
  }

  const specialtyName = type === 'provider' ? specialtyToIcon(specialty ?? null) : null
  const { lucide: TypeLucide, accent: typeAccent } = ENTITY_ICON[type]
  const Lucide = specialtyName ? SPECIALTY_ICON[specialtyName] : TypeLucide
  const accentKey = specialtyName ? 'delivery' : typeAccent
  const accent = ACCENT_COLOR[accentKey]

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={altOrLabel}
      testID="entity-icon-root"
      style={[
        { width: px, height: px, alignItems: 'center', justifyContent: 'center' },
        style,
      ]}
    >
      <Lucide width={px} height={px} strokeWidth={1.5} color={accent} />
    </View>
  )
}

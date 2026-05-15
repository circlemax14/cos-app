import React from 'react'
import {
  Image,
  View,
  type ImageStyle,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import { SvgUri } from 'react-native-svg'
import {
  ENTITY_ICON,
  SPECIALTY_ICON,
  type EntityType,
} from './icon-map'
import { specialtyToIcon } from '@/utils/specialty-to-icon'
import { Colors } from '@/constants/theme'

const SIZE_PX: Record<'sm' | 'md' | 'lg', number> = { sm: 32, md: 48, lg: 96 }

/**
 * Single theme color for both the ring border and the icon stroke —
 * mirrors the web side's use of `var(--p-primary)`. Per-entity-type
 * accents (the old recipient/delivery/organization palette) are dropped:
 * the icon glyph alone differentiates patient from provider from agency,
 * and layering color variation on top read as busy in the dev build
 * (2026-05-13).
 *
 * If/when cos-app gains a light/dark theme switcher, swap this for
 * `useColorScheme()` → `Colors[scheme].primary`.
 */
const RING_COLOR = Colors.light.primary

export interface EntityIconProps {
  type: EntityType
  specialty?: string | null
  imageUrl?: string | null
  /**
   * Designer-uploaded custom SVG, served from our S3 icon bucket. Takes
   * priority over the built-in specialty + entity-type fallback but loses
   * to imageUrl (per-instance photo). SVG must use `currentColor` so the
   * `color={RING_COLOR}` prop tints it to the active theme.
   */
  iconUrl?: string | null
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
  iconUrl,
  size = 'md',
  name,
  style,
}: EntityIconProps): React.JSX.Element {
  const px = resolveSize(size)
  const altOrLabel = name ?? type

  // Track when remote sources fail to load so we fall back to the built-in
  // Lucide glyph instead of showing a half-rendered SVG (e.g., a pink box
  // with stray text — see SCRUM-181 real-device repro). One-way state: once
  // a source has failed for this instance, we don't retry it on re-render.
  const [imageFailed, setImageFailed] = React.useState(false)
  const [svgFailed, setSvgFailed] = React.useState(false)

  // Reset failure state if the URL itself changes (e.g., user uploads a new
  // photo, or the parent passes a new presigned URL after the previous one
  // expired). Without this, a one-time failure would stick across URL swaps.
  React.useEffect(() => { setImageFailed(false) }, [imageUrl])
  React.useEffect(() => { setSvgFailed(false) }, [iconUrl])

  if (imageUrl && !imageFailed) {
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
        {...({ 'data-entity-icon': `image:${type}` } as Record<string, string>)}
        style={imageStyle}
        onError={() => setImageFailed(true)}
      />
    )
  }

  if (iconUrl && !svgFailed) {
    const innerPx = Math.round(px * 0.58)
    return (
      <View
        accessibilityRole="image"
        accessibilityLabel={altOrLabel}
        testID="entity-icon-root"
        {...({ 'data-entity-icon': `icon-url:${type}` } as Record<string, string>)}
        style={[
          {
            width: px,
            height: px,
            borderRadius: px / 2,
            borderWidth: 1.5,
            borderColor: RING_COLOR,
            backgroundColor: 'transparent',
            alignItems: 'center',
            justifyContent: 'center',
          },
          style,
        ]}
      >
        <SvgUri
          uri={iconUrl}
          width={innerPx}
          height={innerPx}
          color={RING_COLOR}
          onError={() => setSvgFailed(true)}
        />
      </View>
    )
  }

  const specialtyName = type === 'provider' ? specialtyToIcon(specialty ?? null) : null
  const { lucide: TypeLucide } = ENTITY_ICON[type]
  const Lucide = specialtyName ? SPECIALTY_ICON[specialtyName] : TypeLucide

  // Glyph sits inside the ring at ~58% of the disc diameter, matching
  // the visual weight of the old initials inside InitialsAvatar.
  const innerPx = Math.round(px * 0.58)

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={altOrLabel}
      testID="entity-icon-root"
      {...({ 'data-entity-icon': specialtyName ? `specialty:${specialtyName}` : `type:${type}` } as Record<string, string>)}
      style={[
        {
          width: px,
          height: px,
          borderRadius: px / 2,
          borderWidth: 1.5,
          borderColor: RING_COLOR,
          backgroundColor: 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
    >
      <Lucide width={innerPx} height={innerPx} strokeWidth={1.75} color={RING_COLOR} />
    </View>
  )
}

import React from 'react'
import {
  Image,
  Text,
  View,
  type ImageStyle,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import { SvgUri, SvgXml } from 'react-native-svg'
import {
  ENTITY_ICON,
  SPECIALTY_ICON,
  type EntityType,
} from './icon-map'
import { specialtyToIcon } from '@/utils/specialty-to-icon'
import { useSpecialtyIcons } from '@/hooks/use-specialty-icons'
import { Colors } from '@/constants/theme'

/**
 * Build display initials from a name. "Christopher A. Walter, DO" → "CW",
 * "Hayley Do" → "HD", "Peter M. Smith, MD" → "PS". Strips common titles
 * and credentials. Always 2 letters max. Falls back to "?" if a usable
 * pair can't be derived.
 */
function nameToInitials(raw: string | undefined): string {
  if (!raw) return '?'
  const TITLES = new Set([
    'dr', 'mr', 'mrs', 'ms', 'md', 'do', 'rn', 'np', 'pa', 'pa-c',
    'dds', 'dmd', 'pharmd', 'phd', 'dnp', 'fnp', 'cnp', 'lcsw',
  ])
  const parts = raw
    .replace(/[.,]/g, '')
    .split(/\s+/)
    .filter((p) => p.length > 0 && !TITLES.has(p.toLowerCase()))
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

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

  // Backend-served specialty icon map. Fetched once, cached 1h. We resolve the
  // specialty string to an icon key (e.g. "Registered Nurse" → "nursing") and
  // look up the record — which carries *either* inline SVG content *or* an
  // image URL (set by the admin in the dashboard). SVG path uses <SvgXml/>
  // (lucide-react-native renders as a corrupted "Uni" placeholder on iOS 26
  // production builds — see project_app_debugging_playbook.md); image-URL
  // path uses <Image> just like an entity photo.
  const { data: specialtyIcons } = useSpecialtyIcons()
  const iconKey = specialtyToIcon(specialty)
  const specialtyRecord = iconKey ? specialtyIcons?.[iconKey] : undefined
  const specialtyImageUrl = specialtyRecord?.imageUrl
  const specialtySvg = specialtyRecord?.svg

  // Independent failure flag for the specialty-image branch so a one-time
  // load failure doesn't stick across record swaps (e.g. admin replaces the
  // image URL while the app is running).
  const [specialtyImageFailed, setSpecialtyImageFailed] = React.useState(false)
  React.useEffect(() => { setSpecialtyImageFailed(false) }, [specialtyImageUrl])

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

  if (specialtyImageUrl && !specialtyImageFailed) {
    const innerPx = Math.round(px * 0.66)
    return (
      <View
        accessibilityRole="image"
        accessibilityLabel={altOrLabel}
        testID="entity-icon-root"
        {...({ 'data-entity-icon': `specialty-image:${iconKey}` } as Record<string, string>)}
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
            overflow: 'hidden',
          },
          style,
        ]}
      >
        <Image
          source={{ uri: specialtyImageUrl }}
          accessibilityLabel={altOrLabel}
          style={{ width: innerPx, height: innerPx }}
          resizeMode="contain"
          onError={() => setSpecialtyImageFailed(true)}
        />
      </View>
    )
  }

  if (specialtySvg) {
    const innerPx = Math.round(px * 0.58)
    return (
      <View
        accessibilityRole="image"
        accessibilityLabel={altOrLabel}
        testID="entity-icon-root"
        {...({ 'data-entity-icon': `specialty-svg:${iconKey}` } as Record<string, string>)}
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
        <SvgXml
          xml={specialtySvg}
          width={innerPx}
          height={innerPx}
          color={RING_COLOR}
        />
      </View>
    )
  }

  // Final fallback: text initials inside the circular ring. We used to render
  // a Lucide-react-native SVG glyph here, but on iOS 26 production builds the
  // glyphs render as a corrupted "Uni" placeholder (root cause TBD — likely a
  // lucide-react-native + react-native-svg + iOS 26 interaction). Text initials
  // are guaranteed to render legibly on every platform and version, so we use
  // them as the always-safe fallback. The initials derive from `name` so they
  // identify the entity (e.g. "CW" for Christopher Walter).
  const initials = nameToInitials(name)
  const fontSize = Math.round(px * 0.34)

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={altOrLabel}
      testID="entity-icon-root"
      {...({ 'data-entity-icon': `initials:${type}` } as Record<string, string>)}
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
      <Text
        style={{
          fontSize,
          fontWeight: '600',
          color: RING_COLOR,
          textAlign: 'center',
          // Prevent the OS dynamic-type setting from blowing up tiny avatars.
          // The size we compute is already proportional to the disc diameter.
          includeFontPadding: false,
        }}
        allowFontScaling={false}
        numberOfLines={1}
      >
        {initials}
      </Text>
    </View>
  )
}

/* Keep these imports referenced even though the Lucide path is currently
   unused — once the iOS 26 SVG rendering issue is properly diagnosed we may
   want to restore the glyph fallback for some entity types. */
void ENTITY_ICON
void SPECIALTY_ICON
void specialtyToIcon

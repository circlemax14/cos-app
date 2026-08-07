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
import { resolveResignedPhotoUrl } from '@/services/user-photo'
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
  // with stray text — see SCRUM-181 real-device repro).
  const [imageFailed, setImageFailed] = React.useState(false)
  const [svgFailed, setSvgFailed] = React.useState(false)

  /**
   * ── BUG FIX: "profile photo showed for a while, then only initials" ──────
   *
   * WHY THIS EXISTS. `imageUrl` for the signed-in patient is a presigned S3
   * GET URL that the backend signs with a ONE HOUR expiry
   * (cos-backend/src/routes/upload.routes.ts → `expiresIn: 3600`). Once that
   * signature expires S3 answers 403, RN fires `onError`, and this component
   * used to latch `imageFailed = true` forever. The reset effect keyed on
   * `imageUrl` could not save us, because the URL string never changed — the
   * store held one URL for the whole process lifetime. Result: the avatar
   * silently degraded to initials and stayed there until the app was killed,
   * which is indistinguishable to the user from "my photo was deleted".
   *
   * The durable fix is in stores/user-photo-store.tsx (re-sign before
   * expiry). This is the belt-and-braces half: on the FIRST load failure we
   * ask for a freshly signed URL and try exactly once more. Only if that
   * second attempt also fails do we fall back to initials.
   *
   * `resolveResignedPhotoUrl` is a no-op (immediate null) for any URL that
   * isn't the signed-in user's photo, so doctor/agency/clinic avatars pay
   * nothing for this and behave exactly as before: one error → initials.
   *
   * The retry budget is ONE. `retriedRef` is only cleared when `imageUrl`
   * itself changes, so a permanently-dead object can't spin.
   */
  const [displayUrl, setDisplayUrl] = React.useState<string | null>(imageUrl ?? null)
  const retriedRef = React.useRef(false)
  const mountedRef = React.useRef(true)
  React.useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  // Reset failure state if the URL itself changes (e.g., user uploads a new
  // photo, or the store re-signs an expiring presigned URL). Without this, a
  // one-time failure would stick across URL swaps.
  React.useEffect(() => {
    setDisplayUrl(imageUrl ?? null)
    setImageFailed(false)
    retriedRef.current = false
  }, [imageUrl])
  React.useEffect(() => { setSvgFailed(false) }, [iconUrl])

  const handleImageError = React.useCallback(() => {
    const failedUrl = displayUrl
    if (retriedRef.current) {
      // Second failure for this URL — genuinely unavailable. Fall back.
      setImageFailed(true)
      return
    }
    retriedRef.current = true
    void resolveResignedPhotoUrl(failedUrl)
      .then((fresh) => {
        if (!mountedRef.current) return
        if (fresh) {
          // New URL → <Image> remounts against it. If this one fails too the
          // branch above latches the initials fallback.
          setDisplayUrl(fresh)
        } else {
          setImageFailed(true)
        }
      })
      .catch(() => {
        if (mountedRef.current) setImageFailed(true)
      })
  }, [displayUrl])

  /**
   * Distinguishes the two ways an avatar ends up showing initials:
   *   • no photo was ever set  → plain label, nothing is wrong
   *   • a photo exists but its URL failed twice → announce it, so a
   *     screen-reader user isn't told "photo of X" for a blank disc and a
   *     sighted user has a non-colour cue that something is off.
   */
  const photoUnavailable = !!imageUrl && imageFailed

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

  if (displayUrl && !imageFailed) {
    // ViewStyle and ImageStyle overlap on the props we care about (size,
    // borderRadius). Cast so callers can pass a single `style` prop without
    // juggling two style types — RN ignores any leftover ViewStyle-only keys.
    const imageStyle: StyleProp<ImageStyle> = [
      { width: px, height: px, borderRadius: px / 2 },
      style as ImageStyle | undefined,
    ]
    return (
      <Image
        // `key` forces a fresh native image request when we swap in a
        // re-signed URL. Without it RN can reuse the failed request's state
        // for the same <Image> instance and never retry the load.
        key={displayUrl}
        source={{ uri: displayUrl }}
        accessibilityLabel={altOrLabel}
        testID="entity-icon-root"
        {...({ 'data-entity-icon': `image:${type}` } as Record<string, string>)}
        style={imageStyle}
        onError={handleImageError}
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
      // Never colour-only signalling: the "photo unavailable" state is carried
      // in words for assistive tech rather than a tinted ring. The visual
      // treatment is intentionally identical to the no-photo case so we don't
      // put an error badge on every patient's face during a network blip.
      accessibilityLabel={
        photoUnavailable ? `${altOrLabel}, photo unavailable` : altOrLabel
      }
      testID="entity-icon-root"
      {...({
        'data-entity-icon': `${photoUnavailable ? 'initials-photo-failed' : 'initials'}:${type}`,
      } as Record<string, string>)}
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

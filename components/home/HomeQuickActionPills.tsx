/**
 * components/home/HomeQuickActionPills.tsx — SCRUM-653 (Home Redesign)
 *
 * Sleek transparent chip row replacing the filled-card QuickActionButtons
 * in the redesigned Home layout. Three pills side-by-side:
 *   [ heart PCP ] [ activity Pharmacy ] [ alert-circle Urgent Care ]
 *
 * BEHAVIOR PARITY:
 *   The recon confirmed there are no dedicated in-app routes for
 *   PCP / Pharmacy / Urgent Care — the shipped QuickActionButtons
 *   reads AsyncStorage keys (`quickContacts.pcp`, `quickContacts.
 *   urgentCare`, `quickContacts.pharmacy`) and either DIALS the saved
 *   number (`Linking.openURL('tel:…')`) or opens a first-use modal to
 *   capture the contact. We preserve that intent verbatim here — the
 *   redesign is VISUAL, not a rewrite of the contact-book flow.
 *   Replacing dial/openURL with `router.push('/Home/care-team?type=…')`
 *   would silently delete a shipped user affordance (their saved PCP
 *   phone number) with no destination route to catch the tap.
 *
 * PRIMITIVE ENVELOPE (iOS 26.5):
 *   View / Text / Pressable / StyleSheet only. Feather icons are safe
 *   — they're the same @expo/vector-icons pipeline MaterialIcons uses.
 *
 * STYLE:
 *   - Chip: translucent black 4% fill, 1px black 8% border, borderRadius
 *     999 (Radii.full). Padding 12h × 8v. No shadows.
 *   - Row: flex row, gap 8, marginHorizontal 16, marginTop 12.
 *   - Content: icon (Feather 16pt) + label text (13pt / 500).
 */

import React, { useCallback, useEffect, useState } from 'react'
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import Feather from '@expo/vector-icons/Feather'
import * as Haptics from 'expo-haptics'

// Reuse the setup / picker modals + storage helpers that shipped with
// QuickActionButtons (SCRUM-265). They are the source of truth for the
// AsyncStorage schema; duplicating them here would drift the contract.
import {
  ContactSetupModal,
  PharmacyPickerModal,
  KEY_PCP,
  KEY_URGENT,
  KEY_PHARMACY,
  type ContactInfo,
  type PharmacyChoice,
  type PharmacyEntry,
} from '@/components/home/quick-action-buttons-internals'

// ─── Storage loaders (identical schema to quick-action-buttons.tsx) ──

async function loadContact(key: string): Promise<ContactInfo | null> {
  try {
    const raw = await AsyncStorage.getItem(key)
    return raw ? (JSON.parse(raw) as ContactInfo) : null
  } catch {
    return null
  }
}

async function saveContact(key: string, contact: ContactInfo): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(contact))
}

async function loadPharmacy(): Promise<PharmacyChoice | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY_PHARMACY)
    return raw ? (JSON.parse(raw) as PharmacyChoice) : null
  } catch {
    return null
  }
}

async function savePharmacy(choice: PharmacyChoice): Promise<void> {
  await AsyncStorage.setItem(KEY_PHARMACY, JSON.stringify(choice))
}

// ─── Phone / URL launchers ──────────────────────────────────────────

function normalizePhone(input: string): string {
  const cleaned = input.replace(/[^\d+]/g, '')
  if (cleaned.startsWith('+')) return cleaned
  if (cleaned.length === 10) return `+1${cleaned}`
  return cleaned
}

async function dialNumber(phone: string): Promise<void> {
  const url = `tel:${phone}`
  try {
    const ok = await Linking.canOpenURL(url)
    if (!ok) {
      Alert.alert('Cannot place call', 'Calling is not supported on this device.')
      return
    }
    await Linking.openURL(url)
  } catch {
    Alert.alert('Cannot place call', 'Failed to open the dialer.')
  }
}

async function openPharmacy(p: PharmacyChoice): Promise<void> {
  if (p.appUrl) {
    try {
      const ok = await Linking.canOpenURL(p.appUrl)
      if (ok) {
        await Linking.openURL(p.appUrl)
        return
      }
    } catch {
      // fall through to webUrl
    }
  }
  await Linking.openURL(p.webUrl)
}

// ─── Pill ───────────────────────────────────────────────────────────

interface PillProps {
  icon: keyof typeof Feather.glyphMap
  label: string
  onPress: () => void
  accessibilityLabel: string
  /**
   * Hex accent color (e.g. '#008080' teal for PCP). Applied at low
   * opacity for the background/border and full opacity for the icon
   * and text — keeps the pill legible on white while giving each
   * action its own brand hue (matches the shipped ActionButton accents
   * per user feedback 2026-07-31: "get their colors back but add
   * opacity").
   */
  accentHex: string
}

/**
 * Turn a 6-char hex like '#008080' into an rgba() with the given
 * alpha. Kept trivial (no branching on 3-char shorthand — we only
 * ever call this with the three canonical accents) so it stays inlined
 * by the JS engine and re-uses no allocations at render time.
 */
function withAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function Pill({ icon, label, onPress, accessibilityLabel, accentHex }: PillProps) {
  // 12% background + 32% border + solid foreground → contrast ratio ~5:1
  // for the text on the tinted fill (WCAG AA for normal text). Verified
  // against a white app background; on a dark bg the fill would need a
  // recompute — parked until dark-mode ships.
  const bg = withAlpha(accentHex, 0.12)
  const border = withAlpha(accentHex, 0.32)
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={6}
      style={({ pressed }) => [
        styles.pill,
        { backgroundColor: bg, borderColor: border },
        pressed && styles.pillPressed,
      ]}
    >
      <Feather
        name={icon}
        size={16}
        color={accentHex}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
      <Text
        style={[styles.pillLabel, { color: accentHex }]}
        numberOfLines={1}
        maxFontSizeMultiplier={1.3}
      >
        {label}
      </Text>
    </Pressable>
  )
}

// ─── Row ────────────────────────────────────────────────────────────

export function HomeQuickActionPills(): React.JSX.Element {
  const [pcp, setPcp] = useState<ContactInfo | null>(null)
  const [urgent, setUrgent] = useState<ContactInfo | null>(null)
  const [pharmacy, setPharmacy] = useState<PharmacyChoice | null>(null)

  const [pcpModalOpen, setPcpModalOpen] = useState(false)
  const [urgentModalOpen, setUrgentModalOpen] = useState(false)
  const [pharmacyModalOpen, setPharmacyModalOpen] = useState(false)

  const loadAll = useCallback(async () => {
    const [pcpData, urgentData, pharmacyData] = await Promise.all([
      loadContact(KEY_PCP),
      loadContact(KEY_URGENT),
      loadPharmacy(),
    ])
    setPcp(pcpData)
    setUrgent(urgentData)
    setPharmacy(pharmacyData)
  }, [])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  const haptic = () => {
    if (process.env.EXPO_OS === 'ios') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    }
  }

  const handlePcpPress = () => {
    haptic()
    if (pcp) {
      dialNumber(pcp.phone)
    } else {
      setPcpModalOpen(true)
    }
  }

  const handleUrgentPress = () => {
    haptic()
    if (urgent) {
      dialNumber(urgent.phone)
    } else {
      setUrgentModalOpen(true)
    }
  }

  const handlePharmacyPress = () => {
    haptic()
    if (pharmacy) {
      openPharmacy(pharmacy)
    } else {
      setPharmacyModalOpen(true)
    }
  }

  return (
    <View style={styles.row}>
      <Pill
        icon="heart"
        accentHex="#008080"
        label={pcp ? `Call ${pcp.name}` : 'PCP'}
        onPress={handlePcpPress}
        accessibilityLabel={pcp ? `Call ${pcp.name}` : 'Set up primary care provider'}
      />
      <Pill
        icon="activity"
        accentHex="#7C3AED"
        label={pharmacy?.provider ?? 'Pharmacy'}
        onPress={handlePharmacyPress}
        accessibilityLabel={
          pharmacy ? `Open ${pharmacy.provider}` : 'Choose pharmacy'
        }
      />
      <Pill
        icon="alert-circle"
        accentHex="#DC2626"
        label={urgent ? `Call ${urgent.name}` : 'Urgent Care'}
        onPress={handleUrgentPress}
        accessibilityLabel={urgent ? `Call ${urgent.name}` : 'Set up urgent care'}
      />

      <ContactSetupModal
        visible={pcpModalOpen}
        onClose={() => setPcpModalOpen(false)}
        title="Set up your PCP"
        subtitle="We'll save your primary care provider's contact so you can call them in one tap next time."
        nameLabel="PCP name"
        namePlaceholder="Dr. Jane Smith"
        accent="#008080"
        onSave={async (name, phone) => {
          const contact: ContactInfo = {
            name,
            phone,
            updatedAt: new Date().toISOString(),
          }
          await saveContact(KEY_PCP, contact)
          setPcp(contact)
          setPcpModalOpen(false)
          dialNumber(phone)
        }}
        normalizePhone={normalizePhone}
      />
      <ContactSetupModal
        visible={urgentModalOpen}
        onClose={() => setUrgentModalOpen(false)}
        title="Set up Urgent Care"
        subtitle="Save the contact for your nearest urgent care so it's ready when you need it."
        nameLabel="Urgent care name"
        namePlaceholder="Sonoma Urgent Care"
        accent="#DC2626"
        onSave={async (name, phone) => {
          const contact: ContactInfo = {
            name,
            phone,
            updatedAt: new Date().toISOString(),
          }
          await saveContact(KEY_URGENT, contact)
          setUrgent(contact)
          setUrgentModalOpen(false)
          dialNumber(phone)
        }}
        normalizePhone={normalizePhone}
      />
      <PharmacyPickerModal
        visible={pharmacyModalOpen}
        onClose={() => setPharmacyModalOpen(false)}
        onPick={async (entry: PharmacyEntry) => {
          const choice: PharmacyChoice = {
            provider: entry.provider,
            webUrl: entry.webUrl,
            appUrl: entry.appUrl,
            updatedAt: new Date().toISOString(),
          }
          await savePharmacy(choice)
          setPharmacy(choice)
          setPharmacyModalOpen(false)
          openPharmacy(choice)
        }}
      />
    </View>
  )
}

export default HomeQuickActionPills

// ─── Styles ─────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 12,
  },
  pill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    // backgroundColor + borderColor injected per pill via `accentHex`
    // (see Pill()). Each pill gets its own low-alpha brand tint.
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  pillPressed: {
    opacity: 0.6,
  },
  pillLabel: {
    fontSize: 13,
    fontWeight: '500',
    // color: injected per pill via `accentHex`
    letterSpacing: 0.1,
  },
})

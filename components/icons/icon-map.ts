import {
  Stethoscope, User, Building2, ClipboardList, HeartHandshake, Hospital,
  Heart, Hand, Brain, Bone, Baby, Ribbon, Drumstick, HeartPulse,
  Ear, Eye, BrainCircuit, Activity, Wind, ScanLine, Scissors, Microscope,
  HelpCircle,
  type LucideIcon,
} from 'lucide-react-native'
import type { IconName } from '@/utils/specialty-to-icon'

export type EntityType =
  | 'provider' | 'patient' | 'agency'
  | 'care-manager' | 'care-giver' | 'clinic'

/** Accent context drives the fill color. Three buckets — see spec. */
export type AccentContext = 'recipient' | 'delivery' | 'organization'

export const ACCENT_COLOR: Record<AccentContext, string> = {
  recipient:    '#2563EB',
  delivery:     '#7C3AED',
  organization: '#475569',
}

export const ENTITY_ICON: Record<EntityType, { lucide: LucideIcon; accent: AccentContext }> = {
  'provider':      { lucide: Stethoscope,    accent: 'delivery' },
  'patient':       { lucide: User,           accent: 'recipient' },
  'agency':        { lucide: Building2,      accent: 'organization' },
  'care-manager':  { lucide: ClipboardList,  accent: 'delivery' },
  'care-giver':    { lucide: HeartHandshake, accent: 'delivery' },
  'clinic':        { lucide: Hospital,       accent: 'organization' },
}

// Specialty icons all inherit the 'delivery' accent (purple) because they
// describe a provider's sub-type. We keep the accent here so future
// re-theming touches one table.
export const SPECIALTY_ICON: Record<IconName, LucideIcon> = {
  'cardiology':               Heart,
  'dermatology':              Hand,
  'neurology':                Brain,
  'orthopedics':              Bone,
  'pediatrics':               Baby,
  'oncology':                 Ribbon,
  'gastroenterology':         Drumstick,
  'ob-gyn':                   HeartPulse,
  'ent':                      Ear,
  'ophthalmology':            Eye,
  'psychiatry':               BrainCircuit,
  'internal-family-medicine': Stethoscope,
  'endocrinology':            Activity,
  'pulmonology':              Wind,
  'radiology':                ScanLine,
  'surgical':                 Scissors,
  'lab-imaging':              Microscope,
}

/** Safety net for keys we forgot to add. Snapshot tests catch this. */
export const FALLBACK_ICON: LucideIcon = HelpCircle

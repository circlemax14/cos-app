import { Platform } from 'react-native';

// ── Color Tokens (WCAG AAA Compliant) ──────────────────────────

export const LightColors = {
  primary: '#0D9488',
  primaryDark: '#0F766E',
  primaryLight: '#CCFBF1',
  text: '#111827',
  secondary: '#4B5563',
  background: '#FFFFFF',
  surface: '#F0FDFA',
  surfaceBorder: '#CCFBF1',
  border: '#D1D5DB',
  card: '#F0FDFA',
  cardBorder: '#CCFBF1',
  error: '#DC2626',
  errorLight: '#FEE2E2',
  errorBg: '#FEF2F2',
  success: '#059669',
  successLight: '#D1FAE5',
  warning: '#D97706',
  warningLight: '#FEF3C7',
  disabled: '#9CA3AF',
  tint: '#0D9488',
  icon: '#4B5563',
  tabIconDefault: '#4B5563',
  tabIconSelected: '#0D9488',
  highContrast: {
    secondary: '#374151',
    border: '#9CA3AF',
    borderWidth: 2,
  },
} as const;

export const DarkColors = {
  primary: '#2DD4BF',
  primaryDark: '#14B8A6',
  primaryLight: '#134E4A',
  text: '#F9FAFB',
  secondary: '#9CA3AF',
  background: '#111827',
  surface: '#1F2937',
  surfaceBorder: '#374151',
  border: '#374151',
  card: '#1F2937',
  cardBorder: '#374151',
  error: '#F87171',
  errorLight: '#7F1D1D',
  errorBg: '#451A1A',
  success: '#34D399',
  successLight: '#064E3B',
  warning: '#FBBF24',
  warningLight: '#78350F',
  disabled: '#4B5563',
  tint: '#2DD4BF',
  icon: '#9CA3AF',
  tabIconDefault: '#9CA3AF',
  tabIconSelected: '#2DD4BF',
  highContrast: {
    secondary: '#D1D5DB',
    border: '#6B7280',
    borderWidth: 2,
  },
} as const;

export type ThemeColors = typeof LightColors | typeof DarkColors;

export function getColors(isDark: boolean): ThemeColors {
  return isDark ? DarkColors : LightColors;
}

// ── Typography Scale ───────────────────────────────────────────

export const Typography = {
  largeTitle: { fontSize: 28, fontWeight: '700' as const, letterSpacing: -0.56 },
  title1: { fontSize: 22, fontWeight: '700' as const, letterSpacing: 0 },
  title2: { fontSize: 20, fontWeight: '600' as const, letterSpacing: 0 },
  headline: { fontSize: 17, fontWeight: '600' as const, letterSpacing: 0 },
  body: { fontSize: 17, fontWeight: '400' as const, letterSpacing: 0 },
  callout: { fontSize: 15, fontWeight: '400' as const, letterSpacing: 0 },
  footnote: { fontSize: 13, fontWeight: '400' as const, letterSpacing: 0 },
  caption: { fontSize: 12, fontWeight: '600' as const, letterSpacing: 0.6, textTransform: 'uppercase' as const },
} as const;

// ── Spacing Scale ──────────────────────────────────────────────

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  cardPadding: 20,
  screenPadding: 20,
} as const;

// ── Touch Targets ──────────────────────────────────────────────

export const TouchTargets = {
  minimum: 44,
  button: 50,
  buttonAccessibility: 56,
  tabIcon: 48,
  tabIconAccessibility: 54,
  iconButton: 44,
  searchBar: 44,
  listRow: 54,
  numberPadButton: 60,
  minSpacing: 8,
  minSpacingAccessibility: 12,
} as const;

// ── Border Radius ──────────────────────────────────────────────

export const Radii = {
  sm: 8,
  md: 12,
  lg: 14,
  xl: 16,
  full: 9999,
} as const;

// ── Status Badge Config ────────────────────────────────────────

export const StatusConfig = {
  completed: { icon: '✓', bg: '#D1FAE5', text: '#065F46', label: 'Completed' },
  fulfilled: { icon: '✓', bg: '#D1FAE5', text: '#065F46', label: 'Completed' },
  booked: { icon: '📅', bg: '#DBEAFE', text: '#1E40AF', label: 'Booked' },
  planned: { icon: '📅', bg: '#DBEAFE', text: '#1E40AF', label: 'Planned' },
  'in-progress': { icon: '⏳', bg: '#FEF3C7', text: '#92400E', label: 'In Progress' },
  triaged: { icon: '⏳', bg: '#FEF3C7', text: '#92400E', label: 'Triaged' },
  arrived: { icon: '✓', bg: '#D1FAE5', text: '#065F46', label: 'Arrived' },
  cancelled: { icon: '✕', bg: '#FEE2E2', text: '#991B1B', label: 'Cancelled' },
  'entered-in-error': { icon: '✕', bg: '#FEE2E2', text: '#991B1B', label: 'Error' },
  finished: { icon: '★', bg: '#F3E8FF', text: '#6B21A8', label: 'Finished' },
  noshow: { icon: '⚠', bg: '#FED7AA', text: '#9A3412', label: 'No Show' },
  onleave: { icon: '⚠', bg: '#FED7AA', text: '#9A3412', label: 'On Leave' },
} as const;

// ── Support Ticket Status Config ───────────────────────────────

export const SupportStatusConfig = {
  open: { icon: '⏳', bg: '#FEF3C7', text: '#92400E', label: 'Open' },
  'in-progress': { icon: '🔄', bg: '#DBEAFE', text: '#1E40AF', label: 'In Progress' },
  resolved: { icon: '✓', bg: '#D1FAE5', text: '#065F46', label: 'Resolved' },
  closed: { icon: '✕', bg: '#F3F4F6', text: '#4B5563', label: 'Closed' },
} as const;

// ── Support Categories ─────────────────────────────────────────

export const SupportCategories = [
  { value: 'login-account', label: 'Login & Account' },
  { value: 'appointments', label: 'Appointments' },
  { value: 'health-records', label: 'Health Records' },
  { value: 'ehr-connection', label: 'EHR Connection' },
  { value: 'app-issues', label: 'App Issues' },
  { value: 'billing-insurance', label: 'Billing & Insurance' },
  { value: 'other', label: 'Other' },
] as const;

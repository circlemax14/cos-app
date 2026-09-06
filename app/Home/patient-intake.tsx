/**
 * Patient intake wizard route (HS-1 / SCRUM-590).
 *
 * Thin expo-router route file that delegates entirely to
 * IntakeWizardScreen. Kept as a single .tsx (never a folder with
 * `index.tsx`) per the Expo Router barrel gotcha in CLAUDE.md — any
 * `index.ts(x)` under `app/` gets silently registered and corrupts
 * the Tabs/Stack layout.
 *
 * Registered as a hidden Tabs.Screen in `app/Home/_layout.tsx`
 * (href: null), same pattern as plan-type-chooser and
 * biopsychosocial-plan — chosen over a Modal because of the
 * iOS 26.5 Modal-dismiss crash class documented in
 * project_ios26_biopsychosocial_parked.
 *
 * All wizard state, load/start/patch/complete orchestration, and
 * error UX live inside IntakeWizardScreen — this file is intentionally
 * empty of logic so route wiring stays trivial to review.
 */
import React from 'react';

import IntakeWizardScreen from '@/components/health-plan/patient-intake/IntakeWizardScreen';
import { useCanRender } from '@/hooks/use-entitlement';

// COS-723: expo-router renders this in its `Try` boundary if the route throws,
// so a crash costs this screen instead of the whole app. See
// components/RouteErrorBoundary.tsx.
export { ErrorBoundary } from '@/components/RouteErrorBoundary';

export default function PatientIntakeRoute(): React.JSX.Element {
  // COS-856 entitlement gate on the screen body.
  const canView = useCanRender('patient-intake.view');

  return canView ? <IntakeWizardScreen /> : <></>;
}

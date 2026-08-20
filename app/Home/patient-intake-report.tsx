/**
 * Route for the read-only intake report (COS-452).
 * Registered as a hidden Tab in app/Home/_layout.tsx.
 */
import IntakeReportScreen from '@/components/health-plan/patient-intake/IntakeReportScreen';

// COS-723: expo-router renders this in its `Try` boundary if the route throws,
// so a crash costs this screen instead of the whole app. See
// components/RouteErrorBoundary.tsx.
export { ErrorBoundary } from '@/components/RouteErrorBoundary';

export default IntakeReportScreen;

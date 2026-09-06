import { ProfileContent } from '@/components/profile-content';
import { useCanRender } from '@/hooks/use-entitlement';
import React from 'react';

// COS-723: expo-router renders this in its `Try` boundary if the route throws,
// so a crash costs this screen instead of the whole app. See
// components/RouteErrorBoundary.tsx.
export { ErrorBoundary } from '@/components/RouteErrorBoundary';

export default function ProfileScreen() {
  const canView = useCanRender('profile.view');
  return canView ? <ProfileContent /> : null;
}

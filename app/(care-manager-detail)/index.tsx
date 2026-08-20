import { Redirect, useLocalSearchParams } from 'expo-router';

// COS-723: expo-router renders this in its `Try` boundary if the route throws,
// so a crash costs this screen instead of the whole app. See
// components/RouteErrorBoundary.tsx.
export { ErrorBoundary } from '@/components/RouteErrorBoundary';

export default function CareManagerDetailRedirect() {
  const params = useLocalSearchParams();
  return <Redirect href={`/agency-detail?id=${params.id}&name=${params.name}` as never} />;
}

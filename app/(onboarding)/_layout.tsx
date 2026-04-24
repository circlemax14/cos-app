import { Stack } from 'expo-router';

export default function OnboardingLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="usage-guidelines" />
      <Stack.Screen name="fasten-connect" />
      <Stack.Screen name="data-processing" />
      <Stack.Screen name="permissions" />
      <Stack.Screen name="terms" />
      <Stack.Screen name="welcome" />
    </Stack>
  );
}

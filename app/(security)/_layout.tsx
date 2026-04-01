import { Stack } from 'expo-router';

export default function SecurityLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="setup-pin" />
      <Stack.Screen name="confirm-pin" />
      <Stack.Screen name="enable-biometric" />
      <Stack.Screen name="lock-screen" />
    </Stack>
  );
}

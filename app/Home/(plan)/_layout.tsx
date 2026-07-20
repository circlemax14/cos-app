/**
 * app/Home/(plan)/_layout.tsx (COS-475, Phase 6.4).
 *
 * Stack group hosting the Plan V2 action sheets. `presentation: 'modal'`
 * on iOS resolves to a native card sheet — NOT the RN Modal component,
 * which is what triggered the iOS 26.5 Portal crash (see
 * project_ios26_biopsychosocial_parked memory).
 */

import { Stack } from 'expo-router';
import React from 'react';

export default function PlanGroupLayout(): React.JSX.Element {
  return (
    <Stack
      screenOptions={{
        presentation: 'modal',
        headerShown: true,
      }}
    >
      <Stack.Screen name="reschedule" options={{ title: 'Reschedule task' }} />
      <Stack.Screen name="routine-editor" options={{ title: 'Routine' }} />
      <Stack.Screen name="task-detail" options={{ title: 'Task' }} />
      <Stack.Screen name="suggestion-actions" options={{ title: 'Actions' }} />
    </Stack>
  );
}

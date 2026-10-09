import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { AuthProvider, useAuth } from '../features/auth/AuthProvider';
import { preloadPoseEngine } from '../features/pose/poseEngine';
import { SettingsProvider } from '../features/settings/SettingsProvider';
import { ServicesProvider } from '../services/ServicesProvider';
import { colors } from '../ui/theme';

export default function RootLayout() {
  // Load the pose model in the background so sessions start instantly.
  useEffect(() => {
    preloadPoseEngine().catch((e: unknown) => {
      console.warn(`[dawshia] pose model preload failed: ${e instanceof Error ? e.message : e}`);
    });
  }, []);

  return (
    <SettingsProvider>
      <AuthProvider>
        <ServicesProvider>
          <StatusBar style="light" />
          <AppStack />
        </ServicesProvider>
      </AuthProvider>
    </SettingsProvider>
  );
}

/** Signed-out users only see the login screen; everyone else sees the app. */
function AppStack() {
  const { status } = useAuth();
  const inApp = status !== 'signedOut';

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Protected guard={inApp}>
        <Stack.Screen name="index" />
        <Stack.Screen name="exercise/[exerciseId]" />
        <Stack.Screen name="session/[exerciseId]" options={{ gestureEnabled: false }} />
        <Stack.Screen name="results" />
        <Stack.Screen name="profile" />
        <Stack.Screen name="settings" />
      </Stack.Protected>
      <Stack.Protected guard={!inApp}>
        <Stack.Screen name="login" />
      </Stack.Protected>
    </Stack>
  );
}

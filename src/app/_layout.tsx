import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View } from 'react-native';

import { AuthProvider, useAuth } from '../features/auth/AuthProvider';
import { preloadPoseEngine } from '../features/pose/poseEngine';
import { ChatProvider } from '../features/chat/ChatProvider';
import { NoticeCenter } from '../features/notices/NoticeCenter';
import { ChallengesProvider } from '../features/social/ChallengesProvider';
import { FriendsProvider } from '../features/social/FriendsProvider';
import { NotificationsProvider } from '../features/social/NotificationsProvider';
import { useRestoreAvatar } from '../features/avatar/useRestoreAvatar';
import { SettingsProvider } from '../features/settings/SettingsProvider';
import { ServicesProvider } from '../services/ServicesProvider';
import { FONT_ASSETS } from '../ui/fonts';
import { colors } from '../ui/theme';

export default function RootLayout() {
  // Load the pose model in the background so sessions start instantly.
  useEffect(() => {
    preloadPoseEngine().catch((e: unknown) => {
      console.warn(`[dawshia] pose model preload failed: ${e instanceof Error ? e.message : e}`);
    });
  }, []);

  // Fonts are bundled files: this takes a few milliseconds. Fall back to system fonts on error.
  const [fontsLoaded, fontError] = useFonts(FONT_ASSETS);
  if (!fontsLoaded && !fontError) return <View style={{ flex: 1, backgroundColor: colors.background }} />;

  return (
    <SettingsProvider>
      <AuthProvider>
        <ServicesProvider>
          <StatusBar style="light" />
          <FriendsProvider>
            <AppStack />
          </FriendsProvider>
        </ServicesProvider>
      </AuthProvider>
    </SettingsProvider>
  );
}

/** Signed-out users only see the login screen; everyone else sees the app. */
function AppStack() {
  const { status } = useAuth();
  useRestoreAvatar(); // your photo from the server on a new phone
  const inApp = status !== 'signedOut';

  return (
    // Online status for friends while signed in, fight requests and chat.
    <NotificationsProvider>
      <ChallengesProvider>
        <ChatProvider>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.background },
            }}
          >
            <Stack.Protected guard={inApp}>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="exercise/[exerciseId]" />
              <Stack.Screen name="session/[exerciseId]" options={{ gestureEnabled: false }} />
              <Stack.Screen name="results" />
              <Stack.Screen name="player/[userId]" />
              <Stack.Screen name="challenge/[userId]" />
              <Stack.Screen name="chat/[userId]" />
            </Stack.Protected>
            <Stack.Protected guard={!inApp}>
              <Stack.Screen name="login" />
            </Stack.Protected>
          </Stack>
          {inApp ? <NoticeCenter /> : null}
        </ChatProvider>
      </ChallengesProvider>
    </NotificationsProvider>
  );
}

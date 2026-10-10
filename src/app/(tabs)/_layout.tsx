import { Tabs } from 'expo-router';
import { View } from 'react-native';

import { useChat } from '../../features/chat/ChatProvider';
import { IncomingMessage } from '../../features/chat/IncomingMessage';
import { useFriends } from '../../features/social/FriendsProvider';
import { IncomingChallenge } from '../../features/social/IncomingChallenge';
import { useI18n } from '../../i18n/useI18n';
import { Icon, type IconName } from '../../ui/components/Icon';
import { colors, fonts } from '../../ui/theme';

/**
 * Top-level navigation: a bottom tab bar (icon + label, active state) for the
 * five main destinations. Sessions, competitions and results open above it.
 * A friend's fight request shows on top of every tab.
 */
export default function TabsLayout() {
  const { m, n } = useI18n();
  const { incomingCount } = useFriends();
  const { totalUnread } = useChat();
  const friendsBadge = incomingCount + totalUnread;
  const icon = (name: IconName) =>
    function TabIcon({ color }: { color: unknown }) {
      return <Icon name={name} color={String(color)} />;
    };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.accent,
          tabBarInactiveTintColor: colors.textMuted,
          tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border, minHeight: 60 },
          tabBarLabelStyle: { fontFamily: fonts.medium, fontSize: 12 },
          tabBarBadgeStyle: { backgroundColor: colors.opponent, color: colors.text, fontFamily: fonts.bold },
          sceneStyle: { backgroundColor: colors.background },
        }}
      >
        <Tabs.Screen name="index" options={{ title: m.tabs.home, tabBarIcon: icon('home-variant') }} />
        <Tabs.Screen name="ranking" options={{ title: m.tabs.ranking, tabBarIcon: icon('trophy') }} />
        <Tabs.Screen
          name="friends"
          options={{
            title: m.tabs.friends,
            tabBarIcon: icon('account-group'),
            tabBarBadge: friendsBadge > 0 ? n(friendsBadge) : undefined,
          }}
        />
        <Tabs.Screen name="profile" options={{ title: m.tabs.profile, tabBarIcon: icon('account-circle') }} />
        <Tabs.Screen name="settings" options={{ title: m.tabs.settings, tabBarIcon: icon('cog') }} />
      </Tabs>
      <IncomingMessage />
      <IncomingChallenge />
    </View>
  );
}

import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../../features/auth/AuthProvider';
import {
  getNotifyPermission,
  requestNotifyPermission,
  type NotifyPermission,
} from '../../features/notices/systemNotifications';
import { useSettings } from '../../features/settings/SettingsProvider';
import { format } from '../../i18n/format';
import { LOCALES, type Locale } from '../../i18n/locales';
import { useI18n } from '../../i18n/useI18n';
import { Button } from '../../ui/components/Button';
import { OptionCard } from '../../ui/components/OptionCard';
import { useScreenOrientation } from '../../ui/hooks/useScreenOrientation';
import { AppText } from '../../ui/components/AppText';
import { colors, radius, spacing, fonts } from '../../ui/theme';

export default function SettingsScreen() {
  useScreenOrientation('portrait');
  const { m, dir, textStart } = useI18n();
  const { settings, updateSettings } = useSettings();

  return (
    <SafeAreaView style={[styles.root, dir]} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <AppText style={[styles.title, textStart]}>{m.settings.title}</AppText>

        <AppText style={[styles.section, textStart]}>{m.settings.language}</AppText>
        {(Object.keys(LOCALES) as Locale[]).map((id) => (
          <OptionCard
            key={id}
            selected={settings.locale === id}
            title={LOCALES[id].nativeName}
            onPress={() => updateSettings({ locale: id })}
          />
        ))}

        <AppText style={[styles.section, textStart]}>{m.settings.sound}</AppText>
        <View style={styles.row}>
          <AppText style={[styles.hint, textStart]}>{m.settings.soundHint}</AppText>
          <Switch
            value={settings.soundEnabled}
            onValueChange={(soundEnabled) => updateSettings({ soundEnabled })}
            trackColor={{ true: colors.accent, false: colors.border }}
            accessibilityLabel={m.settings.sound}
          />
        </View>

        <AppText style={[styles.section, textStart]}>{m.settings.music}</AppText>
        <View style={styles.row}>
          <AppText style={[styles.hint, textStart]}>{m.settings.musicHint}</AppText>
          <Switch
            value={settings.musicEnabled}
            onValueChange={(musicEnabled) => updateSettings({ musicEnabled })}
            trackColor={{ true: colors.accent, false: colors.border }}
            accessibilityLabel={m.settings.music}
          />
        </View>

        <NotificationsSection />
        <AccountSection />
        <ServerSection />
      </ScrollView>
    </SafeAreaView>
  );
}

/** Phone/browser notifications: the setting plus the system permission behind it. */
function NotificationsSection() {
  const { m, textStart } = useI18n();
  const { settings, updateSettings } = useSettings();
  const [permission, setPermission] = useState<NotifyPermission | null>(null);
  useEffect(() => {
    getNotifyPermission()
      .then(setPermission)
      .catch(() => setPermission('denied'));
  }, []);

  const on = settings.notificationsEnabled && permission === 'granted';
  const toggle = async (next: boolean) => {
    if (!next) {
      updateSettings({ notificationsEnabled: false });
      return;
    }
    const granted = permission === 'granted' ? permission : await requestNotifyPermission().catch(() => 'denied' as const);
    setPermission(granted);
    updateSettings({ notificationsEnabled: granted === 'granted' });
  };

  return (
    <>
      <AppText style={[styles.section, textStart]}>{m.notices.setting}</AppText>
      <View style={styles.row}>
        <AppText style={[styles.hint, textStart]}>
          {permission === 'denied' ? m.notices.blocked : m.notices.settingHint}
        </AppText>
        <Switch
          value={on}
          onValueChange={toggle}
          disabled={permission === null}
          trackColor={{ true: colors.accent, false: colors.border }}
          accessibilityLabel={m.notices.setting}
        />
      </View>
    </>
  );
}

function AccountSection() {
  const { m, f, textStart } = useI18n();
  const { status, session, signOut } = useAuth();
  return (
    <>
      <AppText style={[styles.section, textStart]}>{m.settings.account}</AppText>
      <View style={styles.row}>
        <AppText style={[styles.hint, textStart]}>
          {status === 'signedIn' && session
            ? f(m.settings.signedInAs, { username: session.username })
            : m.settings.offlineMode}
        </AppText>
        <Button
          label={status === 'signedIn' ? m.settings.signOut : m.settings.signIn}
          variant="ghost"
          onPress={signOut}
        />
      </View>
    </>
  );
}

/** Shows the hard-coded server address and lets the user test the connection. */
function ServerSection() {
  const { m, f, textStart } = useI18n();
  const { api } = useAuth();
  const [result, setResult] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  const test = async () => {
    setTesting(true);
    try {
      setResult(f(m.settings.connected, { ms: await api.ping() }));
    } catch (e) {
      // Keep technical details (IP, port) in Latin digits.
      setResult(format(m.settings.notConnected, { error: e instanceof Error ? e.message : String(e) }));
    } finally {
      setTesting(false);
    }
  };

  return (
    <>
      <AppText style={[styles.section, textStart]}>{m.settings.server}</AppText>
      <View style={styles.row}>
        <AppText style={[styles.hint, styles.ltr]} selectable>
          {api.url}
        </AppText>
        <Button
          label={testing ? m.settings.testing : m.settings.testConnection}
          variant="ghost"
          onPress={test}
          disabled={testing}
        />
      </View>
      {result ? (
        <AppText style={[styles.hint, textStart]} selectable>
          {result}
        </AppText>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontFamily: fonts.bold,
    marginTop: spacing.lg,
  },
  section: {
    color: colors.text,
    fontSize: 15,
    fontFamily: fonts.bold,
    marginTop: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  hint: {
    flex: 1,
    color: colors.textMuted,
    fontSize: 14,
  },
  ltr: {
    textAlign: 'left',
    writingDirection: 'ltr',
  },
});

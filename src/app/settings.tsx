import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../features/auth/AuthProvider';
import { useSettings } from '../features/settings/SettingsProvider';
import { format } from '../i18n/format';
import { LOCALES, type Locale } from '../i18n/locales';
import { useI18n } from '../i18n/useI18n';
import { Button } from '../ui/components/Button';
import { OptionCard } from '../ui/components/OptionCard';
import { useScreenOrientation } from '../ui/hooks/useScreenOrientation';
import { colors, radius, spacing } from '../ui/theme';

export default function SettingsScreen() {
  useScreenOrientation('portrait');
  const { m, dir, textStart } = useI18n();
  const { settings, updateSettings } = useSettings();

  return (
    <SafeAreaView style={[styles.root, dir]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.title, textStart]}>{m.settings.title}</Text>

        <Text style={[styles.section, textStart]}>{m.settings.language}</Text>
        {(Object.keys(LOCALES) as Locale[]).map((id) => (
          <OptionCard
            key={id}
            selected={settings.locale === id}
            title={LOCALES[id].nativeName}
            onPress={() => updateSettings({ locale: id })}
          />
        ))}

        <Text style={[styles.section, textStart]}>{m.settings.sound}</Text>
        <View style={styles.row}>
          <Text style={[styles.hint, textStart]}>{m.settings.soundHint}</Text>
          <Switch
            value={settings.soundEnabled}
            onValueChange={(soundEnabled) => updateSettings({ soundEnabled })}
            trackColor={{ true: colors.accent, false: colors.border }}
            accessibilityLabel={m.settings.sound}
          />
        </View>

        <AccountSection />
        <ServerSection />

        <Button label={m.common.back} variant="ghost" onPress={() => router.back()} style={styles.back} />
      </ScrollView>
    </SafeAreaView>
  );
}

function AccountSection() {
  const { m, f, textStart } = useI18n();
  const { status, session, signOut } = useAuth();
  return (
    <>
      <Text style={[styles.section, textStart]}>{m.settings.account}</Text>
      <View style={styles.row}>
        <Text style={[styles.hint, textStart]}>
          {status === 'signedIn' && session
            ? f(m.settings.signedInAs, { username: session.username })
            : m.settings.offlineMode}
        </Text>
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
      <Text style={[styles.section, textStart]}>{m.settings.server}</Text>
      <View style={styles.row}>
        <Text style={[styles.hint, styles.ltr]} selectable>
          {api.url}
        </Text>
        <Button
          label={testing ? m.settings.testing : m.settings.testConnection}
          variant="ghost"
          onPress={test}
          disabled={testing}
        />
      </View>
      {result ? (
        <Text style={[styles.hint, textStart]} selectable>
          {result}
        </Text>
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
    fontWeight: '900',
    marginTop: spacing.lg,
  },
  section: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
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
  back: {
    marginTop: spacing.lg,
  },
});

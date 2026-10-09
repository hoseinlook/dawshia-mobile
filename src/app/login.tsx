import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../features/auth/AuthProvider';
import {
  authErrorFrom,
  validateSignIn,
  validateSignUp,
  type AuthErrorCode,
} from '../features/auth/validation';
import { format } from '../i18n/format';
import { useI18n } from '../i18n/useI18n';
import { Button } from '../ui/components/Button';
import { useScreenOrientation } from '../ui/hooks/useScreenOrientation';
import { colors, radius, spacing } from '../ui/theme';

type Mode = 'signIn' | 'signUp';

export default function LoginScreen() {
  useScreenOrientation('portrait');
  const { m, dir, textStart } = useI18n();
  const { signIn, signUp, continueOffline } = useAuth();
  const [mode, setMode] = useState<Mode>('signIn');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ code: AuthErrorCode; detail?: string } | null>(null);

  const submit = async () => {
    const invalid =
      mode === 'signIn' ? validateSignIn(email, password) : validateSignUp(username, email, password);
    if (invalid) {
      setError({ code: invalid });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (mode === 'signIn') await signIn(email, password);
      else await signUp(username, email, password);
      // On success the root layout switches to the app automatically.
    } catch (e) {
      console.warn(`[dawshia] ${mode} failed: ${e instanceof Error ? e.message : e}`);
      setError(authErrorFrom(e, mode));
    } finally {
      setBusy(false);
    }
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
  };

  return (
    <SafeAreaView style={[styles.root, dir]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.logo}>DAWSHIA</Text>
          <Text style={[styles.tagline, textStart]}>{m.home.tagline}</Text>

          <View style={styles.tabs}>
            {(['signIn', 'signUp'] as const).map((tab) => (
              <Pressable
                key={tab}
                onPress={() => switchMode(tab)}
                accessibilityRole="tab"
                accessibilityState={{ selected: mode === tab }}
                style={[styles.tab, mode === tab && styles.tabActive]}
              >
                <Text style={[styles.tabText, mode === tab && styles.tabTextActive]}>
                  {tab === 'signIn' ? m.auth.signInTab : m.auth.signUpTab}
                </Text>
              </Pressable>
            ))}
          </View>

          {mode === 'signUp' ? (
            <Field
              label={m.auth.username}
              value={username}
              onChangeText={setUsername}
              autoComplete="username-new"
              textContentType="username"
            />
          ) : null}
          <Field
            label={m.auth.email}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoComplete="email"
            textContentType="emailAddress"
          />
          <Field
            label={m.auth.password}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
            textContentType={mode === 'signIn' ? 'password' : 'newPassword'}
            onSubmitEditing={submit}
          />

          {error ? (
            <View style={styles.error}>
              <Text style={[styles.errorText, textStart]}>{m.auth.errors[error.code]}</Text>
              {error.detail ? (
                <Text style={[styles.errorDetail, textStart]} selectable>
                  {/* Technical detail stays in Latin digits (IPs, ports). */}
                  {format(m.auth.errorDetail, { detail: error.detail })}
                </Text>
              ) : null}
            </View>
          ) : null}

          <Button
            label={mode === 'signIn' ? m.auth.signInButton : m.auth.signUpButton}
            onPress={submit}
            disabled={busy}
            style={styles.submit}
          />

          <Pressable onPress={continueOffline} style={styles.offline} accessibilityRole="button">
            <Text style={styles.offlineText}>{m.auth.continueOffline}</Text>
            <Text style={styles.offlineHint}>{m.auth.offlineHint}</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({
  label,
  ...input
}: { label: string } & React.ComponentProps<typeof TextInput>) {
  const { textStart } = useI18n();
  return (
    <View style={styles.field}>
      <Text style={[styles.label, textStart]}>{label}</Text>
      <TextInput
        {...input}
        autoCapitalize="none"
        autoCorrect={false}
        placeholderTextColor={colors.textMuted}
        style={styles.input}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.md,
    flexGrow: 1,
    justifyContent: 'center',
  },
  logo: {
    color: colors.accent,
    fontSize: 40,
    fontWeight: '900',
    letterSpacing: 6,
    textAlign: 'center',
  },
  tagline: {
    color: colors.textMuted,
    fontSize: 16,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  tabs: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
  },
  tabActive: {
    backgroundColor: colors.surfaceRaised,
  },
  tabText: {
    color: colors.textMuted,
    fontSize: 15,
    fontWeight: '700',
  },
  tabTextActive: {
    color: colors.text,
  },
  field: {
    gap: spacing.xs,
  },
  label: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  input: {
    color: colors.text,
    fontSize: 16,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    // Emails, usernames and passwords are Latin text: keep them left-to-right.
    textAlign: 'left',
    writingDirection: 'ltr',
  },
  error: {
    gap: 2,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  errorText: {
    color: colors.danger,
    fontSize: 14,
    fontWeight: '700',
  },
  errorDetail: {
    color: colors.textMuted,
    fontSize: 12,
  },
  submit: {
    marginTop: spacing.sm,
  },
  offline: {
    alignItems: 'center',
    gap: 2,
    padding: spacing.sm,
  },
  offlineText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  offlineHint: {
    color: colors.textMuted,
    fontSize: 12,
    textAlign: 'center',
  },
});

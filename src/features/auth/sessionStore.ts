import { File, Paths } from 'expo-file-system';

import type { Session } from './session';

/**
 * Persists the session in the app's private storage.
 * TODO: move to the OS keychain (expo-secure-store) — needs a native rebuild.
 */
const file = () => new File(Paths.document, 'session.json');

export function loadSession(): Session | null {
  try {
    const f = file();
    return f.exists ? (JSON.parse(f.textSync()) as Session) : null;
  } catch {
    return null;
  }
}

export function saveSession(session: Session): void {
  try {
    file().write(JSON.stringify(session));
  } catch {
    // Not fatal: the user just has to sign in again next launch.
  }
}

export function clearSession(): void {
  try {
    const f = file();
    if (f.exists) f.delete();
  } catch {
    // Ignore.
  }
}

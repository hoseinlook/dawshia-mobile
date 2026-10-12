import { deleteText, readText, writeText } from '../../services/local/textStore';
import type { Session } from './session';

/**
 * Persists the session in the app's private storage (localStorage on the web).
 * TODO: move to the OS keychain (expo-secure-store) — needs a native rebuild.
 */
const FILE_NAME = 'session.json';

export function loadSession(): Session | null {
  try {
    const text = readText(FILE_NAME);
    return text ? (JSON.parse(text) as Session) : null;
  } catch {
    return null;
  }
}

export function saveSession(session: Session): void {
  try {
    writeText(FILE_NAME, JSON.stringify(session));
  } catch {
    // Not fatal: the user just has to sign in again next launch.
  }
}

export function clearSession(): void {
  deleteText(FILE_NAME);
}

import { NetworkError, ServerError } from '../../services/remote/nakamaApi';

/** Keys of `auth.errors` in the i18n messages. */
export type AuthErrorCode =
  | 'invalidEmail'
  | 'passwordTooShort'
  | 'invalidUsername'
  | 'wrongCredentials'
  | 'usernameTaken'
  | 'emailTaken'
  | 'network'
  | 'unknown';

export const MIN_PASSWORD_LENGTH = 8; // Nakama's minimum
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[A-Za-z0-9_.]{3,20}$/;

export function validateSignIn(email: string, password: string): AuthErrorCode | null {
  if (!EMAIL_RE.test(email.trim())) return 'invalidEmail';
  if (password.length < MIN_PASSWORD_LENGTH) return 'passwordTooShort';
  return null;
}

export function validateSignUp(username: string, email: string, password: string): AuthErrorCode | null {
  if (!USERNAME_RE.test(username.trim())) return 'invalidUsername';
  return validateSignIn(email, password);
}

/** Maps an API error to a user-facing error code (plus technical detail for debugging). */
export function authErrorFrom(e: unknown, mode: 'signIn' | 'signUp'): { code: AuthErrorCode; detail: string } {
  const detail = e instanceof Error ? e.message : String(e);
  if (e instanceof NetworkError) return { code: 'network', detail };
  if (e instanceof ServerError) {
    if (e.status === 401) return { code: 'wrongCredentials', detail };
    if (e.status === 404 && mode === 'signIn') return { code: 'wrongCredentials', detail };
    if (e.status === 409) {
      return { code: /username/i.test(e.message) ? 'usernameTaken' : 'emailTaken', detail };
    }
    if (e.status === 400 && /password/i.test(e.message)) return { code: 'passwordTooShort', detail };
    if (e.status === 400 && /email/i.test(e.message)) return { code: 'invalidEmail', detail };
    if (e.status === 400 && /username/i.test(e.message)) return { code: 'invalidUsername', detail };
  }
  return { code: 'unknown', detail };
}

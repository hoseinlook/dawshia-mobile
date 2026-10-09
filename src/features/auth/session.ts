import type { SessionTokens } from '../../services/remote/nakamaApi';

/** A signed-in user's session, decoded from Nakama's JWTs. */
export interface Session extends SessionTokens {
  userId: string;
  username: string;
  /** Unix ms when the access token expires. */
  expiresAt: number;
  /** Unix ms when the refresh token expires (then the user must sign in again). */
  refreshExpiresAt: number;
}

function decodeJwtPayload(jwt: string): Record<string, unknown> {
  const part = jwt.split('.')[1];
  if (!part) throw new Error('Malformed token');
  const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  // atob gives one char per byte; percent-encode the bytes to decode UTF-8 (e.g. Persian usernames).
  const binary = atob(padded);
  let encoded = '';
  for (let i = 0; i < binary.length; i++) {
    encoded += `%${binary.charCodeAt(i).toString(16).padStart(2, '0')}`;
  }
  return JSON.parse(decodeURIComponent(encoded)) as Record<string, unknown>;
}

export function sessionFromTokens(tokens: SessionTokens): Session {
  const access = decodeJwtPayload(tokens.token);
  const refresh = decodeJwtPayload(tokens.refreshToken);
  return {
    ...tokens,
    userId: String(access.uid ?? ''),
    username: String(access.usn ?? ''),
    expiresAt: Number(access.exp ?? 0) * 1000,
    refreshExpiresAt: Number(refresh.exp ?? 0) * 1000,
  };
}

/** True if the access token expires within `marginMs`. */
export function needsRefresh(session: Session, nowMs: number, marginMs = 60_000): boolean {
  return session.expiresAt - nowMs <= marginMs;
}

export function canRefresh(session: Session, nowMs: number): boolean {
  return session.refreshExpiresAt > nowMs;
}

import { canRefresh, needsRefresh, sessionFromTokens } from './session';

function jwt(payload: object): string {
  const encode = (o: object) =>
    btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(o)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(payload)}.signature`;
}

describe('sessionFromTokens', () => {
  const session = sessionFromTokens({
    token: jwt({ uid: 'user-1', usn: 'حسین', exp: 2_000 }),
    refreshToken: jwt({ uid: 'user-1', exp: 9_000 }),
  });

  it('decodes user and expiry from the JWTs (including non-ASCII usernames)', () => {
    expect(session.userId).toBe('user-1');
    expect(session.username).toBe('حسین');
    expect(session.expiresAt).toBe(2_000_000);
    expect(session.refreshExpiresAt).toBe(9_000_000);
  });

  it('knows when to refresh', () => {
    expect(needsRefresh(session, 1_000_000)).toBe(false);
    expect(needsRefresh(session, 1_950_000)).toBe(true);
    expect(canRefresh(session, 5_000_000)).toBe(true);
    expect(canRefresh(session, 9_500_000)).toBe(false);
  });
});

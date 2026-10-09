import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { NakamaApi } from '../../services/remote/nakamaApi';
import { canRefresh, sessionFromTokens, type Session } from './session';
import { SessionManager } from './sessionManager';
import { clearSession, loadSession, saveSession } from './sessionStore';

/** signedIn = has an account session; offline = chose to practice without signing in. */
export type AuthStatus = 'signedOut' | 'signedIn' | 'offline';

interface AuthContextValue {
  status: AuthStatus;
  session: Session | null;
  /** Set when signed in: authenticated server calls. */
  manager: SessionManager | null;
  api: NakamaApi;
  signIn(email: string, password: string): Promise<void>;
  signUp(username: string, email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  continueOffline(): void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function initialSession(): Session | null {
  const saved = loadSession();
  return saved && canRefresh(saved, Date.now()) ? saved : null;
}

interface AuthState {
  session: Session | null;
  /** One manager per signed-in user; it refreshes the session in place. */
  manager: SessionManager | null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [api] = useState(() => new NakamaApi());
  const [{ session, manager }, setState] = useState<AuthState>(() => {
    const saved = initialSession();
    return { session: saved, manager: saved ? new SessionManager(api, saved) : null };
  });
  const [offline, setOffline] = useState(false);

  /** Persists every session change (sign-in, refresh, expiry, sign-out). */
  const applySession = useCallback(
    (next: Session | null) => {
      if (next) saveSession(next);
      else clearSession();
      setState((prev) => ({
        session: next,
        manager: !next
          ? null
          : prev.manager && prev.session?.userId === next.userId
            ? prev.manager
            : new SessionManager(api, next),
      }));
    },
    [api],
  );

  // Token refreshes and expiry reported by the manager.
  useEffect(() => manager?.subscribe(applySession), [manager, applySession]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const tokens = await api.authenticateEmail({ email: email.trim(), password, create: false });
      setOffline(false);
      applySession(sessionFromTokens(tokens));
    },
    [api, applySession],
  );

  const signUp = useCallback(
    async (username: string, email: string, password: string) => {
      const tokens = await api.authenticateEmail({
        email: email.trim(),
        password,
        create: true,
        username: username.trim(),
      });
      setOffline(false);
      applySession(sessionFromTokens(tokens));
    },
    [api, applySession],
  );

  const signOut = useCallback(async () => {
    applySession(null);
    setOffline(false);
    if (session) await api.logout(session).catch(() => {});
  }, [api, session, applySession]);

  const continueOffline = useCallback(() => setOffline(true), []);

  const status: AuthStatus = session ? 'signedIn' : offline ? 'offline' : 'signedOut';
  const value = useMemo(
    () => ({ status, session, manager, api, signIn, signUp, signOut, continueOffline }),
    [status, session, manager, api, signIn, signUp, signOut, continueOffline],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}

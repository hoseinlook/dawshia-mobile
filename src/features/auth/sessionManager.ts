import { NakamaApi, ServerError } from '../../services/remote/nakamaApi';
import { canRefresh, needsRefresh, sessionFromTokens, type Session } from './session';

/** Thrown when the session can't be renewed and the user must sign in again. */
export class SessionExpiredError extends Error {
  constructor() {
    super('Session expired — please sign in again');
    this.name = 'SessionExpiredError';
  }
}

/**
 * Owns the current session: refreshes the access token before it expires and
 * signs the user out when the refresh token is no longer valid.
 */
export class SessionManager {
  private refreshing: Promise<Session> | null = null;
  private readonly listeners = new Set<(session: Session | null) => void>();

  constructor(
    readonly api: NakamaApi,
    private session: Session,
  ) {}

  getSession(): Session {
    return this.session;
  }

  /** Notified when the session is refreshed (new tokens) or expires (null). */
  subscribe(listener: (session: Session | null) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private onChange(session: Session | null): void {
    for (const listener of this.listeners) listener(session);
  }

  /** Calls an RPC with a valid token, refreshing (once) on expiry. */
  async rpc<T>(id: string, payload: unknown = {}): Promise<T> {
    const token = await this.validToken();
    try {
      return await this.api.rpc<T>(token, id, payload);
    } catch (e) {
      if (e instanceof ServerError && e.status === 401) {
        const renewed = await this.refresh();
        return this.api.rpc<T>(renewed.token, id, payload);
      }
      throw e;
    }
  }

  private async validToken(): Promise<string> {
    if (!needsRefresh(this.session, Date.now())) return this.session.token;
    return (await this.refresh()).token;
  }

  private refresh(): Promise<Session> {
    // Share one in-flight refresh between concurrent calls.
    this.refreshing ??= this.doRefresh().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  private async doRefresh(): Promise<Session> {
    if (!canRefresh(this.session, Date.now())) {
      this.onChange(null);
      throw new SessionExpiredError();
    }
    try {
      this.session = sessionFromTokens(await this.api.refresh(this.session.refreshToken));
      this.onChange(this.session);
      return this.session;
    } catch (e) {
      if (e instanceof ServerError && e.status === 401) {
        this.onChange(null);
        throw new SessionExpiredError();
      }
      throw e;
    }
  }
}

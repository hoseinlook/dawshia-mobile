import { NAKAMA_SERVER_KEY, REQUEST_TIMEOUT_MS, SERVER_URL } from './config';

/** The server answered with an error (wrong password, validation, …). */
export class ServerError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ServerError';
  }
}

/** The server could not be reached at all. */
export class NetworkError extends Error {
  constructor(
    message: string,
    readonly reason: 'timeout' | 'unreachable',
  ) {
    super(message);
    this.name = 'NetworkError';
  }
}

export interface SessionTokens {
  token: string;
  refreshToken: string;
}

interface AuthResponse {
  token?: string;
  refresh_token?: string;
}

/**
 * Minimal Nakama REST API: email authentication, session refresh/logout and
 * RPC calls. (Real-time matches will use Nakama's socket API.)
 */
export class NakamaApi {
  constructor(private readonly baseUrl = SERVER_URL) {}

  get url(): string {
    return this.baseUrl;
  }

  /** Signs in with email + password. With `create`, registers a new account (username required). */
  async authenticateEmail(params: {
    email: string;
    password: string;
    create: boolean;
    username?: string;
  }): Promise<SessionTokens> {
    const query = new URLSearchParams({ create: String(params.create) });
    if (params.username) query.set('username', params.username);
    const body = await this.request(
      `/v2/account/authenticate/email?${query}`,
      this.basicAuth(),
      { email: params.email, password: params.password },
    );
    return this.tokens(body as AuthResponse);
  }

  async refresh(refreshToken: string): Promise<SessionTokens> {
    const body = await this.request('/v2/account/session/refresh', this.basicAuth(), {
      token: refreshToken,
    });
    return this.tokens(body as AuthResponse);
  }

  async logout(session: SessionTokens): Promise<void> {
    await this.request('/v2/session/logout', `Bearer ${session.token}`, {
      token: session.token,
      refresh_token: session.refreshToken,
    });
  }

  /** Calls a server RPC with a JSON payload and returns the parsed JSON response. */
  async rpc<T>(token: string, id: string, payload: unknown = {}): Promise<T> {
    // Nakama expects the RPC payload as a JSON-encoded string.
    const body = await this.request(
      `/v2/rpc/${encodeURIComponent(id)}`,
      `Bearer ${token}`,
      JSON.stringify(payload),
    );
    const raw = (body as { payload?: string }).payload;
    return (raw ? JSON.parse(raw) : {}) as T;
  }

  /** Pings the server. Returns the round-trip time in ms; throws if unreachable. */
  async ping(): Promise<number> {
    const started = Date.now();
    await this.send('GET', '/healthcheck');
    return Date.now() - started;
  }

  private basicAuth(): string {
    return `Basic ${btoa(`${NAKAMA_SERVER_KEY}:`)}`;
  }

  private tokens(body: AuthResponse): SessionTokens {
    if (!body.token || !body.refresh_token) throw new ServerError('Missing session in response', 500);
    return { token: body.token, refreshToken: body.refresh_token };
  }

  private request(path: string, authorization: string, body: unknown): Promise<unknown> {
    return this.send('POST', path, authorization, JSON.stringify(body));
  }

  private async send(
    method: 'GET' | 'POST',
    path: string,
    authorization?: string,
    body?: string,
  ): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          ...(authorization ? { Authorization: authorization } : {}),
          'Content-Type': 'application/json',
        },
        body,
        signal: controller.signal,
      });
    } catch (e) {
      const timedOut = controller.signal.aborted;
      throw new NetworkError(
        timedOut
          ? `No answer from ${this.baseUrl} within ${REQUEST_TIMEOUT_MS / 1000}s`
          : `Cannot reach ${this.baseUrl}: ${(e as Error).message}`,
        timedOut ? 'timeout' : 'unreachable',
      );
    } finally {
      clearTimeout(timer);
    }
    const json = (await response.json().catch(() => ({}))) as { message?: string };
    if (!response.ok) {
      throw new ServerError(json.message ?? `HTTP ${response.status}`, response.status);
    }
    return json;
  }
}

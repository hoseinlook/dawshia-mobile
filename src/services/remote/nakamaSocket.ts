import { SERVER_URL } from './config';

/** UTF-8 safe base64 (Nakama match data is base64 in the JSON protocol). */
export function toBase64(text: string): string {
  return btoa(encodeURIComponent(text).replace(/%([0-9A-F]{2})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16))));
}

export function fromBase64(data: string): string {
  const binary = atob(data);
  let encoded = '';
  for (let i = 0; i < binary.length; i++) encoded += `%${binary.charCodeAt(i).toString(16).padStart(2, '0')}`;
  return decodeURIComponent(encoded);
}

type Envelope = Record<string, unknown> & { cid?: string };
type Handler = (payload: any) => void;

/**
 * Minimal Nakama real-time socket (JSON protocol over WebSocket):
 * request/response by `cid`, and push messages by envelope key
 * (`matchmaker_matched`, `match_data`, …).
 */
export class NakamaSocket {
  private ws: WebSocket | null = null;
  private nextCid = 1;
  private readonly pending = new Map<string, { resolve: (v: Envelope) => void; reject: (e: Error) => void }>();
  private readonly handlers = new Map<string, Set<Handler>>();
  private closedByUs = false;

  constructor(private readonly baseUrl = SERVER_URL) {}

  /** `status: true` marks the user online for friends while connected. */
  connect(token: string, { status = false, timeoutMs = 8000 } = {}): Promise<void> {
    const url = `${this.baseUrl.replace(/^http/, 'ws')}/ws?lang=en&status=${status}&format=json&token=${encodeURIComponent(token)}`;
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      this.ws = ws;
      const timer = setTimeout(() => {
        ws.close();
        reject(new Error(`Socket connect timeout (${this.baseUrl})`));
      }, timeoutMs);
      ws.onopen = () => {
        clearTimeout(timer);
        resolve();
      };
      ws.onerror = () => {
        clearTimeout(timer);
        reject(new Error(`Socket error (${this.baseUrl})`));
      };
      ws.onclose = () => {
        for (const p of this.pending.values()) p.reject(new Error('Socket closed'));
        this.pending.clear();
        if (!this.closedByUs) this.emit('disconnect', {});
      };
      ws.onmessage = (event) => this.onMessage(String(event.data));
    });
  }

  /** Sends a request and resolves with the server's reply envelope. */
  request(envelope: Envelope, timeoutMs = 8000): Promise<Envelope> {
    const cid = String(this.nextCid++);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(cid);
        reject(new Error(`No reply to ${Object.keys(envelope)[0]}`));
      }, timeoutMs);
      this.pending.set(cid, {
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      this.send({ ...envelope, cid });
    });
  }

  /** Fire-and-forget message (e.g. match data). */
  send(envelope: Envelope): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(envelope));
  }

  on(key: string, handler: Handler): () => void {
    if (!this.handlers.has(key)) this.handlers.set(key, new Set());
    this.handlers.get(key)!.add(handler);
    return () => this.handlers.get(key)?.delete(handler);
  }

  close(): void {
    this.closedByUs = true;
    this.ws?.close();
    this.ws = null;
  }

  private emit(key: string, payload: unknown): void {
    for (const h of this.handlers.get(key) ?? []) h(payload);
  }

  private onMessage(raw: string): void {
    let envelope: Envelope;
    try {
      envelope = JSON.parse(raw) as Envelope;
    } catch {
      return;
    }
    if (envelope.cid && this.pending.has(envelope.cid)) {
      const p = this.pending.get(envelope.cid)!;
      this.pending.delete(envelope.cid);
      const error = envelope.error as { message?: string } | undefined;
      if (error) p.reject(new Error(error.message ?? 'Server error'));
      else p.resolve(envelope);
      return;
    }
    for (const key of Object.keys(envelope)) if (key !== 'cid') this.emit(key, envelope[key]);
  }
}

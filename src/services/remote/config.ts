/**
 * Dawshia server address: production over HTTPS (nginx in front of Nakama; the socket uses wss).
 * For local development set EXPO_PUBLIC_SERVER_URL / EXPO_PUBLIC_NAKAMA_SERVER_KEY
 * (e.g. in .env.local); they are inlined at bundle time.
 */
export const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL ?? 'https://dawshia.ir';

/** Must match `SERVER_KEY` on the server (/opt/dawshia/.env). Not a secret: it only identifies the app. */
export const NAKAMA_SERVER_KEY = process.env.EXPO_PUBLIC_NAKAMA_SERVER_KEY ?? 'dawshia-app-c5ef143e6dd8d020';
export const REQUEST_TIMEOUT_MS = 8000;

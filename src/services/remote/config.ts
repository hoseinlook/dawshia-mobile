/**
 * Dawshia server address. Hard-coded to the development machine for now.
 * TODO: make this configurable per build (dev / staging / production) and use HTTPS.
 */
export const SERVER_URL = 'http://192.168.1.105:7350';

/** Must match `socket.server_key` in dawshia-server/config. Not a secret: it only identifies the app. */
export const NAKAMA_SERVER_KEY = 'dawshia-local-server-key';
export const REQUEST_TIMEOUT_MS = 8000;

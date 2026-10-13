// The few Node APIs the video-eval scripts use (the app's tsconfig doesn't load @types/node).
declare module 'node:fs' {
  export function readFileSync(path: string): Uint8Array;
  export function readFileSync(path: string, encoding: 'utf8'): string;
  export function existsSync(path: string): boolean;
  export function writeFileSync(path: string, data: string): void;
  export function mkdirSync(path: string, options?: { recursive?: boolean }): void;
}
declare module 'node:path' {
  export function join(...parts: string[]): string;
}
declare module 'node:zlib' {
  export function gunzipSync(data: Uint8Array): { toString(encoding: 'utf8'): string };
}
declare const __dirname: string;

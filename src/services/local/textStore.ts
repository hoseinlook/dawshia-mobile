import { File, Paths } from 'expo-file-system';

/**
 * Small named text values kept on the device (settings, session, history, photo).
 * Files in the app's private storage; the web build uses localStorage (textStore.web.ts).
 * Reads are synchronous so the first render can already use them.
 */

export function readText(name: string): string | null {
  try {
    const file = new File(Paths.document, name);
    return file.exists ? file.textSync() : null;
  } catch {
    return null;
  }
}

/** Throws if the value cannot be saved. */
export function writeText(name: string, text: string): void {
  new File(Paths.document, name).write(text);
}

export function deleteText(name: string): void {
  try {
    const file = new File(Paths.document, name);
    if (file.exists) file.delete();
  } catch {
    // Ignore.
  }
}

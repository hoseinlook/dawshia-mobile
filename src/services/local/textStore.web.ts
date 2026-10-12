/** Web build of textStore.ts: the same named values in localStorage. */

const key = (name: string) => `dawshia:${name}`;

export function readText(name: string): string | null {
  try {
    return localStorage.getItem(key(name));
  } catch {
    return null;
  }
}

/** Throws if the value cannot be saved (storage full or blocked). */
export function writeText(name: string, text: string): void {
  localStorage.setItem(key(name), text);
}

export function deleteText(name: string): void {
  try {
    localStorage.removeItem(key(name));
  } catch {
    // Ignore.
  }
}

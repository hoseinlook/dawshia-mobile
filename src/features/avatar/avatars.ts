import { File, Paths } from 'expo-file-system';
import { useEffect, useState, useSyncExternalStore } from 'react';

import type { SocialService } from '../../services/types';

/**
 * Profile photos.
 *
 * - Your own photo is saved on the phone (works offline) and uploaded when signed in.
 * - Other players' photos are fetched in batches and cached in memory by the
 *   `avatarAt` timestamp the server sends with every player, so a changed photo
 *   is fetched again and an unchanged one never is.
 */

const MY_FILE = 'avatar.b64';

/** Data URI for an Image source. */
export function avatarUri(base64: string): string {
  return `data:image/jpeg;base64,${base64}`;
}

// --- your own photo -----------------------------------------------------------

let myAvatar: string | null | undefined;
const myListeners = new Set<() => void>();

function readMine(): string | null {
  if (myAvatar !== undefined) return myAvatar;
  try {
    const file = new File(Paths.document, MY_FILE);
    myAvatar = file.exists ? file.textSync() || null : null;
  } catch {
    myAvatar = null;
  }
  return myAvatar;
}

function storeMine(base64: string | null): void {
  myAvatar = base64;
  try {
    const file = new File(Paths.document, MY_FILE);
    if (base64) file.write(base64);
    else if (file.exists) file.delete();
  } catch {
    // Keep it in memory for this session.
  }
  for (const l of myListeners) l();
}

/** Your photo as base64 (null = none). Re-renders when it changes. */
export function useMyAvatar(): string | null {
  return useSyncExternalStore(
    (l) => {
      myListeners.add(l);
      return () => myListeners.delete(l);
    },
    readMine,
  );
}

/** Saves your photo on the phone and, when signed in, on the server. Throws if the upload fails. */
export async function setMyAvatar(social: SocialService, base64: string | null): Promise<void> {
  const previous = readMine();
  storeMine(base64);
  if (!social.available) return;
  try {
    await social.setAvatar(base64);
  } catch (e) {
    storeMine(previous);
    throw e;
  }
}

/** Signed in on a new phone: take the photo saved on the server. */
export async function restoreMyAvatar(social: SocialService, userId: string): Promise<void> {
  if (!social.available || readMine()) return;
  const avatars = await social.getAvatars([userId]);
  if (avatars[userId]?.image) storeMine(avatars[userId].image);
}

// --- other players --------------------------------------------------------------

const cache = new Map<string, { at: number; image: string | null }>();
const listeners = new Set<() => void>();
let pending = new Map<string, number>();
let timer: ReturnType<typeof setTimeout> | null = null;
let activeSocial: SocialService | null = null;
const BATCH_MS = 50;
const MAX_BATCH = 50;

function flush(): void {
  timer = null;
  const batch = pending;
  pending = new Map();
  const social = activeSocial;
  if (!social || batch.size === 0) return;
  const ids = [...batch.keys()];
  for (let i = 0; i < ids.length; i += MAX_BATCH) {
    const chunk = ids.slice(i, i + MAX_BATCH);
    social
      .getAvatars(chunk)
      .then((avatars) => {
        for (const id of chunk) cache.set(id, { at: batch.get(id)!, image: avatars[id]?.image ?? null });
        for (const l of listeners) l();
      })
      .catch(() => {
        for (const id of chunk) cache.delete(id); // try again next time
      });
  }
}

function request(social: SocialService, userId: string, at: number): void {
  activeSocial = social;
  // Mark as loading so the same photo is not requested twice.
  cache.set(userId, { at, image: cache.get(userId)?.image ?? null });
  pending.set(userId, at);
  timer ??= setTimeout(flush, BATCH_MS);
}

/** Another player's photo (base64) or null. `avatarAt` comes from the server's player data. */
export function useAvatar(social: SocialService, userId: string | undefined, avatarAt: number | undefined): string | null {
  const [, setVersion] = useState(0);
  useEffect(() => {
    const l = () => setVersion((v) => v + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  useEffect(() => {
    if (!userId || !avatarAt || !social.available) return;
    const cached = cache.get(userId);
    if (!cached || cached.at !== avatarAt) request(social, userId, avatarAt);
  }, [social, userId, avatarAt]);
  if (!userId || !avatarAt) return null;
  return cache.get(userId)?.image ?? null;
}

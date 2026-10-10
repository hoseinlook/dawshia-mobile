import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';

import { parseNotifications, type ServerNotification } from '../../services/remote/notifications';
import { usePresence } from './usePresence';

type Listener = (n: ServerNotification) => void;

const NotificationsContext = createContext<((listener: Listener) => () => void) | null>(null);

/**
 * Keeps the presence socket open (online status for friends) and hands the
 * server notifications that arrive on it (fight requests, chat messages) to subscribers.
 */
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const listeners = useRef(new Set<Listener>());
  const onNotifications = useCallback((payload: unknown) => {
    for (const n of parseNotifications(payload)) for (const l of listeners.current) l(n);
  }, []);
  usePresence(onNotifications);
  const subscribe = useCallback((listener: Listener) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);
  const value = useMemo(() => subscribe, [subscribe]);
  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

/** Calls `handler` for every server notification while mounted. */
export function useNotifications(handler: Listener): void {
  const subscribe = useContext(NotificationsContext);
  if (!subscribe) throw new Error('useNotifications must be used inside <NotificationsProvider>');
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  }, [handler]);
  useEffect(() => subscribe((n) => ref.current(n)), [subscribe]);
}

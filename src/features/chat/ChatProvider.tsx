import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

import { Notify, type ServerNotification } from '../../services/remote/notifications';
import { useServices } from '../../services/ServicesProvider';
import type { ChatPartner } from '../../services/types';
import { haptics } from '../../ui/haptics';
import { useNotifications } from '../social/NotificationsProvider';

/** A message that arrived while its chat was closed (shown briefly over the tabs). */
export interface MessagePreview {
  userId: string;
  username: string;
  text: string;
  at: number;
}

interface ChatContextValue {
  available: boolean;
  /** Past 1v1 opponents, most recent first (null until loaded). */
  partners: ChatPartner[] | null;
  /** Unread messages per user, since the app opened. */
  unread: Record<string, number>;
  totalUnread: number;
  latest: MessagePreview | null;
  dismissLatest(): void;
  refresh(): Promise<void>;
  /** The chat screen with this user is open: its messages are read. */
  setActive(userId: string | null): void;
}

const ChatContext = createContext<ChatContextValue | null>(null);

/** Chats with past opponents: partner list and unread counts from chat notifications. */
export function ChatProvider({ children }: { children: ReactNode }) {
  const { social } = useServices();
  const [partners, setPartners] = useState<ChatPartner[] | null>(null);
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [latest, setLatest] = useState<MessagePreview | null>(null);
  const active = useRef<string | null>(null);
  const loading = useRef(false);
  const partnersRef = useRef<ChatPartner[] | null>(null);

  const refresh = useCallback(async () => {
    if (!social.available || loading.current) return;
    loading.current = true;
    try {
      const list = await social.listChatPartners();
      partnersRef.current = list;
      setPartners(list);
    } catch {
      // Keep the last list; the Friends tab retries on focus.
    } finally {
      loading.current = false;
    }
  }, [social]);

  const onNotification = useCallback(
    (n: ServerNotification) => {
      if (n.code !== Notify.ChatMessage || typeof n.content.userId !== 'string') return;
      const userId = n.content.userId;
      if (active.current === userId) return; // the chat is open: it shows the message itself
      haptics.select();
      setUnread((prev) => ({ ...prev, [userId]: (prev[userId] ?? 0) + 1 }));
      setLatest({
        userId,
        username: String(n.content.username ?? ''),
        text: String(n.content.text ?? ''),
        at: Date.now(),
      });
      if (!partnersRef.current?.some((p) => p.userId === userId)) refresh(); // a new partner
    },
    [refresh],
  );
  useNotifications(onNotification);

  const setActive = useCallback((userId: string | null) => {
    active.current = userId;
    if (!userId) return;
    setUnread((prev) => {
      if (!prev[userId]) return prev;
      const next = { ...prev };
      delete next[userId];
      return next;
    });
    setLatest((prev) => (prev?.userId === userId ? null : prev));
  }, []);
  const dismissLatest = useCallback(() => setLatest(null), []);

  const value = useMemo(
    () => ({
      available: social.available,
      partners: social.available ? partners : null,
      unread,
      totalUnread: Object.values(unread).reduce((a, b) => a + b, 0),
      latest,
      dismissLatest,
      refresh,
      setActive,
    }),
    [social.available, partners, unread, latest, dismissLatest, refresh, setActive],
  );
  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat(): ChatContextValue {
  const value = useContext(ChatContext);
  if (!value) throw new Error('useChat must be used inside <ChatProvider>');
  return value;
}

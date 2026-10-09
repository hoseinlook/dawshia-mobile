import { createContext, useContext, useMemo, type ReactNode } from 'react';

import { useAuth } from '../features/auth/AuthProvider';
import { createLocalServices } from './local';
import { withRemote } from './remote';
import type { Services } from './types';

const ServicesContext = createContext<Services | null>(null);

/**
 * Provides the backend implementation to the app: local services, upgraded
 * with server-backed profile and sync while a user is signed in.
 */
export function ServicesProvider({ children }: { children: ReactNode }) {
  const { manager } = useAuth();
  const local = useMemo(() => createLocalServices(), []);
  const services = useMemo(() => (manager ? withRemote(local, manager) : local), [local, manager]);

  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
}

export function useServices(): Services {
  const services = useContext(ServicesContext);
  if (!services) throw new Error('useServices must be used inside <ServicesProvider>');
  return services;
}

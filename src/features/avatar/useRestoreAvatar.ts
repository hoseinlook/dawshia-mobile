import { useEffect } from 'react';

import { useServices } from '../../services/ServicesProvider';
import { useAuth } from '../auth/AuthProvider';
import { restoreMyAvatar } from './avatars';

/** After signing in on a phone without your photo, downloads it from the server. */
export function useRestoreAvatar(): void {
  const { social } = useServices();
  const { session } = useAuth();
  const userId = session?.userId;
  useEffect(() => {
    if (userId) restoreMyAvatar(social, userId).catch(() => {});
  }, [social, userId]);
}

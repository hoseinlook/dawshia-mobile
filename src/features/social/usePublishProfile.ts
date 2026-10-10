import { useEffect } from 'react';

import type { Progress } from '../../core/progress/progress';
import { useServices } from '../../services/ServicesProvider';

let lastPublished = -1;

/** Publishes total XP (level and rank for friends, opponents and rankings) whenever it changes. */
export function usePublishProfile(progress: Progress | null): void {
  const { social } = useServices();
  const xp = progress?.totalXp;
  useEffect(() => {
    if (!social.available || xp === undefined || xp === lastPublished) return;
    social
      .updatePublicProfile({ xp: Math.round(xp) })
      .then(() => {
        lastPublished = xp;
      })
      .catch(() => {});
  }, [social, xp]);
}

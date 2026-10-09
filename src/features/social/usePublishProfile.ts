import { useEffect } from 'react';

import type { Progress } from '../../core/progress/progress';
import { useServices } from '../../services/ServicesProvider';

let lastPublished = '';

/** Publishes level and rank (for friends and opponents) whenever they change. */
export function usePublishProfile(progress: Progress | null): void {
  const { social } = useServices();
  const level = progress?.level.level;
  const rank = progress?.rank;
  useEffect(() => {
    if (!social.available || !level || !rank) return;
    const key = `${level}:${rank}`;
    if (key === lastPublished) return;
    social
      .updatePublicProfile({ level, rank })
      .then(() => {
        lastPublished = key;
      })
      .catch(() => {});
  }, [social, level, rank]);
}

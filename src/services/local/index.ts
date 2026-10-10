import { listExercises } from '../../core/exercises/registry';
import { getTimeControl } from '../../core/match/timeControls';
import type { MatchConfig } from '../../core/match/types';
import { summarizeReps } from '../../core/stats/repTotals';
import type {
  AuthService,
  MatchHistoryRepository,
  MatchmakingService,
  MatchTransport,
  PlayerProfile,
  Profile,
  ProfileService,
  Services,
  SocialService,
} from '../types';
import { FileHistoryRepository } from './fileHistory';

const COUNTDOWN_MS = 3000;

function randomId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

class LocalAuthService implements AuthService {
  private readonly player: PlayerProfile = { id: 'local-player', displayName: 'You' };

  async getCurrentPlayer(): Promise<PlayerProfile> {
    return this.player;
  }
}

/** Offline matchmaking: only solo practice is supported. */
class LocalMatchmakingService implements MatchmakingService {
  async findMatch(request: Parameters<MatchmakingService['findMatch']>[0]): Promise<MatchConfig> {
    if (request.mode !== 'practice') {
      throw new Error(`"${request.mode}" matches need an online connection.`);
    }
    const timeControl = getTimeControl(request.timeControlId);
    return {
      id: randomId(),
      mode: request.mode,
      exerciseId: request.exerciseId,
      timeControlId: timeControl.id,
      durationMs: timeControl.durationSec * 1000,
      countdownMs: COUNTDOWN_MS,
      participants: [{ ...request.player, isLocal: true }],
      seed: Math.floor(Math.random() * 2 ** 31),
    };
  }
}

/** No opponents offline: publishing is a no-op and nothing is ever received. */
class LocalMatchTransport implements MatchTransport {
  publish(): void {}
  ready(): void {}
  sendLive(): void {}
  subscribe(): () => void {
    return () => {};
  }
  subscribeLive(): () => void {
    return () => {};
  }
  subscribeResult(): () => void {
    return () => {};
  }
  close(): void {}
}

/** Profile computed from the match history stored on this device. */
export class LocalProfileService implements ProfileService {
  constructor(private readonly history: MatchHistoryRepository) {}

  async getProfile(): Promise<Profile> {
    const results = await this.history.list();
    const ids = listExercises().map((e) => e.id);
    return {
      displayName: null,
      source: 'device',
      serverUnreachable: false,
      exercises: summarizeReps(results, ids, new Date()),
      ratings: {},
    };
  }
}

/** Friends need an account and the server. */
const offlineSocial: SocialService = {
  available: false,
  listFriends: async () => [],
  addFriend: async () => {
    throw new Error('signInRequired');
  },
  removeFriend: async () => {},
  updatePublicProfile: async () => {},
  listTopPlayers: async () => {
    throw new Error('signInRequired');
  },
  getPlayer: async () => {
    throw new Error('signInRequired');
  },
  setAvatar: async () => {},
  getAvatars: async () => ({}),
  challengeFriend: async () => {
    throw new Error('signInRequired');
  },
  declineChallenge: async () => {},
};

export function createLocalServices(): Services {
  const history = new FileHistoryRepository();
  return {
    auth: new LocalAuthService(),
    matchmaking: new LocalMatchmakingService(),
    history,
    profile: new LocalProfileService(history),
    social: offlineSocial,
    openMatchTransport: () => new LocalMatchTransport(),
  };
}

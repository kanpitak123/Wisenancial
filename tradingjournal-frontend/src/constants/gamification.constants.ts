import type {
  GamificationQuery,
  MissionFrequency,
  MissionStatus,
} from '../types/gamification.types';

export const GAMIFICATION_API_PATH = '/gamification';

export const DEFAULT_GAMIFICATION_QUERY: GamificationQuery = {
  frequency: 'DAILY',
  limit: 20,
};

export const MISSION_FREQUENCIES: readonly MissionFrequency[] = [
  'ONCE',
  'DAILY',
  'WEEKLY',
  'MONTHLY',
];

export const MISSION_STATUSES: readonly MissionStatus[] = [
  'IN_PROGRESS',
  'COMPLETED',
  'CLAIMED',
  'EXPIRED',
];

export const DEFAULT_POINTS_PER_TOKEN = 10;

export const DEFAULT_LEADERBOARD_LIMIT = 100;

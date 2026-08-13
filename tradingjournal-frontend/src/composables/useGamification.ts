import { storeToRefs } from 'pinia';
import { computed } from 'vue';
import { useGamificationStore } from '../stores/GamificationStore';
import type {
  GamificationQuery,
  RecordGamificationEventPayload,
} from '../types/gamification.types';

export function useGamification() {
  const store = useGamificationStore();

  const { overview, missions, leaderboard, filters, isLoading, isSubmitting, error } =
    storeToRefs(store);

  const pointsBalance = computed(() => store.pointsBalance);

  const aiTokenBalance = computed(() => store.aiTokenBalance);

  const currentStreak = computed(() => store.currentStreak);

  const longestStreak = computed(() => store.longestStreak);

  const userRank = computed(() => store.userRank);

  const pointsPerToken = computed(() => store.pointsPerToken);

  const completedMissions = computed(() => store.completedMissions);

  const claimableMissions = computed(() => store.claimableMissions);

  const inProgressMissions = computed(() => store.inProgressMissions);

  const claimedMissions = computed(() => store.claimedMissions);

  const fetchOverview = (query: Partial<GamificationQuery> = {}) => store.fetchOverview(query);

  const fetchMissions = (query: Partial<GamificationQuery> = {}) => store.fetchMissions(query);

  const claimMission = (missionId: number) => store.claimMission(missionId);

  const redeemTokens = (tokensToRedeem: number) => store.redeemTokens(tokensToRedeem);

  const fetchLeaderboard = (limit?: number) => store.fetchLeaderboard(limit);

  const recordEvent = (payload: RecordGamificationEventPayload) => store.recordEvent(payload);

  return {
    overview,
    missions,
    leaderboard,
    filters,
    isLoading,
    isSubmitting,
    error,

    pointsBalance,
    aiTokenBalance,
    currentStreak,
    longestStreak,
    userRank,
    pointsPerToken,
    completedMissions,
    claimableMissions,
    inProgressMissions,
    claimedMissions,

    fetchOverview,
    fetchMissions,
    claimMission,
    redeemTokens,
    fetchLeaderboard,
    recordEvent,
    setFilters: (filters: Partial<GamificationQuery>) => store.setFilters(filters),
    resetFilters: () => store.resetFilters(),
    clearError: () => store.clearError(),
  };
}

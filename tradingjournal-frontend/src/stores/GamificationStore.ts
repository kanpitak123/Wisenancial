import { defineStore } from 'pinia';
import { usePortfolioStore } from './PortfolioStore';
import { useUserStore } from './UserStore';
import {
  DEFAULT_GAMIFICATION_QUERY,
  DEFAULT_POINTS_PER_TOKEN,
} from '../constants/gamification.constants';
import { gamificationService, getGamificationErrorMessage } from '../services/gamification.service';
import type {
  GamificationOverview,
  GamificationQuery,
  LeaderboardEntry,
  Mission,
  RecordGamificationEventPayload,
} from '../types/gamification.types';

export const useGamificationStore = defineStore('gamification', {
  state: () => ({
    overview: null as GamificationOverview | null,
    missions: [] as Mission[],
    leaderboard: [] as LeaderboardEntry[],
    filters: {
      ...DEFAULT_GAMIFICATION_QUERY,
    } as GamificationQuery,
    isLoading: false,
    isSubmitting: false,
    error: null as string | null,
  }),

  getters: {
    pointsBalance: (state) => state.overview?.balances.points ?? 0,

    aiTokenBalance: (state) => state.overview?.balances.ai_tokens ?? 0,

    currentStreak: (state) => state.overview?.streak.current ?? 0,

    longestStreak: (state) => state.overview?.streak.longest ?? 0,

    userRank: (state) => state.overview?.rank ?? null,

    pointsPerToken: (state) =>
      state.overview?.redemption.points_per_token ?? DEFAULT_POINTS_PER_TOKEN,

    completedMissions: (state) =>
      state.missions.filter((mission) => mission.status === 'COMPLETED'),

    claimableMissions: (state) => state.missions.filter((mission) => mission.can_claim),

    inProgressMissions: (state) =>
      state.missions.filter((mission) => mission.status === 'IN_PROGRESS'),

    claimedMissions: (state) => state.missions.filter((mission) => mission.status === 'CLAIMED'),
  },

  actions: {
    clearError() {
      this.error = null;
    },

    /**
     * ภารกิจถูกแบ่ง audience ตาม portfolio_type ฝั่ง backend อยู่แล้ว
     * (ALL / TRADER / INVESTOR) แต่ต้องส่ง portfolio_type ไปด้วยถึงจะกรองให้
     * ไม่ส่ง = ได้ภารกิจของทั้งสองโหมดปนกัน เช่น STOCK_BUY โผล่ในโหมด Forex
     *
     * ค่าที่ผู้เรียกส่งมาเองยังชนะเสมอ เผื่อหน้าไหนอยากขอข้ามโหมด
     */
    resolveQuery(query: Partial<GamificationQuery>): GamificationQuery {
      return {
        ...this.filters,
        portfolio_type: usePortfolioStore().activeType,
        ...query,
      };
    },

    setFilters(filters: Partial<GamificationQuery>) {
      this.filters = {
        ...this.filters,
        ...filters,
      };
    },

    resetFilters() {
      this.filters = {
        ...DEFAULT_GAMIFICATION_QUERY,
      };
    },

    async fetchOverview(query: Partial<GamificationQuery> = {}) {
      this.isLoading = true;
      this.error = null;

      try {
        const params = this.resolveQuery(query);

        const overview = await gamificationService.fetchOverview(params);

        this.overview = overview;
        this.missions = overview.missions;
        this.filters = params;

        this.syncUserStore(overview.balances.points, overview.balances.ai_tokens);

        return overview;
      } catch (error) {
        this.error = getGamificationErrorMessage(error);
        throw error;
      } finally {
        this.isLoading = false;
      }
    },

    async fetchMissions(query: Partial<GamificationQuery> = {}) {
      this.isLoading = true;
      this.error = null;

      try {
        const params = this.resolveQuery(query);

        const missions = await gamificationService.fetchMissions(params);

        this.missions = missions;
        this.filters = params;

        if (this.overview) {
          this.overview.missions = missions;
        }

        return missions;
      } catch (error) {
        this.error = getGamificationErrorMessage(error);
        throw error;
      } finally {
        this.isLoading = false;
      }
    },

    async claimMission(missionId: number) {
      this.isSubmitting = true;
      this.error = null;

      try {
        const result = await gamificationService.claimMission(missionId);

        const mission = this.missions.find((item) => item.id === missionId);

        if (mission) {
          mission.status = 'CLAIMED';
          mission.can_claim = false;
          mission.claimed_at = new Date().toISOString();
        }

        if (this.overview) {
          this.overview.balances.points = result.points_balance;
        }

        this.syncUserStore(result.points_balance);

        return result;
      } catch (error) {
        this.error = getGamificationErrorMessage(error);
        throw error;
      } finally {
        this.isSubmitting = false;
      }
    },

    async redeemTokens(tokensToRedeem: number) {
      this.isSubmitting = true;
      this.error = null;

      try {
        const result = await gamificationService.redeemTokens(tokensToRedeem);

        if (this.overview) {
          this.overview.balances.points = result.balance.points_balance;
          this.overview.balances.ai_tokens = result.balance.ai_token_balance;
        }

        this.syncUserStore(result.balance.points_balance, result.balance.ai_token_balance);

        return result;
      } catch (error) {
        this.error = getGamificationErrorMessage(error);
        throw error;
      } finally {
        this.isSubmitting = false;
      }
    },

    async fetchLeaderboard(limit?: number) {
      this.isLoading = true;
      this.error = null;

      try {
        const leaderboard = await gamificationService.fetchLeaderboard(limit);

        this.leaderboard = leaderboard;

        return leaderboard;
      } catch (error) {
        this.error = getGamificationErrorMessage(error);
        throw error;
      } finally {
        this.isLoading = false;
      }
    },

    async recordEvent(payload: RecordGamificationEventPayload) {
      this.error = null;

      try {
        // เหมือน resolveQuery — ไม่ส่ง portfolio_type ไป backend จะนับให้เฉพาะภารกิจ audience ALL
        const result = await gamificationService.recordEvent({
          portfolio_type: usePortfolioStore().activeType,
          ...payload,
        });

        await this.fetchMissions();

        return result;
      } catch (error) {
        this.error = getGamificationErrorMessage(error);
        throw error;
      }
    },

    syncUserStore(pointsBalance: number, aiTokenBalance?: number) {
      const userStore = useUserStore();

      if (!userStore.profile) {
        return;
      }

      userStore.profile.points_balance = pointsBalance;

      if (aiTokenBalance !== undefined) {
        userStore.profile.ai_token_balance = aiTokenBalance;
      }
    },
  },
});

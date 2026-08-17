import { type AxiosError } from 'axios';
import { api } from 'src/boot/axios';
import {
  DEFAULT_LEADERBOARD_LIMIT,
  GAMIFICATION_API_PATH,
} from '../constants/gamification.constants';
import type {
  ApiErrorResponse,
  ClaimMissionResponse,
  GamificationOverview,
  GamificationQuery,
  LeaderboardEntry,
  Mission,
  RecordGamificationEventPayload,
  RecordGamificationEventResponse,
  RedeemTokensResponse,
} from '../types/gamification.types';

export function getGamificationErrorMessage(error: unknown): string {
  const axiosError = error as AxiosError<ApiErrorResponse>;

  const message = axiosError.response?.data?.message;

  if (Array.isArray(message)) {
    return message.join(', ');
  }

  return message ?? axiosError.message ?? 'เกิดข้อผิดพลาด';
}

export const gamificationService = {
  async fetchOverview(query: GamificationQuery = {}): Promise<GamificationOverview> {
    const response = await api.get<GamificationOverview>(GAMIFICATION_API_PATH, {
      params: query,
    });

    return response.data;
  },

  async fetchMissions(query: GamificationQuery = {}): Promise<Mission[]> {
    const response = await api.get<Mission[]>(`${GAMIFICATION_API_PATH}/missions`, {
      params: query,
    });

    return response.data;
  },

  async claimMission(missionId: number): Promise<ClaimMissionResponse> {
    const response = await api.post<ClaimMissionResponse>(
      `${GAMIFICATION_API_PATH}/missions/${missionId}/claim`,
      {},
    );

    return response.data;
  },

  async redeemTokens(tokensToRedeem: number): Promise<RedeemTokensResponse> {
    const response = await api.post<RedeemTokensResponse>(`${GAMIFICATION_API_PATH}/redeem`, {
      tokensToRedeem,
    });

    return response.data;
  },

  async fetchLeaderboard(limit = DEFAULT_LEADERBOARD_LIMIT): Promise<LeaderboardEntry[]> {
    const response = await api.get<LeaderboardEntry[]>(`${GAMIFICATION_API_PATH}/leaderboard`, {
      params: { limit },
    });

    return response.data;
  },

  async recordEvent(
    payload: RecordGamificationEventPayload,
  ): Promise<RecordGamificationEventResponse> {
    const response = await api.post<RecordGamificationEventResponse>(
      `${GAMIFICATION_API_PATH}/events`,
      payload,
    );

    return response.data;
  },
};

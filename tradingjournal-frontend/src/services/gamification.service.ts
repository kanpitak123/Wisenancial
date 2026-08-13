import axios, { type AxiosError } from 'axios';
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

const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

const api = axios.create({
  baseURL: API_BASE_URL,
});

function getAccessToken(): string {
  let token = localStorage.getItem('access_token') ?? localStorage.getItem('token');

  if (!token) {
    throw new Error('ไม่พบ Token กรุณาเข้าสู่ระบบใหม่');
  }

  token = token.replace(/^"(.*)"$/, '$1');

  return token;
}

function authHeaders() {
  return {
    Authorization: `Bearer ${getAccessToken()}`,
  };
}

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
      headers: authHeaders(),
    });

    return response.data;
  },

  async fetchMissions(query: GamificationQuery = {}): Promise<Mission[]> {
    const response = await api.get<Mission[]>(`${GAMIFICATION_API_PATH}/missions`, {
      params: query,
      headers: authHeaders(),
    });

    return response.data;
  },

  async claimMission(missionId: number): Promise<ClaimMissionResponse> {
    const response = await api.post<ClaimMissionResponse>(
      `${GAMIFICATION_API_PATH}/missions/${missionId}/claim`,
      {},
      {
        headers: authHeaders(),
      },
    );

    return response.data;
  },

  async redeemTokens(tokensToRedeem: number): Promise<RedeemTokensResponse> {
    const response = await api.post<RedeemTokensResponse>(
      `${GAMIFICATION_API_PATH}/redeem`,
      {
        tokensToRedeem,
      },
      {
        headers: authHeaders(),
      },
    );

    return response.data;
  },

  async fetchLeaderboard(limit = DEFAULT_LEADERBOARD_LIMIT): Promise<LeaderboardEntry[]> {
    const response = await api.get<LeaderboardEntry[]>(`${GAMIFICATION_API_PATH}/leaderboard`, {
      params: { limit },
      headers: authHeaders(),
    });

    return response.data;
  },

  async recordEvent(
    payload: RecordGamificationEventPayload,
  ): Promise<RecordGamificationEventResponse> {
    const response = await api.post<RecordGamificationEventResponse>(
      `${GAMIFICATION_API_PATH}/events`,
      payload,
      {
        headers: authHeaders(),
      },
    );

    return response.data;
  },
};

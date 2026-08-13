import type { AxiosError } from 'axios';
import { api } from 'src/boot/axios';
import { SHARE_API_PATH } from '../constants/share.constants';
import type {
  ApiErrorResponse,
  GenerateShareMessageResponse,
  LogShareActivityPayload,
  LogShareActivityResponse,
  ShareImageData,
  ShareLog,
  SharePlatform,
  ShareStatistics,
  SocialSharingData,
} from '../types/share.types';

export function getShareErrorMessage(error: unknown, fallback = 'เกิดข้อผิดพลาด'): string {
  const axiosError = error as AxiosError<ApiErrorResponse>;

  const message = axiosError.response?.data?.message;

  if (Array.isArray(message)) {
    return message.join(', ');
  }

  return message ?? axiosError.response?.data?.error ?? axiosError.message ?? fallback;
}

export function isPaidAccessError(error: unknown): boolean {
  const axiosError = error as AxiosError;

  const status = axiosError.response?.status;

  return status === 402 || status === 403;
}

export const shareService = {
  async getStatistics(portfolioId: number): Promise<ShareStatistics> {
    const response = await api.get<ShareStatistics>(`${SHARE_API_PATH}/portfolio/${portfolioId}`);

    return response.data;
  },

  async generateMessage(
    portfolioId: number,
    platform: SharePlatform,
  ): Promise<GenerateShareMessageResponse> {
    const response = await api.get<GenerateShareMessageResponse>(
      `${SHARE_API_PATH}/portfolio/${portfolioId}/message/${platform}`,
    );

    return response.data;
  },

  async generateImage(portfolioId: number): Promise<ShareImageData> {
    const response = await api.get<ShareImageData>(
      `${SHARE_API_PATH}/portfolio/${portfolioId}/image`,
    );

    return response.data;
  },

  async logShare(
    portfolioId: number,
    payload: LogShareActivityPayload,
  ): Promise<LogShareActivityResponse> {
    const response = await api.post<LogShareActivityResponse>(
      `${SHARE_API_PATH}/portfolio/${portfolioId}/log`,
      payload,
    );

    return response.data;
  },

  async getLogs(portfolioId: number, limit: number): Promise<ShareLog[]> {
    const response = await api.get<ShareLog[]>(`${SHARE_API_PATH}/portfolio/${portfolioId}/logs`, {
      params: {
        limit,
      },
    });

    return response.data;
  },

  async getSocialData(portfolioId: number): Promise<SocialSharingData> {
    const response = await api.get<SocialSharingData>(
      `${SHARE_API_PATH}/portfolio/${portfolioId}/social-data`,
    );

    return response.data;
  },
};

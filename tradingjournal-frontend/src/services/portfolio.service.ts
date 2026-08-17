import { type AxiosError } from 'axios';
import { api } from 'src/boot/axios';
import { PORTFOLIO_API_PATH } from '../constants/portfolio.constants';
import type {
  ApiErrorResponse,
  CreatePortfolioPayload,
  DeletePortfolioResponse,
  ListPortfoliosQuery,
  Portfolio,
  PortfolioQuota,
  UpdatePortfolioPayload,
} from '../types/portfolio.types';

// ใช้ instance กลางจาก boot/axios — แนบ token, จัดการ 401 และรองรับ mock mode ให้อัตโนมัติ
function normalizeCreatePayload(payload: CreatePortfolioPayload): CreatePortfolioPayload {
  return {
    ...payload,
    name: payload.name.trim(),
    ...(payload.currency !== undefined ? { currency: payload.currency.trim().toUpperCase() } : {}),
    ...(payload.icon?.trim() ? { icon: payload.icon.trim() } : {}),
    ...(payload.color !== undefined ? { color: payload.color.trim().toUpperCase() } : {}),
  };
}

function normalizeUpdatePayload(payload: UpdatePortfolioPayload): UpdatePortfolioPayload {
  return {
    ...payload,
    ...(payload.name !== undefined && {
      name: payload.name.trim(),
    }),
    ...(payload.currency !== undefined && {
      currency: payload.currency.trim().toUpperCase(),
    }),
    ...(payload.icon !== undefined && {
      icon: payload.icon?.trim() || null,
    }),
    ...(payload.color !== undefined && {
      color: payload.color?.trim().toUpperCase() || null,
    }),
  };
}

export function getPortfolioErrorMessage(
  error: unknown,
  fallback: string = 'เกิดข้อผิดพลาด',
): string {
  const axiosError = error as AxiosError<ApiErrorResponse>;

  const message = axiosError.response?.data?.message;

  if (Array.isArray(message)) {
    return message.join(', ');
  }

  return message ?? axiosError.message ?? fallback;
}

export const portfolioService = {
  async getAll(query: ListPortfoliosQuery = {}): Promise<Portfolio[]> {
    const response = await api.get<Portfolio[]>(PORTFOLIO_API_PATH, {
      params: query,
    });

    return response.data;
  },

  async getOne(id: number): Promise<Portfolio> {
    const response = await api.get<Portfolio>(`${PORTFOLIO_API_PATH}/${id}`);

    return response.data;
  },

  /** โควต้ารวมทั้งสองโหมดตาม subscription tier ของผู้ใช้ */
  async getQuota(): Promise<PortfolioQuota> {
    const response = await api.get<PortfolioQuota>(`${PORTFOLIO_API_PATH}/quota`);

    return response.data;
  },

  async create(payload: CreatePortfolioPayload): Promise<Portfolio> {
    const response = await api.post<Portfolio>(PORTFOLIO_API_PATH, normalizeCreatePayload(payload));

    return response.data;
  },

  async update(id: number, payload: UpdatePortfolioPayload): Promise<Portfolio> {
    const response = await api.patch<Portfolio>(
      `${PORTFOLIO_API_PATH}/${id}`,
      normalizeUpdatePayload(payload),
    );

    return response.data;
  },

  async delete(id: number): Promise<DeletePortfolioResponse> {
    const response = await api.delete<DeletePortfolioResponse>(`${PORTFOLIO_API_PATH}/${id}`);

    return response.data;
  },
};

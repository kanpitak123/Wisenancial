import axios, { type AxiosError } from 'axios';
import { PORTFOLIO_API_PATH } from '../constants/portfolio.constants';
import type {
  ApiErrorResponse,
  CreatePortfolioPayload,
  DeletePortfolioResponse,
  ListPortfoliosQuery,
  Portfolio,
  UpdatePortfolioPayload,
} from '../types/portfolio.types';

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
      headers: authHeaders(),
    });

    return response.data;
  },

  async getOne(id: number): Promise<Portfolio> {
    const response = await api.get<Portfolio>(`${PORTFOLIO_API_PATH}/${id}`, {
      headers: authHeaders(),
    });

    return response.data;
  },

  async create(payload: CreatePortfolioPayload): Promise<Portfolio> {
    const response = await api.post<Portfolio>(
      PORTFOLIO_API_PATH,
      normalizeCreatePayload(payload),
      {
        headers: authHeaders(),
      },
    );

    return response.data;
  },

  async update(id: number, payload: UpdatePortfolioPayload): Promise<Portfolio> {
    const response = await api.patch<Portfolio>(
      `${PORTFOLIO_API_PATH}/${id}`,
      normalizeUpdatePayload(payload),
      {
        headers: authHeaders(),
      },
    );

    return response.data;
  },

  async delete(id: number): Promise<DeletePortfolioResponse> {
    const response = await api.delete<DeletePortfolioResponse>(`${PORTFOLIO_API_PATH}/${id}`, {
      headers: authHeaders(),
    });

    return response.data;
  },
};

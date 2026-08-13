import axios, { type AxiosError } from 'axios';
import { RECORDS_API_PATH } from '../constants/records.constants';
import type {
  ApiErrorResponse,
  CreateManualRecordPayload,
  CreateManualRecordResponse,
  CreateTransferPayload,
  PortfolioRecord,
  RebuildBalanceResponse,
  RecordsQuery,
  RecordsSummary,
  ReverseRecordPayload,
  TransferResponse,
} from '../types/records.types';

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

export function getRecordsErrorMessage(error: unknown, fallback = 'เกิดข้อผิดพลาด'): string {
  const axiosError = error as AxiosError<ApiErrorResponse>;

  const message = axiosError.response?.data?.message;

  if (Array.isArray(message)) {
    return message.join(', ');
  }

  return message ?? axiosError.message ?? fallback;
}

export const recordsService = {
  async getAll(portfolioId: number, query: RecordsQuery = {}): Promise<PortfolioRecord[]> {
    const response = await api.get<PortfolioRecord[]>(
      `${RECORDS_API_PATH}/portfolio/${portfolioId}`,
      {
        params: query,
        headers: authHeaders(),
      },
    );

    return response.data;
  },

  async getSummary(portfolioId: number): Promise<RecordsSummary> {
    const response = await api.get<RecordsSummary>(
      `${RECORDS_API_PATH}/portfolio/${portfolioId}/summary`,
      {
        headers: authHeaders(),
      },
    );

    return response.data;
  },

  async createManual(
    portfolioId: number,
    payload: CreateManualRecordPayload,
  ): Promise<CreateManualRecordResponse> {
    const response = await api.post<CreateManualRecordResponse>(
      `${RECORDS_API_PATH}/portfolio/${portfolioId}`,
      payload,
      {
        headers: authHeaders(),
      },
    );

    return response.data;
  },

  async transfer(payload: CreateTransferPayload): Promise<TransferResponse> {
    const response = await api.post<TransferResponse>(`${RECORDS_API_PATH}/transfer`, payload, {
      headers: authHeaders(),
    });

    return response.data;
  },

  async reverse(recordId: number, payload: ReverseRecordPayload = {}): Promise<PortfolioRecord> {
    const response = await api.post<PortfolioRecord>(
      `${RECORDS_API_PATH}/${recordId}/reverse`,
      payload,
      {
        headers: authHeaders(),
      },
    );

    return response.data;
  },

  async rebuildBalance(portfolioId: number): Promise<RebuildBalanceResponse> {
    const response = await api.post<RebuildBalanceResponse>(
      `${RECORDS_API_PATH}/portfolio/${portfolioId}/rebuild-balance`,
      {},
      {
        headers: authHeaders(),
      },
    );

    return response.data;
  },
};

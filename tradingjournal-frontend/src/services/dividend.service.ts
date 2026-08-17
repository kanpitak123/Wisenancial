import type { AxiosError } from 'axios';
import { api } from 'src/boot/axios';
import { DIVIDENDS_API_PATH } from '../constants/dividend.constants';
import type {
  ApiErrorResponse,
  CreateDividendPayload,
  CreateDividendResponse,
  Dividend,
  DividendSummary,
  DividendTaxSummary,
  RemoveDividendResponse,
  UpdateDividendPayload,
  UpdateDividendResponse,
} from '../types/dividend.types';

export function getDividendErrorMessage(error: unknown, fallback = 'เกิดข้อผิดพลาด'): string {
  const axiosError = error as AxiosError<ApiErrorResponse>;

  const message = axiosError.response?.data?.message;

  if (Array.isArray(message)) {
    return message.join(', ');
  }

  return message ?? axiosError.message ?? fallback;
}

function normalizePayload<T extends CreateDividendPayload | UpdateDividendPayload>(payload: T): T {
  return {
    ...payload,
    ...(payload.symbol !== undefined && {
      symbol: payload.symbol.trim().toUpperCase(),
    }),
    ...(payload.name !== undefined && {
      name: payload.name?.trim(),
    }),
  } as T;
}

export const dividendService = {
  async getAll(portfolioId: number): Promise<Dividend[]> {
    const response = await api.get<Dividend[]>(`${DIVIDENDS_API_PATH}/portfolio/${portfolioId}`);

    return response.data;
  },

  async getSummary(portfolioId: number, year?: number): Promise<DividendSummary> {
    const response = await api.get<DividendSummary>(
      `${DIVIDENDS_API_PATH}/portfolio/${portfolioId}/summary`,
      {
        params: year !== undefined ? { year } : undefined,
      },
    );

    return response.data;
  },

  /** รายงานภาษีเงินปันผลรายปี — รายรายการ + ยอดรวมสำหรับส่งออก CSV */
  async getTaxSummary(portfolioId: number, year?: number): Promise<DividendTaxSummary> {
    const response = await api.get<DividendTaxSummary>(
      `${DIVIDENDS_API_PATH}/portfolio/${portfolioId}/tax-summary`,
      {
        params: year !== undefined ? { year } : undefined,
      },
    );

    return response.data;
  },

  async create(
    portfolioId: number,
    payload: CreateDividendPayload,
  ): Promise<CreateDividendResponse> {
    const response = await api.post<CreateDividendResponse>(
      `${DIVIDENDS_API_PATH}/portfolio/${portfolioId}`,
      normalizePayload(payload),
    );

    return response.data;
  },

  async update(id: number, payload: UpdateDividendPayload): Promise<UpdateDividendResponse> {
    const response = await api.patch<UpdateDividendResponse>(
      `${DIVIDENDS_API_PATH}/${id}`,
      normalizePayload(payload),
    );

    return response.data;
  },

  async remove(id: number): Promise<RemoveDividendResponse> {
    const response = await api.delete<RemoveDividendResponse>(`${DIVIDENDS_API_PATH}/${id}`);

    return response.data;
  },
};

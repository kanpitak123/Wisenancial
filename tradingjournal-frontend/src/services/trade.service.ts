import type { AxiosError } from 'axios';
import { api } from 'src/boot/axios';
import { TRADE_IMPORT, TRADE_MESSAGES, TRADES_API_PATH } from '../constants/trade.constants';
import type {
  ApiErrorResponse,
  CalculatePnlPayload,
  CloseTradePayload,
  CreateTradePayload,
  DeleteTradeResponse,
  ImportTradesPayload,
  ImportTradesResponse,
  LeaderboardApiItem,
  PnlBreakdown,
  Trade,
  UpdateTradePayload,
} from '../types/trade.types';

export function getTradeErrorMessage(error: unknown, fallback = 'เกิดข้อผิดพลาด'): string {
  const axiosError = error as AxiosError<ApiErrorResponse>;

  const message = axiosError.response?.data?.message;

  if (Array.isArray(message)) {
    return message.join(', ');
  }

  return message ?? axiosError.message ?? fallback;
}

function normalizePayload<T extends CreateTradePayload | UpdateTradePayload>(payload: T): T {
  return {
    ...payload,
    ...(payload.pair !== undefined && {
      pair: payload.pair.trim().toUpperCase(),
    }),
    ...(payload.timeframe !== undefined && {
      timeframe: payload.timeframe?.trim().toUpperCase(),
    }),
    ...(payload.trend !== undefined && {
      trend: payload.trend?.trim(),
    }),
    ...(payload.strategy !== undefined && {
      strategy: payload.strategy?.trim(),
    }),
    ...(payload.emotion !== undefined && {
      emotion: payload.emotion?.trim(),
    }),
    ...(payload.entry_reason !== undefined && {
      entry_reason: payload.entry_reason?.trim(),
    }),
    ...(payload.note !== undefined && {
      note: payload.note?.trim(),
    }),
    ...(payload.asset_name !== undefined && {
      asset_name: payload.asset_name?.trim(),
    }),
    ...(payload.macd !== undefined && {
      macd: payload.macd?.trim(),
    }),
    ...(payload.target_points !== undefined && {
      target_points: payload.target_points?.trim(),
    }),
  } as T;
}

function validateImportFile(file: File) {
  const isCsv = file.name.toLowerCase().endsWith(TRADE_IMPORT.acceptedExtension);

  if (!isCsv || file.size > TRADE_IMPORT.maxFileSize) {
    throw new Error(TRADE_MESSAGES.invalidCsv);
  }
}

export const tradeService = {
  async getByPortfolio(portfolioId: number): Promise<Trade[]> {
    const response = await api.get<Trade[]>(`${TRADES_API_PATH}/portfolio/${portfolioId}`);

    return response.data;
  },

  async getActive(portfolioId?: number): Promise<Trade[]> {
    const response = await api.get<Trade[]>(`${TRADES_API_PATH}/active`, {
      params: portfolioId !== undefined ? { portfolioId } : undefined,
    });

    return response.data;
  },

  async calculatePnl(payload: CalculatePnlPayload): Promise<PnlBreakdown> {
    const response = await api.post<PnlBreakdown>(`${TRADES_API_PATH}/calculate-pnl`, payload);

    return response.data;
  },

  async createOpen(portfolioId: number, payload: CreateTradePayload): Promise<Trade> {
    const response = await api.post<Trade>(
      `${TRADES_API_PATH}/portfolio/${portfolioId}/active`,
      normalizePayload(payload),
    );

    return response.data;
  },

  async createClosed(portfolioId: number, payload: CreateTradePayload): Promise<Trade> {
    const response = await api.post<Trade>(
      `${TRADES_API_PATH}/portfolio/${portfolioId}`,
      normalizePayload(payload),
    );

    return response.data;
  },

  async update(id: number, payload: UpdateTradePayload): Promise<Trade> {
    const response = await api.patch<Trade>(`${TRADES_API_PATH}/${id}`, normalizePayload(payload));

    return response.data;
  },

  async close(id: number, payload: CloseTradePayload): Promise<Trade> {
    const response = await api.patch<Trade>(`${TRADES_API_PATH}/${id}/close`, payload);

    return response.data;
  },

  async remove(id: number): Promise<DeleteTradeResponse> {
    const response = await api.delete<DeleteTradeResponse>(`${TRADES_API_PATH}/${id}`);

    return response.data;
  },

  async importTrades(
    portfolioId: number,
    payload: ImportTradesPayload,
  ): Promise<ImportTradesResponse> {
    validateImportFile(payload.file);

    const formData = new FormData();

    formData.append('file', payload.file);
    formData.append('broker', payload.broker.trim());
    formData.append('accountId', payload.accountId.trim());

    const response = await api.post<ImportTradesResponse>(
      `${TRADES_API_PATH}/portfolio/${portfolioId}/import`,
      formData,
    );

    return response.data;
  },

  async leaderboard(): Promise<LeaderboardApiItem[]> {
    const response = await api.get<LeaderboardApiItem[]>(`${TRADES_API_PATH}/leaderboard`);

    return response.data;
  },
};

import { api } from 'src/boot/axios';
import type { MonthlyMoversParams, MonthlyMoversResponse } from 'src/types/volatility.types';

// Wired to the backend: GET /market-insights/movers?market=&limit=
// Errors propagate to the caller so the UI can surface a real error/empty state.

export const volatilityService = {
  /** Fetch monthly movers from the API. */
  async getMonthlyMovers(params: MonthlyMoversParams = {}): Promise<MonthlyMoversResponse> {
    const { market, limit = 8 } = params;

    const response = await api.get<MonthlyMoversResponse>('/market-insights/movers', {
      params: { ...(market ? { market } : {}), limit },
    });
    return response.data;
  },
};

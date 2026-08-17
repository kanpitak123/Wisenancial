import type { AxiosError } from 'axios';
import { api } from 'src/boot/axios';
import { ANALYTICS_API_PATH } from '../constants/analytics.constants';
import type {
  AllocationItem,
  AnalyticsApiError,
  AnalyticsDateRange,
  AnalyticsOverview,
  AnalyticsTimeframe,
  BehavioralAnalytics,
  CashFlowResponse,
  DCASimulatorRequest,
  DCASimulatorResponse,
  HeatmapPoint,
  HoldingPeriodResponse,
  MonthlyGrowthPoint,
  PerformancePoint,
  PerformersResponse,
  ReturnVsBenchmarkResponse,
  TimeWeightedReturnResponse,
  WinRateBreakdown,
} from '../types/analytics.types';
import type { PortfolioRecord } from '../types/records.types';
import { isPaidTierError } from '../utils/paid-tier';

export function getAnalyticsErrorMessage(error: unknown, fallback = 'เกิดข้อผิดพลาด'): string {
  const axiosError = error as AxiosError<AnalyticsApiError>;

  const message = axiosError.response?.data?.message;

  if (Array.isArray(message)) {
    return message.join(', ');
  }

  return message ?? axiosError.message ?? fallback;
}

/** alias ของ isPaidTierError ที่ใช้ร่วมกันทั้งแอพ — คงชื่อเดิมไว้ให้ผู้เรียกไม่ต้องแก้ */
export const isAnalyticsPaidTierError = isPaidTierError;

export const analyticsService = {
  async getOverview(
    portfolioId: number,
    params: AnalyticsDateRange = {},
  ): Promise<AnalyticsOverview> {
    const response = await api.get<AnalyticsOverview>(
      `${ANALYTICS_API_PATH}/portfolio/${portfolioId}/overview`,
      { params },
    );

    return response.data;
  },

  async getPerformance(
    portfolioId: number,
    timeframe: AnalyticsTimeframe,
  ): Promise<PerformancePoint[]> {
    const response = await api.get<PerformancePoint[]>(
      `${ANALYTICS_API_PATH}/portfolio/${portfolioId}/performance`,
      {
        params: {
          timeframe,
        },
      },
    );

    return response.data;
  },

  async getDailyPnl(
    portfolioId: number,
    params: AnalyticsDateRange = {},
  ): Promise<Record<string, number>> {
    const response = await api.get<Record<string, number>>(
      `${ANALYTICS_API_PATH}/portfolio/${portfolioId}/daily-pnl`,
      { params },
    );

    return response.data;
  },

  async getMonthlyGrowth(
    portfolioId: number,
    params: AnalyticsDateRange = {},
  ): Promise<MonthlyGrowthPoint[]> {
    const response = await api.get<MonthlyGrowthPoint[]>(
      `${ANALYTICS_API_PATH}/portfolio/${portfolioId}/monthly-growth`,
      { params },
    );

    return response.data;
  },

  async getBehavioral(
    portfolioId: number,
    params: AnalyticsDateRange = {},
  ): Promise<BehavioralAnalytics> {
    const response = await api.get<BehavioralAnalytics>(
      `${ANALYTICS_API_PATH}/portfolio/${portfolioId}/behavioral`,
      { params },
    );

    return response.data;
  },

  async getWinRate(
    portfolioId: number,
    params: AnalyticsDateRange = {},
  ): Promise<WinRateBreakdown> {
    const response = await api.get<WinRateBreakdown>(
      `${ANALYTICS_API_PATH}/portfolio/${portfolioId}/win-rate`,
      { params },
    );

    return response.data;
  },

  async getTimeline(
    portfolioId: number,
    params: AnalyticsDateRange = {},
  ): Promise<PortfolioRecord[]> {
    const response = await api.get<PortfolioRecord[]>(
      `${ANALYTICS_API_PATH}/portfolio/${portfolioId}/timeline`,
      { params },
    );

    return response.data;
  },

  async getAllocation(portfolioId: number): Promise<AllocationItem[]> {
    const response = await api.get<AllocationItem[]>(
      `${ANALYTICS_API_PATH}/portfolio/${portfolioId}/allocation`,
    );

    return response.data;
  },

  async getReturnVsBenchmark(
    portfolioId: number,
    benchmark: string,
  ): Promise<ReturnVsBenchmarkResponse> {
    const response = await api.get<ReturnVsBenchmarkResponse>(
      `${ANALYTICS_API_PATH}/portfolio/${portfolioId}/return-vs-benchmark`,
      {
        params: {
          benchmark,
        },
      },
    );

    return response.data;
  },

  async getTimeWeightedReturn(portfolioId: number): Promise<TimeWeightedReturnResponse> {
    const response = await api.get<TimeWeightedReturnResponse>(
      `${ANALYTICS_API_PATH}/portfolio/${portfolioId}/time-weighted-return`,
    );

    return response.data;
  },

  async getMonthlyHeatmap(portfolioId: number): Promise<HeatmapPoint[]> {
    const response = await api.get<HeatmapPoint[]>(
      `${ANALYTICS_API_PATH}/portfolio/${portfolioId}/monthly-heatmap`,
    );

    return response.data;
  },

  async getPerformers(portfolioId: number): Promise<PerformersResponse> {
    const response = await api.get<PerformersResponse>(
      `${ANALYTICS_API_PATH}/portfolio/${portfolioId}/performers`,
    );

    return response.data;
  },

  async getHoldingPeriod(portfolioId: number): Promise<HoldingPeriodResponse> {
    const response = await api.get<HoldingPeriodResponse>(
      `${ANALYTICS_API_PATH}/portfolio/${portfolioId}/holding-period`,
    );

    return response.data;
  },

  async getCashFlow(portfolioId: number): Promise<CashFlowResponse> {
    const response = await api.get<CashFlowResponse>(
      `${ANALYTICS_API_PATH}/portfolio/${portfolioId}/cash-flow`,
    );

    return response.data;
  },

  async simulateDca(payload: DCASimulatorRequest): Promise<DCASimulatorResponse> {
    const response = await api.post<DCASimulatorResponse>(`${ANALYTICS_API_PATH}/dca-simulator`, {
      ...payload,
      symbol: payload.symbol.trim().toUpperCase(),
    });

    return response.data;
  },
};

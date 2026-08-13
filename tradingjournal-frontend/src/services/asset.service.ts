import type { AxiosError } from 'axios';
import { api } from 'src/boot/axios';
import { ASSETS_API_PATH } from '../constants/asset.constants';
import type {
  ApiErrorResponse,
  Asset,
  AssetListQuery,
  AssetMonthlyData,
  AssetNewsItem,
  ChartDataPoint,
  ChartInterval,
  CorporateEvent,
  InvestorAssetOverview,
  StockValuation,
  TrendingStock,
} from '../types/asset.types';

export function getAssetErrorMessage(error: unknown, fallback = 'เกิดข้อผิดพลาด'): string {
  const axiosError = error as AxiosError<ApiErrorResponse>;

  const message = axiosError.response?.data?.message;

  if (Array.isArray(message)) {
    return message.join(', ');
  }

  return message ?? axiosError.message ?? fallback;
}

function normalizeSymbol(symbol: string) {
  return symbol.trim().toUpperCase();
}

export const assetService = {
  async getForPortfolio(portfolioId: number, query: AssetListQuery = {}): Promise<Asset[]> {
    const response = await api.get<Asset[]>(`${ASSETS_API_PATH}/portfolio/${portfolioId}`, {
      params: query.sector
        ? {
            sector: query.sector,
          }
        : undefined,
    });

    return response.data;
  },

  async getChart(
    portfolioId: number,
    symbol: string,
    interval: ChartInterval = '1d',
  ): Promise<ChartDataPoint[]> {
    const response = await api.get<ChartDataPoint[]>(
      `${ASSETS_API_PATH}/portfolio/${portfolioId}/chart`,
      {
        params: {
          symbol: normalizeSymbol(symbol),
          interval,
        },
      },
    );

    return response.data;
  },

  async getMonthly(portfolioId: number, assetId: number): Promise<AssetMonthlyData[]> {
    const response = await api.get<AssetMonthlyData[]>(
      `${ASSETS_API_PATH}/portfolio/${portfolioId}/${assetId}/monthly`,
    );

    return response.data;
  },

  async getInvestorOverview(portfolioId: number): Promise<InvestorAssetOverview> {
    const response = await api.get<InvestorAssetOverview>(
      `${ASSETS_API_PATH}/portfolio/${portfolioId}/investor/overview`,
    );

    return response.data;
  },

  async getInvestorNews(portfolioId: number, symbol: string): Promise<AssetNewsItem[]> {
    const response = await api.get<AssetNewsItem[]>(
      `${ASSETS_API_PATH}/portfolio/${portfolioId}/investor/news/${encodeURIComponent(
        normalizeSymbol(symbol),
      )}`,
    );

    return response.data;
  },

  async getCorporateEvents(portfolioId: number, symbol: string): Promise<CorporateEvent[]> {
    const response = await api.get<CorporateEvent[]>(
      `${ASSETS_API_PATH}/portfolio/${portfolioId}/investor/events/${encodeURIComponent(
        normalizeSymbol(symbol),
      )}`,
    );

    return response.data;
  },

  async getTrendingStocks(portfolioId: number, sector?: string): Promise<TrendingStock[]> {
    const response = await api.get<TrendingStock[]>(
      `${ASSETS_API_PATH}/portfolio/${portfolioId}/investor/trending`,
      {
        params: sector ? { sector } : undefined,
      },
    );

    return response.data;
  },

  async getStockValuation(portfolioId: number, symbol: string): Promise<StockValuation> {
    const response = await api.get<StockValuation>(
      `${ASSETS_API_PATH}/portfolio/${portfolioId}/investor/valuation/${encodeURIComponent(
        normalizeSymbol(symbol),
      )}`,
    );

    return response.data;
  },
};

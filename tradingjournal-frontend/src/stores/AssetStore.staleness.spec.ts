/**
 * Asset Explorer QA follow-up: rapid symbol switching in Forex mode had no request-ordering
 * guard, so a slow chart-data response for a symbol the user already switched away from
 * could resolve later and silently overwrite the newer symbol's chartData/activeAsset view.
 * Mirrors the generation-counter pattern already used in TraderStore.initialize/reset.
 */
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { assetService } from '../services/asset.service';
import { useAssetStore } from './AssetStore';
import { usePortfolioStore } from './PortfolioStore';
import type { Asset, ChartDataPoint } from '../types/asset.types';
import type { Portfolio } from '../types/portfolio.types';

// mock ทั้งโมดูล ไม่ importActual — ไม่งั้นจะลากไปโหลด boot/axios ตัวจริง
vi.mock('../services/asset.service', () => ({
  assetService: {
    getForPortfolio: vi.fn(),
    getChart: vi.fn(),
    getMonthly: vi.fn(),
    getInvestorOverview: vi.fn(),
    getInvestorNews: vi.fn(),
    getCorporateEvents: vi.fn(),
    getTrendingStocks: vi.fn(),
    getStockValuation: vi.fn(),
  },
  getAssetErrorMessage: (error: unknown, fallback: string) => {
    const message = (error as { response?: { data?: { message?: string } } })?.response?.data
      ?.message;

    return message ?? fallback;
  },
}));

const service = vi.mocked(assetService);

function traderPortfolio(id: number): Portfolio {
  return {
    id,
    user_id: 1,
    name: `Portfolio ${id}`,
    initial_balance: 1000,
    current_balance: 1000,
    portfolio_type: 'TRADER',
    investor_cost_method: 'FIFO',
    currency: 'USD',
    icon: null,
    color: null,
    is_default: false,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };
}

function traderAsset(id: number, symbol: string): Asset {
  return {
    id,
    symbol,
    name: symbol,
    asset_type: 'FOREX',
    portfolio_type: 'TRADER',
    market_region: 'GLOBAL',
    sector: null,
    exchange: null,
    currency: 'USD',
    is_active: true,
  };
}

function point(close: number): ChartDataPoint {
  return { time: '2026-09-01', open: close, high: close, low: close, close, value: 0 };
}

describe('AssetStore.setActiveAsset — staleness guard on rapid symbol switching', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();

    const portfolioStore = usePortfolioStore();
    portfolioStore.portfolios = [traderPortfolio(1)];
    portfolioStore.activeType = 'TRADER';
    portfolioStore.activePortfolioIds.TRADER = 1;

    service.getMonthly.mockResolvedValue([]);
  });

  it('chart ของ symbol เก่าที่ตอบกลับช้า ต้องไม่ทับ chartData/activeAsset ของ symbol ใหม่ที่เพิ่งเลือก', async () => {
    const store = useAssetStore();
    const assetA = traderAsset(1, 'EUR/USD');
    const assetB = traderAsset(2, 'GBP/USD');

    const chartBData = [point(1.1)];
    let resolveA!: (data: ChartDataPoint[]) => void;
    const chartAPromise = new Promise<ChartDataPoint[]>((resolve) => {
      resolveA = resolve;
    });

    service.getChart.mockImplementation((_portfolioId, symbol) => {
      if (symbol === 'EUR/USD') return chartAPromise;
      return Promise.resolve(chartBData);
    });

    // ผู้ใช้กด A แล้วรีบกด B ก่อนที่ A จะโหลดเสร็จ (rapid symbol switching)
    const pendingA = store.setActiveAsset(assetA);
    await store.setActiveAsset(assetB);

    expect(store.activeAsset?.symbol).toBe('GBP/USD');
    expect(store.chartData).toEqual(chartBData);

    // A ตอบกลับช้า ๆ หลังจากผู้ใช้ดู B ไปแล้ว
    resolveA([point(999)]);
    await pendingA;

    expect(store.activeAsset?.symbol).toBe('GBP/USD');
    expect(store.chartData).toEqual(chartBData);
    expect(service.getMonthly).toHaveBeenCalledTimes(1);
    expect(service.getMonthly).toHaveBeenCalledWith(1, assetB.id);
  });
});

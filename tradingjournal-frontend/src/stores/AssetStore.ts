import { defineStore } from 'pinia';
import { ASSET_MESSAGES, DEFAULT_CHART_INTERVAL } from '../constants/asset.constants';
import { assetService, getAssetErrorMessage } from '../services/asset.service';
import { usePortfolioStore } from './PortfolioStore';
import type {
  Asset,
  AssetMonthlyData,
  AssetNewsItem,
  ChartDataPoint,
  ChartInterval,
  CorporateEvent,
  InvestorAssetOverview,
  StockValuation,
  TrendingStock,
} from '../types/asset.types';
export const useAssetStore = defineStore('asset', {
  state: () => ({
    assets: [] as Asset[],
    activeAsset: null as Asset | null,
    chartData: [] as ChartDataPoint[],
    monthlyData: [] as AssetMonthlyData[],
    investorOverview: null as InvestorAssetOverview | null,
    investorNews: [] as AssetNewsItem[],
    corporateEvents: [] as CorporateEvent[],
    trendingStocks: [] as TrendingStock[],
    valuation: null as StockValuation | null,
    loadedPortfolioId: null as number | null,
    selectedSector: null as string | null,
    selectedInterval: DEFAULT_CHART_INTERVAL,
    // เพิ่มทีละ 1 ทุกครั้งที่ setActiveAsset ถูกเรียก — ถ้า fetch ที่ค้างอยู่กลับมาตอน
    // generation เปลี่ยนไปแล้ว (ผู้ใช้สลับ symbol ไปแล้ว) ผลลัพธ์นั้นจะถูกทิ้ง ไม่ทับ state
    generation: 0,
    isLoading: false,
    isLoadingChart: false,
    isLoadingDetails: false,
    error: null as string | null,
  }),

  getters: {
    activePortfolioId(): number | null {
      return usePortfolioStore().activePortfolio?.id ?? null;
    },

    activePortfolioType(): 'TRADER' | 'INVESTOR' | null {
      return usePortfolioStore().activePortfolio?.portfolio_type ?? null;
    },

    traderAssets: (state) => state.assets.filter((asset) => asset.portfolio_type === 'TRADER'),

    investorAssets: (state) => state.assets.filter((asset) => asset.portfolio_type === 'INVESTOR'),

    sectors: (state) =>
      [
        ...new Set(
          state.assets
            .map((asset) => asset.sector)
            .filter((sector): sector is string => Boolean(sector)),
        ),
      ].sort(),
  },

  actions: {
    clearError() {
      this.error = null;
    },

    async fetchAssets(sector?: string) {
      const portfolioId = this.requirePortfolioId();

      this.isLoading = true;
      this.error = null;

      try {
        const assets = await assetService.getForPortfolio(
          portfolioId,
          sector !== undefined ? { sector } : {},
        );

        const previousSymbol = this.activeAsset?.symbol;

        this.assets = assets;
        this.loadedPortfolioId = portfolioId;
        this.selectedSector = sector ?? null;

        this.activeAsset =
          assets.find((asset) => asset.symbol === previousSymbol) ?? assets[0] ?? null;

        this.clearAssetDetails();

        return assets;
      } catch (error) {
        this.error = getAssetErrorMessage(error, ASSET_MESSAGES.loadFailed);
        this.assets = [];
        this.activeAsset = null;
        throw error;
      } finally {
        this.isLoading = false;
      }
    },

    async setActiveAsset(asset: Asset, interval?: ChartInterval) {
      interval ??= this.selectedInterval;
      if (asset.portfolio_type !== this.activePortfolioType) {
        return false;
      }

      const generation = ++this.generation;

      this.activeAsset = asset;
      this.selectedInterval = interval;

      await this.fetchChartData(asset.symbol, interval, generation);

      if (generation !== this.generation) {
        return false;
      }

      if (asset.portfolio_type === 'TRADER') {
        await this.fetchMonthlyData(asset.id, generation);
        if (generation !== this.generation) {
          return false;
        }
        this.clearInvestorDetails();
      } else {
        this.monthlyData = [];
        await Promise.all([
          this.fetchInvestorNews(asset.symbol, generation),
          this.fetchCorporateEvents(asset.symbol, generation),
          this.fetchStockValuation(asset.symbol, generation),
        ]);
      }

      return true;
    },

    async fetchChartData(
      symbol: string,
      interval: ChartInterval = DEFAULT_CHART_INTERVAL,
      generation?: number,
    ) {
      const portfolioId = this.requirePortfolioId();
      const isCurrent = () => generation === undefined || generation === this.generation;

      this.isLoadingChart = true;
      this.error = null;

      try {
        const data = await assetService.getChart(portfolioId, symbol, interval);

        if (isCurrent()) {
          this.chartData = data;
          this.selectedInterval = interval;
        }

        return data;
      } catch (error) {
        if (isCurrent()) {
          this.error = getAssetErrorMessage(error, ASSET_MESSAGES.chartFailed);
          this.chartData = [];
        }
        throw error;
      } finally {
        if (isCurrent()) {
          this.isLoadingChart = false;
        }
      }
    },

    async fetchMonthlyData(assetId: number, generation?: number) {
      if (this.activePortfolioType !== 'TRADER') {
        this.monthlyData = [];
        return [];
      }

      const portfolioId = this.requirePortfolioId();
      const isCurrent = () => generation === undefined || generation === this.generation;

      this.isLoadingDetails = true;
      this.error = null;

      try {
        const data = await assetService.getMonthly(portfolioId, assetId);

        if (isCurrent()) {
          this.monthlyData = data;
        }

        return data;
      } catch (error) {
        if (isCurrent()) {
          this.error = getAssetErrorMessage(error, ASSET_MESSAGES.monthlyFailed);
          this.monthlyData = [];
        }
        throw error;
      } finally {
        if (isCurrent()) {
          this.isLoadingDetails = false;
        }
      }
    },

    async fetchInvestorOverview() {
      this.requireInvestorPortfolio();

      const portfolioId = this.requirePortfolioId();

      this.isLoadingDetails = true;
      this.error = null;

      try {
        const overview = await assetService.getInvestorOverview(portfolioId);

        this.investorOverview = overview;

        return overview;
      } catch (error) {
        this.error = getAssetErrorMessage(error, ASSET_MESSAGES.investorOverviewFailed);
        throw error;
      } finally {
        this.isLoadingDetails = false;
      }
    },

    async fetchInvestorNews(symbol: string, generation?: number) {
      this.requireInvestorPortfolio();

      const portfolioId = this.requirePortfolioId();
      const isCurrent = () => generation === undefined || generation === this.generation;

      try {
        const items = await assetService.getInvestorNews(portfolioId, symbol);

        if (isCurrent()) {
          this.investorNews = items;
        }

        return items;
      } catch (error) {
        if (isCurrent()) {
          this.error = getAssetErrorMessage(error, ASSET_MESSAGES.newsFailed);
          this.investorNews = [];
        }
        throw error;
      }
    },

    async fetchCorporateEvents(symbol: string, generation?: number) {
      this.requireInvestorPortfolio();

      const portfolioId = this.requirePortfolioId();
      const isCurrent = () => generation === undefined || generation === this.generation;

      try {
        const items = await assetService.getCorporateEvents(portfolioId, symbol);

        if (isCurrent()) {
          this.corporateEvents = items;
        }

        return items;
      } catch (error) {
        if (isCurrent()) {
          this.error = getAssetErrorMessage(error, ASSET_MESSAGES.eventsFailed);
          this.corporateEvents = [];
        }
        throw error;
      }
    },

    async fetchTrendingStocks(sector?: string) {
      this.requireInvestorPortfolio();

      const portfolioId = this.requirePortfolioId();

      this.isLoadingDetails = true;
      this.error = null;

      try {
        const items = await assetService.getTrendingStocks(portfolioId, sector);

        this.trendingStocks = items;

        return items;
      } catch (error) {
        this.error = getAssetErrorMessage(error, ASSET_MESSAGES.trendingFailed);
        this.trendingStocks = [];
        throw error;
      } finally {
        this.isLoadingDetails = false;
      }
    },

    async fetchStockValuation(symbol: string, generation?: number) {
      this.requireInvestorPortfolio();

      const portfolioId = this.requirePortfolioId();
      const isCurrent = () => generation === undefined || generation === this.generation;

      try {
        const valuation = await assetService.getStockValuation(portfolioId, symbol);

        if (isCurrent()) {
          this.valuation = valuation;
        }

        return valuation;
      } catch (error) {
        if (isCurrent()) {
          this.error = getAssetErrorMessage(error, ASSET_MESSAGES.valuationFailed);
          this.valuation = null;
        }
        throw error;
      }
    },

    clearAssetDetails() {
      this.chartData = [];
      this.monthlyData = [];
      this.clearInvestorDetails();
    },

    clearInvestorDetails() {
      this.investorNews = [];
      this.corporateEvents = [];
      this.valuation = null;
    },

    clear() {
      this.assets = [];
      this.activeAsset = null;
      this.chartData = [];
      this.monthlyData = [];
      this.investorOverview = null;
      this.investorNews = [];
      this.corporateEvents = [];
      this.trendingStocks = [];
      this.valuation = null;
      this.loadedPortfolioId = null;
      this.selectedSector = null;
      this.selectedInterval = DEFAULT_CHART_INTERVAL;
      this.generation += 1;
      this.isLoading = false;
      this.isLoadingChart = false;
      this.isLoadingDetails = false;
      this.error = null;
    },

    requirePortfolioId(): number {
      const id = this.activePortfolioId;

      if (id === null) {
        throw new Error(ASSET_MESSAGES.portfolioRequired);
      }

      return id;
    },

    requireInvestorPortfolio() {
      if (this.activePortfolioType !== 'INVESTOR') {
        throw new Error('ฟังก์ชันนี้ใช้กับ Investor Portfolio เท่านั้น');
      }
    },
  },
});

import { defineStore } from 'pinia';
import {
  ANALYTICS_MESSAGES,
  DEFAULT_ANALYTICS_BENCHMARK,
  DEFAULT_ANALYTICS_TIMEFRAME,
} from '../constants/analytics.constants';
import {
  analyticsService,
  getAnalyticsErrorMessage,
  isAnalyticsPaidTierError,
} from '../services/analytics.service';
import { usePortfolioStore } from './PortfolioStore';
import type {
  AllocationItem,
  AnalyticsDateRange,
  AnalyticsOverview,
  AnalyticsPortfolioType,
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

export const useAnalyticsStore = defineStore('analytics', {
  state: () => ({
    portfolioId: null as number | null,
    portfolioType: null as AnalyticsPortfolioType | null,
    timeframe: DEFAULT_ANALYTICS_TIMEFRAME,
    dateRange: {} as AnalyticsDateRange,

    overview: null as AnalyticsOverview | null,
    performance: [] as PerformancePoint[],

    dailyPnl: {} as Record<string, number>,
    monthlyGrowth: [] as MonthlyGrowthPoint[],
    behavioral: null as BehavioralAnalytics | null,
    winRate: null as WinRateBreakdown | null,

    timeline: [] as PortfolioRecord[],
    allocation: [] as AllocationItem[],

    benchmark: null as ReturnVsBenchmarkResponse | null,
    timeWeightedReturn: null as TimeWeightedReturnResponse | null,
    heatmap: [] as HeatmapPoint[],
    performers: null as PerformersResponse | null,
    holdingPeriod: null as HoldingPeriodResponse | null,
    cashFlow: null as CashFlowResponse | null,
    dcaSimulation: null as DCASimulatorResponse | null,

    selectedBenchmark: DEFAULT_ANALYTICS_BENCHMARK,

    isLoading: false,
    isLoadingDetails: false,
    isLoadingAdvanced: false,
    isSimulatingDca: false,
    paidAccessDenied: false,
    /** behavioral โดน PaidTierGuard ปฏิเสธ — แยกจาก paidAccessDenied ที่เป็นของทั้งหน้า */
    behavioralAccessDenied: false,
    error: null as string | null,
  }),

  getters: {
    isTrader: (state) => state.portfolioType === 'TRADER',

    isInvestor: (state) => state.portfolioType === 'INVESTOR',

    summary: (state) => state.overview?.summary ?? null,

    holdings: (state) =>
      state.overview && 'holdings' in state.overview ? state.overview.holdings : [],

    recentActivity: (state) =>
      state.overview && 'recent_activity' in state.overview ? state.overview.recent_activity : [],

    chartData: (state) => ({
      categories: state.performance.map((point) => String(point.date)),
      series: [
        {
          // ฝั่ง INVESTOR ไม่ใช่ cash ledger แล้ว — backend คืน total equity
          // (เงินสด + มูลค่าตลาดของหุ้นที่ถืออยู่) ตั้งแต่แก้ investor-analytics.performance()
          name: state.portfolioType === 'TRADER' ? 'Equity' : 'Total equity',
          data: state.performance.map((point) => point.value),
        },
      ],
    }),
  },

  actions: {
    clearError() {
      this.error = null;
      this.paidAccessDenied = false;
    },

    async initialize(portfolioId?: number, portfolioType?: AnalyticsPortfolioType) {
      const portfolio =
        usePortfolioStore().portfolios.find((item) => item.id === portfolioId) ??
        usePortfolioStore().activePortfolio;

      const resolvedId = portfolioId ?? portfolio?.id ?? null;
      const resolvedType = portfolioType ?? portfolio?.portfolio_type ?? null;

      if (resolvedId === null || resolvedType === null) {
        throw new Error(ANALYTICS_MESSAGES.portfolioRequired);
      }

      if (this.portfolioId !== resolvedId || this.portfolioType !== resolvedType) {
        this.clearData();
      }

      this.portfolioId = resolvedId;
      this.portfolioType = resolvedType;

      return this.loadCore();
    },

    async loadCore(range?: AnalyticsDateRange) {
      range ??= this.dateRange;
      const portfolioId = this.requirePortfolioId();

      this.isLoading = true;
      this.error = null;
      this.paidAccessDenied = false;
      this.dateRange = {
        ...range,
      };

      try {
        const [overview, performance] = await Promise.all([
          analyticsService.getOverview(portfolioId, range),
          analyticsService.getPerformance(portfolioId, this.timeframe),
        ]);

        this.overview = overview;
        this.performance = performance;

        // Backend is the final authority.
        this.portfolioType = overview.portfolio.type;

        if (this.portfolioType === 'TRADER') {
          this.dailyPnl = await analyticsService.getDailyPnl(portfolioId, range);
          this.timeline = [];
          this.allocation = [];
        } else {
          this.timeline = await analyticsService.getTimeline(portfolioId, range);
          this.dailyPnl = {};
        }

        return {
          overview,
          performance,
        };
      } catch (error) {
        this.handleError(error, ANALYTICS_MESSAGES.loadFailed);
        throw error;
      } finally {
        this.isLoading = false;
      }
    },

    async loadDetails(range?: AnalyticsDateRange) {
      range ??= this.dateRange;
      const portfolioId = this.requirePortfolioId();

      this.isLoadingDetails = true;
      this.error = null;
      this.dateRange = {
        ...range,
      };

      try {
        if (this.portfolioType === 'TRADER') {
          // behavioral เป็นตัวเดียวในชุดนี้ที่ยัง gate ด้วย PaidTierGuard
          // ถ้าใช้ Promise.all แพ็กฟรีจะโดน 403 แล้วลาก monthlyGrowth/winRate
          // ที่เป็นของฟรีร่วงไปด้วย -> แท็บ Monthly Growth กับ Win Rate ว่างทั้งที่ควรเห็น
          const [monthlyGrowth, behavioral, winRate] = await Promise.allSettled([
            analyticsService.getMonthlyGrowth(portfolioId, range),
            analyticsService.getBehavioral(portfolioId, range),
            analyticsService.getWinRate(portfolioId, range),
          ]);

          const failure = [monthlyGrowth, winRate].find((item) => item.status === 'rejected');

          if (failure?.status === 'rejected') {
            throw failure.reason;
          }

          this.monthlyGrowth =
            monthlyGrowth.status === 'fulfilled' ? monthlyGrowth.value : [];
          this.winRate = winRate.status === 'fulfilled' ? winRate.value : null;

          if (behavioral.status === 'fulfilled') {
            this.behavioral = behavioral.value;
            this.behavioralAccessDenied = false;
          } else {
            this.behavioral = null;
            this.behavioralAccessDenied = isAnalyticsPaidTierError(behavioral.reason);

            if (!this.behavioralAccessDenied) {
              throw behavioral.reason;
            }
          }

          return {
            monthlyGrowth: this.monthlyGrowth,
            behavioral: this.behavioral,
            winRate: this.winRate,
          };
        }

        // แพทเทิร์นเดียวกับฝั่ง TRADER ข้างบน — แท็บ Allocation กับ Timeline เป็นคนละแท็บ
        // ตัวหนึ่งพังไม่ควรลบข้อมูลของอีกตัวที่โหลดสำเร็จแล้วทิ้ง
        const [timeline, allocation] = await Promise.allSettled([
          analyticsService.getTimeline(portfolioId, range),
          analyticsService.getAllocation(portfolioId),
        ]);

        this.timeline = timeline.status === 'fulfilled' ? timeline.value : [];
        this.allocation = allocation.status === 'fulfilled' ? allocation.value : [];

        const investorFailure = [timeline, allocation].find(
          (item) => item.status === 'rejected',
        );

        if (investorFailure?.status === 'rejected') {
          throw investorFailure.reason;
        }

        return {
          timeline: this.timeline,
          allocation: this.allocation,
        };
      } catch (error) {
        this.handleError(error, ANALYTICS_MESSAGES.detailsFailed);
        throw error;
      } finally {
        this.isLoadingDetails = false;
      }
    },

    async loadAdvanced(benchmark?: string) {
      benchmark ??= this.selectedBenchmark;
      const portfolioId = this.requirePortfolioId();

      this.isLoadingAdvanced = true;
      this.error = null;
      this.paidAccessDenied = false;
      this.selectedBenchmark = benchmark;

      try {
        const [benchmarkResult, twr, heatmap, performers, holdingPeriod, cashFlow] =
          await Promise.all([
            analyticsService.getReturnVsBenchmark(portfolioId, benchmark),
            analyticsService.getTimeWeightedReturn(portfolioId),
            analyticsService.getMonthlyHeatmap(portfolioId),
            analyticsService.getPerformers(portfolioId),
            analyticsService.getHoldingPeriod(portfolioId),
            analyticsService.getCashFlow(portfolioId),
          ]);

        this.benchmark = benchmarkResult;
        this.timeWeightedReturn = twr;
        this.heatmap = heatmap;
        this.performers = performers;
        this.holdingPeriod = holdingPeriod;
        this.cashFlow = cashFlow;

        return {
          benchmark: benchmarkResult,
          timeWeightedReturn: twr,
          heatmap,
          performers,
          holdingPeriod,
          cashFlow,
        };
      } catch (error) {
        this.handleError(error, ANALYTICS_MESSAGES.advancedFailed);
        throw error;
      } finally {
        this.isLoadingAdvanced = false;
      }
    },

    async simulateDca(payload: DCASimulatorRequest) {
      this.isSimulatingDca = true;
      this.error = null;

      try {
        const result = await analyticsService.simulateDca(payload);

        this.dcaSimulation = result;

        return result;
      } catch (error) {
        this.handleError(error, ANALYTICS_MESSAGES.dcaFailed);
        throw error;
      } finally {
        this.isSimulatingDca = false;
      }
    },

    async loadDailyPnl(
      portfolioId: number,
      from?: string,
      to?: string,
    ): Promise<Record<string, number>> {
      const range: AnalyticsDateRange = {
        ...(from !== undefined ? { from } : {}),
        ...(to !== undefined ? { to } : {}),
      };

      const result = await analyticsService.getDailyPnl(portfolioId, range);
      this.dailyPnl = result;
      return result;
    },

    async setTimeframe(timeframe: AnalyticsTimeframe) {
      this.timeframe = timeframe;

      if (this.portfolioId === null) {
        return [];
      }

      try {
        const performance = await analyticsService.getPerformance(this.portfolioId, timeframe);

        this.performance = performance;

        return performance;
      } catch (error) {
        this.handleError(error, ANALYTICS_MESSAGES.loadFailed);
        throw error;
      }
    },

    setDateRange(range: AnalyticsDateRange) {
      this.dateRange = {
        ...range,
      };
    },

    handleError(error: unknown, fallback: string) {
      const paidError = isAnalyticsPaidTierError(error);

      this.paidAccessDenied = paidError;
      this.error = paidError
        ? ANALYTICS_MESSAGES.paidTierRequired
        : getAnalyticsErrorMessage(error, fallback);
    },

    requirePortfolioId(): number {
      if (this.portfolioId === null) {
        throw new Error(ANALYTICS_MESSAGES.portfolioRequired);
      }

      return this.portfolioId;
    },

    clearCore() {
      this.overview = null;
      this.performance = [];
      this.dailyPnl = {};
      this.timeline = [];
    },

    clearDetails() {
      this.monthlyGrowth = [];
      this.behavioral = null;
      this.behavioralAccessDenied = false;
      this.winRate = null;
      this.allocation = [];
    },

    clearAdvanced() {
      this.benchmark = null;
      this.timeWeightedReturn = null;
      this.heatmap = [];
      this.performers = null;
      this.holdingPeriod = null;
      this.cashFlow = null;
      this.dcaSimulation = null;
    },

    clearData() {
      this.clearCore();
      this.clearDetails();
      this.clearAdvanced();
      this.error = null;
      this.paidAccessDenied = false;
    },

    clear() {
      this.portfolioId = null;
      this.portfolioType = null;
      this.timeframe = DEFAULT_ANALYTICS_TIMEFRAME;
      this.dateRange = {};
      this.selectedBenchmark = DEFAULT_ANALYTICS_BENCHMARK;
      this.clearData();
    },
  },
});

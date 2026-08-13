import { defineStore } from 'pinia';
import { GOAL_MESSAGES, GOAL_MONTH_NAMES } from '../constants/goal.constants';
import { getGoalErrorMessage, goalService } from '../services/goal.service';
import { useAnalyticsStore } from './AnalyticsStore';
import { usePortfolioStore } from './PortfolioStore';
import type { DailyPlanItem, MonthlyGoalPlan } from '../types/goal.types';

function currentPlan(): MonthlyGoalPlan {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth() + 1;

  return {
    portfolioId: null,
    portfolioType: null,
    year,
    month,
    monthName: GOAL_MONTH_NAMES[month - 1] ?? '',
    targetProfit: 0,
    totalAchieved: 0,
    progressPercent: 0,
    remainingTarget: 0,
    dailyTarget: 0,
    dailyPlan: [],
  };
}

export const useGoalStore = defineStore('goal', {
  state: () => ({
    monthlyPlan: currentPlan(),
    dailyPnl: {} as Record<string, number>,
    isLoading: false,
    isSubmitting: false,
    error: null as string | null,
  }),

  getters: {
    activePortfolioId(): number | null {
      return usePortfolioStore().activePortfolio?.id ?? null;
    },

    activePortfolioType(): 'TRADER' | 'INVESTOR' | null {
      return usePortfolioStore().activePortfolio?.portfolio_type ?? null;
    },

    isGoalReached: (state) =>
      state.monthlyPlan.targetProfit > 0 &&
      state.monthlyPlan.totalAchieved >= state.monthlyPlan.targetProfit,

    hasGoal: (state) => state.monthlyPlan.targetProfit > 0,
  },

  actions: {
    clearError() {
      this.error = null;
    },

    async initialize(year?: number, month?: number) {
      const portfolioId = this.requirePortfolioId();

      const now = new Date();
      const targetYear = year ?? now.getFullYear();
      const targetMonth = month ?? now.getMonth() + 1;

      return this.loadGoalByMonth(portfolioId, targetYear, targetMonth);
    },

    async loadGoalByMonth(portfolioId: number, year: number, month: number) {
      this.isLoading = true;
      this.error = null;

      try {
        const targetProfit = await goalService.getMonthlyTarget(portfolioId, year, month);

        this.monthlyPlan = {
          ...this.monthlyPlan,
          portfolioId,
          portfolioType: this.resolvePortfolioType(portfolioId),
          year,
          month,
          monthName: GOAL_MONTH_NAMES[month - 1] ?? '',
          targetProfit,
        };

        const dailyPnl = await this.resolveDailyPnl(portfolioId, year, month);

        this.dailyPnl = dailyPnl;

        this.rebuildMonthlyPlan(year, month, targetProfit, dailyPnl);

        return this.monthlyPlan;
      } catch (error) {
        this.error = getGoalErrorMessage(error, GOAL_MESSAGES.loadFailed);
        throw error;
      } finally {
        this.isLoading = false;
      }
    },

    async setTargetPnL(portfolioId: number, year: number, month: number, target: number) {
      this.isSubmitting = true;
      this.error = null;

      try {
        await goalService.setMonthlyTarget(portfolioId, {
          year,
          month,
          target: Number(target),
        });

        return await this.loadGoalByMonth(portfolioId, year, month);
      } catch (error) {
        this.error = getGoalErrorMessage(error, GOAL_MESSAGES.saveFailed);
        throw error;
      } finally {
        this.isSubmitting = false;
      }
    },

    async setActivePortfolioGoal(year: number, month: number, target: number) {
      const portfolioId = this.requirePortfolioId();

      return this.setTargetPnL(portfolioId, year, month, target);
    },

    async resolveDailyPnl(
      portfolioId: number,
      year: number,
      month: number,
    ): Promise<Record<string, number>> {
      const type = this.resolvePortfolioType(portfolioId);

      if (type !== 'TRADER') {
        return {};
      }

      const analyticsStore = useAnalyticsStore();

      const from = new Date(year, month - 1, 1, 0, 0, 0, 0).toISOString();

      const to = new Date(year, month, 0, 23, 59, 59, 999).toISOString();

      const dailyPnl = await analyticsStore.loadDailyPnl(portfolioId, from, to);

      return dailyPnl;
    },

    rebuildMonthlyPlan(
      year: number,
      month: number,
      target: number,
      actualDailyPnl: Record<string, number>,
    ) {
      const daysInMonth = new Date(year, month, 0).getDate();

      const dailyTarget = target > 0 ? target / daysInMonth : 0;

      let totalAchieved = 0;

      const plan: DailyPlanItem[] = [];

      const today = new Date();
      const currentYear = today.getFullYear();
      const currentMonth = today.getMonth() + 1;
      const currentDay = today.getDate();

      for (let day = 1; day <= daysInMonth; day += 1) {
        const dateKey = [year, String(month).padStart(2, '0'), String(day).padStart(2, '0')].join(
          '-',
        );

        const actual = Number(actualDailyPnl[dateKey] ?? 0);

        totalAchieved += actual;

        const isFuture =
          year > currentYear ||
          (year === currentYear && month > currentMonth) ||
          (year === currentYear && month === currentMonth && day > currentDay);

        const status = isFuture ? 'pending' : actual >= dailyTarget ? 'success' : 'missed';

        plan.push({
          day,
          dateKey,
          dateLabel: `${String(day).padStart(2, '0')} ${GOAL_MONTH_NAMES[month - 1] ?? ''}`,
          target: dailyTarget,
          actual,
          variance: actual - dailyTarget,
          status,
          isFuture,
        });
      }

      this.monthlyPlan = {
        ...this.monthlyPlan,
        year,
        month,
        monthName: GOAL_MONTH_NAMES[month - 1] ?? '',
        targetProfit: target,
        totalAchieved,
        progressPercent:
          target > 0 ? Math.min(100, Math.max(0, (totalAchieved / target) * 100)) : 0,
        remainingTarget: Math.max(0, target - totalAchieved),
        dailyTarget,
        dailyPlan: plan,
      };
    },

    resolvePortfolioType(portfolioId: number) {
      const portfolioStore = usePortfolioStore();

      return (
        portfolioStore.portfolios.find((portfolio) => portfolio.id === portfolioId)
          ?.portfolio_type ?? null
      );
    },

    requirePortfolioId(): number {
      const id = this.activePortfolioId;

      if (id === null) {
        throw new Error(GOAL_MESSAGES.portfolioRequired);
      }

      return id;
    },

    clear() {
      this.monthlyPlan = currentPlan();
      this.dailyPnl = {};
      this.isLoading = false;
      this.isSubmitting = false;
      this.error = null;
    },
  },
});

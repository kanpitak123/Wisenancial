import type { PortfolioType } from './portfolio.types';

export type GoalDayStatus = 'success' | 'missed' | 'pending';

export interface DailyPlanItem {
  day: number;
  dateKey: string;
  dateLabel: string;
  target: number;
  actual: number;
  variance: number;
  status: GoalDayStatus;
  isFuture: boolean;
}

export interface MonthlyGoalPlan {
  portfolioId: number | null;
  portfolioType: PortfolioType | null;
  year: number;
  month: number;
  monthName: string;
  targetProfit: number;
  totalAchieved: number;
  progressPercent: number;
  remainingTarget: number;
  dailyTarget: number;
  dailyPlan: DailyPlanItem[];
}

export interface SetGoalPayload {
  year: number;
  month: number;
  target: number;
}

export interface GoalRecord {
  id: number;
  portfolio_id: number;
  year: number;
  month: number;
  target_profit: string | number;
}

export interface GoalProgressInput {
  dailyPnl: Record<string, number>;
}

export interface ApiErrorResponse {
  message?: string | string[];
}

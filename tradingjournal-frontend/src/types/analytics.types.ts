import type { PortfolioType } from './portfolio.types';
import type { PortfolioRecord } from './records.types';

export type AnalyticsPortfolioType = PortfolioType;

export type AnalyticsTimeframe = '1W' | '1M' | '3M' | '6M' | '9M' | '1Y' | 'ALL';

export interface AnalyticsDateRange {
  from?: string;
  to?: string;
}

export interface AnalyticsPortfolioInfo {
  id: number;
  name: string;
  type: AnalyticsPortfolioType;
  currency: string | null;
}

export interface TraderAnalyticsSummary {
  current_value: number;
  initial_balance: number;
  total_pnl: number;
  total_pnl_percent: number;
  realized_pnl: number;
  unrealized_pnl: number;
  total_trades: number;
  wins: number;
  losses: number;
  breakeven: number;
  win_rate: number;
  profit_factor: number | null;
  average_pnl: number;
}

export interface InvestorAnalyticsSummary {
  current_value: number;
  cash: number;
  invested_cost: number;
  holdings_value: number;
  realized_pnl: number;
  unrealized_pnl: number;
  dividend_income: number;
  total_pnl: number;
  total_pnl_percent: number;
  contributed_capital: number;
  investment_gain: number;
  open_holdings: number;
  closed_sales: number;
}

export interface InvestorAnalyticsHolding {
  symbol: string;
  shares?: number;
  quantity?: number;
  average_cost: number;
  cost_basis: number;
  market_price: number | null;
  market_value: number | null;
  unrealized_pnl: number | null;
  unrealized_percent?: number | null;
}

export interface TraderAnalyticsOverview {
  portfolio: AnalyticsPortfolioInfo & {
    type: 'TRADER';
  };
  summary: TraderAnalyticsSummary;
}

export interface InvestorAnalyticsOverview {
  portfolio: AnalyticsPortfolioInfo & {
    type: 'INVESTOR';
  };
  summary: InvestorAnalyticsSummary;
  holdings: InvestorAnalyticsHolding[];
  recent_activity: PortfolioRecord[];
}

export type AnalyticsOverview = TraderAnalyticsOverview | InvestorAnalyticsOverview;

export interface PerformancePoint {
  date: string;
  value: number;
  event?: string;
  amount?: number;
}

export interface MonthlyGrowthPoint {
  month: string;
  label: string;
  pnl: number;
  cumulative_pnl: number;
  growth_pct: number;
  trade_count: number;
  win_count: number;
  loss_count: number;
}

export interface PerformanceStat {
  label: string;
  win_count: number;
  loss_count: number;
  total_pnl: number;
  avg_pnl: number;
  win_rate: number;
}

export interface BehavioralAnalytics {
  strategy: PerformanceStat[];
  emotion: PerformanceStat[];
  trend: PerformanceStat[];
  entry_reason: PerformanceStat[];
  time_slot: PerformanceStat[];
}

export interface WinRateItem {
  win: number;
  loss: number;
  win_rate: number;
  position?: string;
  slot?: string;
  day?: string;
  month?: string;
}

export interface PnlBreakdownItem {
  profit: number;
  loss: number;
  net: number;
  total_pnl: number;
  trade_count: number;
  slot?: string;
  day?: string;
  month?: string;
}

export interface WinRateBreakdown {
  by_position: WinRateItem[];
  by_slot: WinRateItem[];
  by_day: WinRateItem[];
  by_month: WinRateItem[];
  pnl_by_slot: PnlBreakdownItem[];
  pnl_by_day: PnlBreakdownItem[];
  pnl_by_month: PnlBreakdownItem[];
}

export interface AllocationItem {
  symbol: string;
  value: number;
  weight: number;
}

export interface BenchmarkPoint {
  date: string;
  value: number;
  return: number;
}

export interface ReturnVsBenchmarkResponse {
  portfolio: BenchmarkPoint[];
  benchmark: BenchmarkPoint[];
  outperformance: number;
  benchmarkSymbol: string;
}

export interface TimeWeightedReturnResponse {
  timeWeightedReturn: number;
  totalReturn: number;
  note: string;
}

export interface HeatmapPoint {
  month: string;
  pnl: number;
  percentage: 'positive' | 'negative' | 'neutral';
}

export interface PerformerItem {
  symbol: string;
  pnl: number;
  returnPercent: number;
  closedAt: string | null;
}

export interface PerformersResponse {
  best: PerformerItem[];
  worst: PerformerItem[];
}

export interface HoldingPeriodResponse {
  averageDays: number;
  totalHoldings: number;
}

export interface CashFlowPoint {
  month: string;
  cashFlow: number;
  dividendIncome: number;
}

export interface CashFlowResponse {
  monthlyCashFlow: CashFlowPoint[];
  totalDividendIncome: number;
  passiveIncomeGrowth: number;
}

export interface DCASimulatorRequest {
  symbol: string;
  monthlyAmount: number;
  durationYears: number;
}

export interface DCAScenario {
  scenario: 'Low Growth' | 'Medium Growth' | 'High Growth';
  totalInvested: number;
  finalValue: number;
  totalReturn: number;
  annualizedReturn: number;
  reasoning: string;
  confidence: number;
}

export interface DCASimulatorResponse {
  symbol: string;
  monthlyAmount: number;
  durationYears: number;
  scenarios: DCAScenario[];
  analysis: {
    historicalContext: string;
    riskFactors: string[];
    recommendations: string[];
  };
}

export interface AnalyticsChartData {
  categories: string[];
  series: Array<{
    name: string;
    data: number[];
  }>;
}

export interface AnalyticsApiError {
  message?: string | string[];
}

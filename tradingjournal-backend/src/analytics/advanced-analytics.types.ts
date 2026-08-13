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
  closedAt: Date | null;
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

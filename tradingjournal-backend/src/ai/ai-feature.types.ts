export interface StockRecommendation {
  symbol: string;
  name: string;
  sector: string;
  reasoning: {
    growth: string;
    profit: string;
    customerBase: string;
    liquidity: string;
  };
  aiSummary: string;
}

export interface PortfolioRiskHolding {
  symbol: string;
  quantity: number;
  weight?: number;
  beta?: number | null;
  debtToEquity?: number | null;
  peRatio?: number | null;
  currentPrice?: number;
}

export interface PortfolioRiskAnalysis {
  riskLevel: 'Low' | 'Moderate' | 'Aggressive';
  riskScore: number;
  analysisSummary: string;
  keyRiskFactors: string[];
}

export interface QuizQuestion {
  question: string;
  options: string[];
  correctAnswer: number;
  explanation: string;
}

export interface QuizResponse {
  questions: QuizQuestion[];
}

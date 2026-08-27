export interface StockRecommendation {
  /**
   * symbol/name/sector/asOf/metrics มาจาก candidate list ฝั่งเซิร์ฟเวอร์เสมอ
   * ไม่ได้เอาตามที่โมเดลตอบ — โมเดลมีสิทธิ์แต่ง reasoning กับ aiSummary เท่านั้น
   * (ดู AiRecommendationService.reconcile)
   */
  symbol: string;
  name: string;
  sector: string;
  /** ไตรมาสล่าสุดที่ตัวเลขใน metrics ครอบคลุม (null = Yahoo ไม่ได้ระบุ) */
  asOf: string | null;
  metrics: {
    /** สัดส่วน ไม่ใช่เปอร์เซ็นต์ (0.32 = +32%) */
    revenueGrowthYoY: number | null;
    /** สัดส่วน ไม่ใช่เปอร์เซ็นต์ (0.18 = 18%) */
    netMargin: number | null;
    peRatio: number | null;
    currentPrice: number;
    avgDailyVolume3M: number | null;
  };
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

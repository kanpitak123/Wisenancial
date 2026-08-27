export type AiPortfolioType = 'TRADER' | 'INVESTOR';

/**
 * ภาษาที่ขอให้ AI ตอบกลับ — ส่งมาจาก LanguageStore ตัวเดียวกับที่ตั้งภาษา UI
 *
 * optional เพราะฝั่ง backend resolve เป็น 'th' ให้เองถ้าไม่ส่ง แต่ทุก action
 * ใน AiStore ส่งมาให้เสมอ เพื่อให้ผลลัพธ์ตรงกับภาษาที่ผู้ใช้เห็นอยู่จริง
 */
export type AiOutputLanguage = 'th' | 'en';

export type AiModelId = string;

export interface AiModel {
  id: AiModelId;
  label: string;
  creditsPer1kInput: number;
  creditsPer1kOutput: number;
}

export interface AiModelsResponse {
  models: AiModel[];
  minBalance: number;
}

export interface AiCreditsResponse {
  balance: number;
  minBalance: number;
}

export interface AnalyzeChartPayload {
  portfolioId?: number;
  portfolioType: AiPortfolioType;
  chartType: string;
  data: unknown;
  extraContext?: Record<string, unknown>;
  modelId?: string;
  useRuleBased?: boolean;
  outputLanguage?: AiOutputLanguage;
}

export interface ChartInsight {
  insight: string;
  source: 'RULE_BASED' | 'LLM';
  model?: string;
  creditsCharged?: number;
  creditsRemaining?: number;
}

export interface TraderReviewResult {
  summary: string;
  strengths: string[];
  weaknesses: string[];
  riskWarnings: string[];
  actionableRecommendations: string[];
  disciplineScore: number;
}

export interface InvestorReviewResult {
  summary: string;
  diversificationScore: number;
  riskProfile: 'CONSERVATIVE' | 'MODERATE' | 'AGGRESSIVE';
  concentrationRisks: string[];
  strengths: string[];
  actionableRecommendations: string[];
}

interface BasePortfolioReviewResponse {
  model: string;
  creditsCharged: number;
  creditsRemaining: number;
}

export interface TraderPortfolioReviewResponse extends BasePortfolioReviewResponse {
  portfolioType: 'TRADER';
  data: TraderReviewResult;
}

export interface InvestorPortfolioReviewResponse extends BasePortfolioReviewResponse {
  portfolioType: 'INVESTOR';
  data: InvestorReviewResult;
}

export type PortfolioReviewResponse =
  | TraderPortfolioReviewResponse
  | InvestorPortfolioReviewResponse;

export interface ReviewPortfolioPayload {
  modelId: string;
  items?: unknown[];
  analytics?: Record<string, unknown>;
  outputLanguage?: AiOutputLanguage;
}

export interface StockRecommendation {
  /**
   * symbol/name/sector/asOf/metrics มาจาก candidate list ฝั่ง backend ไม่ใช่จาก
   * คำตอบของโมเดล (backend เขียนทับให้แล้ว) — เชื่อถือเป็นตัวเลขจริงได้
   */
  symbol: string;
  name: string;
  sector: string;
  /** ไตรมาสล่าสุดที่ตัวเลขใน metrics ครอบคลุม (null = ไม่มีข้อมูล) */
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

export interface AiActionResponse<T> {
  data: T;
  model: string;
  creditsCharged: number;
  creditsRemaining: number;
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

export interface RiskAnalysisResponse extends AiActionResponse<PortfolioRiskAnalysis> {
  holdingsData: PortfolioRiskHolding[];
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

export interface GenerateQuizPayload {
  lessonTitle: string;
  lessonDescription: string;
  outputLanguage?: AiOutputLanguage;
}

export interface ApiErrorResponse {
  message?: string | string[];
  error?: string;
}

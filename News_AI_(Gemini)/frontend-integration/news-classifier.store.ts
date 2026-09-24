import { defineStore } from 'pinia';
import axios from 'axios';

export type Sentiment = 'BULLISH' | 'BEARISH' | 'NEUTRAL';
export type Importance = 'HIGH' | 'MEDIUM' | 'LOW';
export type MarketStance = 'BULLISH' | 'BEARISH' | 'MIXED' | 'NEUTRAL';
export type AssetClass = 'EQUITIES' | 'FIXED_INCOME' | 'FOREX' | 'COMMODITIES' | 'CRYPTO' | 'GENERAL';

export interface ImpactDetail {
  target: string;
  asset_class: AssetClass;
  mechanism: string;
  timeframe: 'SHORT_TERM' | 'MEDIUM_TERM';
}

export interface DualImpactAnalysis {
  positive_impacts: ImpactDetail[];
  negative_impacts: ImpactDetail[];
}

export interface ReasoningSteps {
  key_facts: string[];
  transmission_mechanism: string;
  counter_perspective: string;
}

export interface V5AnalysisResult {
  article_id: string;
  news_category: string;
  importance: Importance;
  market_stance: MarketStance;
  confidence: number;
  review_required: boolean;
  reasoning_steps: ReasoningSteps;
  dual_impact_analysis: DualImpactAnalysis;
  uncertainties: string[];
  neutrality_score: number;
  compliance_disclaimer: string;
  compliance_flags: string[];
  model: string;
  prompt_version: string;
  cached?: boolean;
}

export interface ClassifyResult {
  article_id: string;
  sentiment: Sentiment;
  importance: Importance;
  confidence: number;
  review_required: boolean;
  model: string;
  prompt_version: string;
  cached?: boolean;
  dual_impact?: DualImpactAnalysis;
  reasoning?: ReasoningSteps;
}

export interface NewsClassifierState {
  loading: boolean;
  error: string | null;
  history: Record<string, ClassifyResult>;
  v5History: Record<string, V5AnalysisResult>;
}

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export const useNewsClassifierStore = defineStore('newsClassifier', {
  state: (): NewsClassifierState => ({
    loading: false,
    error: null,
    history: {},
    v5History: {},
  }),

  getters: {
    getResultById: (state) => (id: string): ClassifyResult | undefined => {
      return state.history[id];
    },
    getV5ResultById: (state) => (id: string): V5AnalysisResult | undefined => {
      return state.v5History[id];
    },
  },

  actions: {
    /**
     * V.5 Primary: Analyze article with dual-sided impact and strict neutrality
     */
    async analyzeNewsV5(payload: { title: string; description?: string; article_id?: string }): Promise<V5AnalysisResult> {
      this.loading = true;
      this.error = null;
      try {
        const response = await axios.post<V5AnalysisResult>(
          `${API_BASE_URL}/ai/news/v5/analyze`,
          payload,
          {
            headers: { 'Content-Type': 'application/json' },
            timeout: 45000,
          }
        );

        const result = response.data;
        if (result.article_id) {
          this.v5History[result.article_id] = result;
          // Synchronize to V.4 history cache for backward compatibility
          const stance = result.market_stance;
          const sentiment: Sentiment =
            stance === 'BULLISH' || stance === 'BEARISH' || stance === 'NEUTRAL' ? stance : 'NEUTRAL';
          this.history[result.article_id] = {
            article_id: result.article_id,
            sentiment,
            importance: result.importance,
            confidence: result.confidence,
            review_required: result.review_required,
            model: result.model,
            prompt_version: result.prompt_version,
            cached: result.cached,
            dual_impact: result.dual_impact_analysis,
            reasoning: result.reasoning_steps,
          };
        }
        return result;
      } catch (err: any) {
        const message = err.response?.data?.message || err.message || 'Failed to analyze news article';
        this.error = message;
        throw new Error(message);
      } finally {
        this.loading = false;
      }
    },

    /**
     * V.4 Compatibility: Classify news
     */
    async classifyNews(payload: { title: string; description?: string; article_id?: string }): Promise<ClassifyResult> {
      this.loading = true;
      this.error = null;
      try {
        const response = await axios.post<ClassifyResult>(
          `${API_BASE_URL}/ai/news/classify`,
          payload,
          {
            headers: { 'Content-Type': 'application/json' },
            timeout: 35000,
          }
        );

        const result = response.data;
        if (result.article_id) {
          this.history[result.article_id] = result;
        }
        return result;
      } catch (err: any) {
        const message = err.response?.data?.message || err.message || 'Failed to classify news article';
        this.error = message;
        throw new Error(message);
      } finally {
        this.loading = false;
      }
    },

    /**
     * Batch classify multiple articles
     */
    async classifyBatch(articles: Array<{ title: string; description?: string; article_id?: string }>) {
      this.loading = true;
      this.error = null;
      try {
        const response = await axios.post(
          `${API_BASE_URL}/ai/news/classify-batch`,
          { articles },
          { timeout: 60000 }
        );
        const { results } = response.data;
        for (const res of results) {
          if (res.article_id) {
            this.history[res.article_id] = res;
          }
        }
        return response.data;
      } catch (err: any) {
        this.error = err.response?.data?.message || err.message || 'Batch classification failed';
        throw err;
      } finally {
        this.loading = false;
      }
    },
  },
});

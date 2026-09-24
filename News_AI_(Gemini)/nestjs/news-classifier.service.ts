import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import {
  Sentiment,
  Importance,
  FewShotExample,
  ClassifyNewsPayload,
  ClassifyNewsResult,
  BatchClassifyNewsResult,
  V5AnalyzeNewsResult,
  BatchV5AnalyzeNewsResult,
  NewsCategory,
  MarketStance,
  AssetClass,
  Timeframe,
} from './interfaces/news-classifier.interface';

const SENTIMENTS: Sentiment[] = ['BULLISH', 'BEARISH', 'NEUTRAL'];
const IMPORTANCE: Importance[] = ['HIGH', 'MEDIUM', 'LOW'];
const CATEGORIES: NewsCategory[] = [
  'MACROECONOMIC',
  'CENTRAL_BANK',
  'CORPORATE_EARNINGS',
  'GEOPOLITICAL_COMMODITIES',
  'REGULATORY_LEGAL',
  'GENERAL_FINANCIAL',
];
const MARKET_STANCES: MarketStance[] = ['BULLISH', 'BEARISH', 'MIXED', 'NEUTRAL'];
const ASSET_CLASSES: AssetClass[] = ['EQUITIES', 'FIXED_INCOME', 'FOREX', 'COMMODITIES', 'CRYPTO', 'GENERAL'];
const TIMEFRAMES: Timeframe[] = ['SHORT_TERM', 'MEDIUM_TERM'];

const PROMPT_VERSION_V5 = 'financial-news-dual-impact-v5';

const FORBIDDEN_ADVISORY_PATTERNS = [
  /\b(should|must|ought to)\s+(buy|sell|purchase|short|accumulate|dump)\b/i,
  /\b(strong|definite)\s+(buy|sell)\b/i,
  /\b(guaranteed\s+(return|returns|profit|profits|upside|gain|gains)|(return|returns|profit|profits|upside|gain|gains)\s+(is|are)?\s*guaranteed)\b/i,
  /\btarget\s+price\s+of\s+[\$0-9]/i,
  /\ball-in\b/i,
  /\bcannot\s+lose\b/i,
  /ควรซื้อ/i,
  /น่าเก็งกำไร/i,
  /ควรรีบขาย/i,
  /น่าทยอยสะสม/i,
  /เป้าหมายราคาที่/i,
  /ฟันธงว่าขึ้น/i,
  /ฟันธงว่าลง/i,
  /ตกรถ/i,
  /ดอยแน่นอน/i,
];

interface CacheEntryV5 {
  result: V5AnalyzeNewsResult;
  expiresAt: number;
}

@Injectable()
export class NewsClassifierService {
  private readonly logger = new Logger(NewsClassifierService.name);
  private readonly apiKey: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly confidenceThreshold: number;
  private readonly neutralityThreshold: number;
  private readonly cacheTtlMs: number;
  private readonly examplesV5: any[];
  private readonly cacheV5 = new Map<string, CacheEntryV5>();

  constructor() {
    this.apiKey = (process.env.GEMINI_API_KEY || '').trim();
    this.model = (process.env.GEMINI_MODEL || 'gemini-flash-lite-latest').trim();
    this.timeoutMs = parseInt(process.env.GEMINI_TIMEOUT_MS || '35000', 10);
    this.maxRetries = parseInt(process.env.GEMINI_MAX_RETRIES || '3', 10);
    this.confidenceThreshold = parseFloat(process.env.CLASSIFIER_CONFIDENCE_THRESHOLD || '0.80');
    this.neutralityThreshold = parseFloat(process.env.AGENT_NEUTRALITY_THRESHOLD || '0.85');
    this.cacheTtlMs = parseInt(process.env.CLASSIFIER_CACHE_TTL_SECONDS || '86400', 10) * 1000;

    this.examplesV5 = this.loadExamplesV5();
    if (!this.apiKey) {
      this.logger.warn('GEMINI_API_KEY is not set. AI News analysis requests will fail.');
    }
  }

  private loadExamplesV5(): any[] {
    const candidatePaths = [
      path.join(__dirname, 'fewshot_examples_v5.json'),
      path.join(process.cwd(), 'fewshot_examples_v5.json'),
      path.join(__dirname, '..', 'fewshot_examples_v5.json'),
      path.join(__dirname, 'fewshot_examples.json'),
      path.join(__dirname, '..', '..', 'Model Store', 'V.5', 'fewshot_examples.json'),
    ];

    for (const filePath of candidatePaths) {
      if (fs.existsSync(filePath)) {
        try {
          const raw = fs.readFileSync(filePath, 'utf-8');
          const data = JSON.parse(raw);
          if (Array.isArray(data) && data.length > 0) {
            this.logger.log(`Loaded ${data.length} few-shot examples from ${filePath}`);
            return data;
          }
        } catch (err: any) {
          this.logger.error(`Failed to parse examples at ${filePath}: ${err.message}`);
        }
      }
    }
    this.logger.error('No few-shot examples found in candidate paths!');
    return [];
  }

  public healthCheck() {
    return {
      status: this.apiKey ? 'ready' : 'missing_api_key',
      version: 'V.5',
      prompt_version: PROMPT_VERSION_V5,
      model: this.model,
      examples_count: this.examplesV5.length,
      cached_entries: this.cacheV5.size,
      confidence_threshold: this.confidenceThreshold,
      neutrality_threshold: this.neutralityThreshold,
    };
  }

  /**
   * V.5 Primary: Analyze article with dual-impact and strict neutrality guardrails.
   */
  public async analyzeV5(payload: ClassifyNewsPayload): Promise<V5AnalyzeNewsResult> {
    if (!this.apiKey) {
      throw new HttpException('GEMINI_API_KEY is not configured on the server', HttpStatus.SERVICE_UNAVAILABLE);
    }

    const title = this.compact(payload.title, 1200);
    const description = this.compact(payload.description || '', 2000);

    if (!title && !description) {
      throw new HttpException('Title or description is required for analysis', HttpStatus.BAD_REQUEST);
    }

    const articleId = payload.article_id || this.generateArticleId(title, description);

    // 1. Deduplication cache check
    if (this.cacheTtlMs > 0) {
      const cacheKey = this.generateArticleId(title, description);
      const cached = this.cacheV5.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        return {
          ...cached.result,
          article_id: articleId,
          cached: true,
        };
      }
    }

    // 2. Build prompt and JSON schema
    const prompt = this.buildPromptV5(articleId, title, description);
    const schema = this.getSchemaV5();

    const requestBody = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseJsonSchema: schema,
        temperature: 0.1,
        maxOutputTokens: 1000,
      },
    };

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      this.model,
    )}:generateContent?key=${encodeURIComponent(this.apiKey)}`;

    // 3. Call Gemini with retry
    const responseData = await this.callGeminiWithRetry(url, requestBody);

    // 4. Parse & validate V.5 response
    const result = this.parseAndValidateV5(responseData, articleId);

    // 5. Cache result
    if (this.cacheTtlMs > 0) {
      const cacheKey = this.generateArticleId(title, description);
      this.cacheV5.set(cacheKey, {
        result,
        expiresAt: Date.now() + this.cacheTtlMs,
      });

      if (this.cacheV5.size > 5000) {
        const firstKey = this.cacheV5.keys().next().value;
        if (firstKey) this.cacheV5.delete(firstKey);
      }
    }

    return result;
  }

  /**
   * V.5 Batch Analysis
   */
  public async analyzeBatchV5(articles: ClassifyNewsPayload[]): Promise<BatchV5AnalyzeNewsResult> {
    const startTime = Date.now();
    const results: V5AnalyzeNewsResult[] = [];
    let reviewCount = 0;

    for (const article of articles) {
      const res = await this.analyzeV5(article);
      if (res.review_required) {
        reviewCount++;
      }
      results.push(res);
    }

    return {
      results,
      total: results.length,
      review_count: reviewCount,
      duration_ms: Date.now() - startTime,
    };
  }

  /**
   * Backward-compatible V.4 method mapping from V.5 analysis.
   */
  public async classify(payload: ClassifyNewsPayload): Promise<ClassifyNewsResult> {
    const analysis = await this.analyzeV5(payload);
    const stance = analysis.market_stance;
    const sentiment: Sentiment =
      stance === 'BULLISH' || stance === 'BEARISH' || stance === 'NEUTRAL' ? stance : 'NEUTRAL';

    return {
      article_id: analysis.article_id,
      sentiment,
      importance: analysis.importance,
      confidence: analysis.confidence,
      review_required: analysis.review_required,
      model: analysis.model,
      prompt_version: analysis.prompt_version,
      cached: analysis.cached,
      dual_impact: analysis.dual_impact_analysis,
      reasoning: analysis.reasoning_steps,
    };
  }

  public async classifyBatch(articles: ClassifyNewsPayload[]): Promise<BatchClassifyNewsResult> {
    const startTime = Date.now();
    const results: ClassifyNewsResult[] = [];
    let reviewCount = 0;

    for (const article of articles) {
      const res = await this.classify(article);
      if (res.review_required) {
        reviewCount++;
      }
      results.push(res);
    }

    return {
      results,
      total: results.length,
      review_count: reviewCount,
      duration_ms: Date.now() - startTime,
    };
  }

  private buildPromptV5(articleId: string, title: string, description: string): string {
    const articleJson = JSON.stringify({
      article_id: articleId,
      title,
      description,
    });

    const examplesJson = JSON.stringify(this.examplesV5);

    return `You are an objective financial analytics AI agent. Your mission is to analyze financial and macroeconomic news by rigorously identifying BOTH positive catalysts (upside opportunities) and negative risks (downside pressure) across global markets, sectors, and asset classes.

STRICT REGULATORY & NEUTRALITY MANDATE:
1. NON-ADVISORY: You MUST NOT give financial, trading, or investment advice. Never tell users to buy, sell, accumulate, or hold any asset. Never provide price targets.
2. BALANCED SYMMETRY: Financial events create winners and losers. You must present both Bull and Bear transmission mechanisms with equal analytical rigor.
3. GROUNDED IN FACTS: Base reasoning strictly on facts provided in the text and standard economic principles. Do not extrapolate unfounded rumors.
4. PROBABILISTIC FRAMING: Use conditional language ("may support...", "presents downside risk to...") rather than definitive certainties.
5. Return JSON only conforming to the schema.

Few-shot reference demonstrations:
${examplesJson}

Unlabeled target article to analyze:
${articleJson}`;
  }

  private getSchemaV5(): any {
    const impactItemSchema = {
      type: 'object',
      properties: {
        target: { type: 'string' },
        asset_class: { type: 'string', enum: ASSET_CLASSES },
        mechanism: { type: 'string' },
        timeframe: { type: 'string', enum: TIMEFRAMES },
      },
      required: ['target', 'asset_class', 'mechanism', 'timeframe'],
    };

    return {
      type: 'object',
      properties: {
        article_id: { type: 'string' },
        news_category: { type: 'string', enum: CATEGORIES },
        importance: { type: 'string', enum: IMPORTANCE },
        market_stance: { type: 'string', enum: MARKET_STANCES },
        confidence: { type: 'number' },
        reasoning_steps: {
          type: 'object',
          properties: {
            key_facts: { type: 'array', items: { type: 'string' } },
            transmission_mechanism: { type: 'string' },
            counter_perspective: { type: 'string' },
          },
          required: ['key_facts', 'transmission_mechanism', 'counter_perspective'],
        },
        dual_impact_analysis: {
          type: 'object',
          properties: {
            positive_impacts: { type: 'array', items: impactItemSchema },
            negative_impacts: { type: 'array', items: impactItemSchema },
          },
          required: ['positive_impacts', 'negative_impacts'],
        },
        uncertainties: { type: 'array', items: { type: 'string' } },
        neutrality_score: { type: 'number' },
        compliance_disclaimer: { type: 'string' },
      },
      required: [
        'article_id',
        'news_category',
        'importance',
        'market_stance',
        'confidence',
        'reasoning_steps',
        'dual_impact_analysis',
        'uncertainties',
        'neutrality_score',
        'compliance_disclaimer',
      ],
    };
  }

  private parseAndValidateV5(responseData: any, resolvedId: string): V5AnalyzeNewsResult {
    const candidate = responseData?.candidates?.[0];
    const parts = candidate?.content?.parts || [];
    const text = parts.map((p: any) => p.text || '').join('');

    if (!text) {
      throw new HttpException('Empty response received from Gemini API', HttpStatus.BAD_GATEWAY);
    }

    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch (err: any) {
      throw new HttpException(`Failed to parse Gemini response as JSON: ${err.message}`, HttpStatus.BAD_GATEWAY);
    }

    const fullText = JSON.stringify(parsed);
    const complianceFlags = this.scanAntiInducement(fullText);

    let confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0.85;
    confidence = Math.max(0, Math.min(1, confidence));

    let neutralityScore = typeof parsed.neutrality_score === 'number' ? parsed.neutrality_score : 0.95;
    if (complianceFlags.length > 0) {
      neutralityScore = Math.min(neutralityScore, 0.6);
    }

    const reviewRequired =
      confidence < this.confidenceThreshold ||
      neutralityScore < this.neutralityThreshold ||
      complianceFlags.length > 0;

    return {
      article_id: parsed.article_id || resolvedId,
      news_category: parsed.news_category || 'GENERAL_FINANCIAL',
      importance: parsed.importance || 'MEDIUM',
      market_stance: parsed.market_stance || 'NEUTRAL',
      confidence: parseFloat(confidence.toFixed(4)),
      review_required: reviewRequired,
      reasoning_steps: parsed.reasoning_steps || {
        key_facts: [],
        transmission_mechanism: '',
        counter_perspective: '',
      },
      dual_impact_analysis: parsed.dual_impact_analysis || {
        positive_impacts: [],
        negative_impacts: [],
      },
      uncertainties: parsed.uncertainties || [],
      neutrality_score: parseFloat(neutralityScore.toFixed(4)),
      compliance_disclaimer:
        parsed.compliance_disclaimer ||
        'This analysis is for educational and informational purposes only and does not constitute financial, investment, or trading advice.',
      compliance_flags: complianceFlags,
      model: this.model,
      prompt_version: PROMPT_VERSION_V5,
      cached: false,
    };
  }

  private scanAntiInducement(text: string): string[] {
    const flags: string[] = [];
    for (const pattern of FORBIDDEN_ADVISORY_PATTERNS) {
      if (pattern.test(text)) {
        flags.push(`Forbidden advisory pattern detected: ${pattern.toString()}`);
      }
    }
    return flags;
  }

  private async callGeminiWithRetry(url: string, body: any): Promise<any> {
    let lastError: any = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          return await response.json();
        }

        const status = response.status;
        const errorText = await response.text();

        const isRetryable = status === 429 || (status >= 500 && status < 600);
        if (!isRetryable || attempt === this.maxRetries) {
          throw new HttpException(`Gemini API error (HTTP ${status}): ${errorText}`, HttpStatus.BAD_GATEWAY);
        }

        const delay = 2000 * Math.pow(2, attempt) + Math.random() * 500;
        this.logger.warn(`Gemini API HTTP ${status} on attempt ${attempt + 1}. Retrying in ${Math.round(delay)}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      } catch (err: any) {
        lastError = err;
        if (err instanceof HttpException) throw err;
        if (attempt === this.maxRetries) break;

        const delay = 2000 * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw new HttpException(`Gemini API request failed after ${this.maxRetries} retries: ${lastError?.message}`, HttpStatus.BAD_GATEWAY);
  }

  private compact(value: string | undefined | null, limit: number = 1200): string {
    return (value || '').replace(/\s+/g, ' ').trim().slice(0, limit);
  }

  private generateArticleId(title: string, description: string): string {
    const hash = crypto.createHash('sha256').update(`${title}|${description}`).digest('hex');
    return `sha256:${hash}`;
  }
}

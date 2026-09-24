import { Injectable, Logger } from '@nestjs/common';
import { AiManagerService } from './ai-manager.service';
import type {
  AiTrend,
  NewsEnrichmentResult,
  NewsImportance,
  NewsSentiment,
} from './ai-news.types';
import {
  GEMINI_NEWS_CLASSIFICATION_SYSTEM_PROMPT,
  buildGeminiNewsClassificationPrompt,
  scanForbiddenAdvisoryLanguage,
  type GeminiClassificationInput,
  type RawGeminiClassification,
} from './gemini-news-classifier.prompt';

const VALID_TRENDS: AiTrend[] = ['UP', 'DOWN', 'SIDEWAY'];
const VALID_IMPORTANCE: NewsImportance[] = ['HIGH', 'MEDIUM', 'LOW'];
const VALID_SENTIMENT: NewsSentiment[] = ['BULLISH', 'BEARISH', 'NEUTRAL'];

/**
 * Thrown for anything that makes a Gemini response unsafe/unusable to persist:
 * missing/wrong-typed fields, an enum value outside the contract, or forbidden
 * advisory language slipping past the neutrality mandate. Callers treat this the
 * same as a network/provider failure — fall back to the existing enrichment chain.
 */
export class GeminiClassificationValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GeminiClassificationValidationError';
  }
}

export type GeminiEnrichmentResult = NewsEnrichmentResult & {
  confidence: number;
};

/**
 * Chunk A — Gemini first-pass news enrichment. Ports News_AI_(Gemini)'s V.5
 * neutrality mandate + anti-inducement scan (see gemini-news-classifier.prompt.ts)
 * but answers directly in the app's existing NewsEnrichmentResult contract plus a
 * confidence score, rather than the module's own dual-impact schema — see that
 * file's header comment for why.
 *
 * Goes through AiManagerService like every other AI-layer call — never calls the
 * Gemini API directly. Always a single attempt against exactly the "gemini-2.5-flash"
 * model id (preferredOnly): the caller (NewsEnrichmentService) is responsible for
 * falling back to the existing multi-provider chain on any failure, with Gemini
 * excluded from that fallback since it just failed.
 */
@Injectable()
export class GeminiNewsClassifierService {
  private readonly logger = new Logger(GeminiNewsClassifierService.name);

  constructor(private readonly manager: AiManagerService) {}

  async classify(
    input: GeminiClassificationInput,
  ): Promise<GeminiEnrichmentResult> {
    const result = await this.manager.executeSystemAiRequest<RawGeminiClassification>(
      {
        modelId: 'gemini-2.5-flash',
        preferredOnly: true,
        prompt: buildGeminiNewsClassificationPrompt(input),
        systemPrompt: GEMINI_NEWS_CLASSIFICATION_SYSTEM_PROMPT,
        maxOutputTokens: 1000,
      },
    );

    const normalized = this.validateAndNormalize(result.data);
    this.logger.debug(
      `classified via ${result.model}: importance=${normalized.importance} confidence=${normalized.confidence}`,
    );
    return normalized;
  }

  private validateAndNormalize(
    data: RawGeminiClassification,
  ): GeminiEnrichmentResult {
    if (!data || typeof data !== 'object') {
      throw new GeminiClassificationValidationError(
        'Gemini classification response was not an object',
      );
    }

    if (typeof data.aiSummary !== 'string' || !data.aiSummary.trim()) {
      throw new GeminiClassificationValidationError('aiSummary missing or empty');
    }
    if (typeof data.stockImpactAnalysis !== 'string' || !data.stockImpactAnalysis.trim()) {
      throw new GeminiClassificationValidationError(
        'stockImpactAnalysis missing or empty',
      );
    }
    if (typeof data.sector !== 'string' || !data.sector.trim()) {
      throw new GeminiClassificationValidationError('sector missing or empty');
    }
    if (!VALID_TRENDS.includes(data.aiTrend as AiTrend)) {
      throw new GeminiClassificationValidationError(
        `aiTrend "${String(data.aiTrend)}" is not one of ${VALID_TRENDS.join('/')}`,
      );
    }
    if (!VALID_IMPORTANCE.includes(data.importance as NewsImportance)) {
      throw new GeminiClassificationValidationError(
        `importance "${String(data.importance)}" is not one of ${VALID_IMPORTANCE.join('/')}`,
      );
    }
    if (!VALID_SENTIMENT.includes(data.sentiment as NewsSentiment)) {
      throw new GeminiClassificationValidationError(
        `sentiment "${String(data.sentiment)}" is not one of ${VALID_SENTIMENT.join('/')}`,
      );
    }

    const impactProbability = Number(data.aiImpactProbability);
    if (!Number.isFinite(impactProbability)) {
      throw new GeminiClassificationValidationError(
        'aiImpactProbability is not a finite number',
      );
    }

    const confidence = Number(data.confidence);
    if (!Number.isFinite(confidence)) {
      throw new GeminiClassificationValidationError(
        'confidence is not a finite number',
      );
    }

    const advisoryFlags = scanForbiddenAdvisoryLanguage(
      [
        data.aiSummary,
        data.stockImpactAnalysis,
        data.aiTranslatedSummary?.en ?? '',
        data.aiTranslatedSummary?.th ?? '',
      ].join(' \n '),
    );
    if (advisoryFlags.length > 0) {
      throw new GeminiClassificationValidationError(
        `forbidden advisory language detected: ${advisoryFlags.join(', ')}`,
      );
    }

    return {
      aiSummary: data.aiSummary,
      aiTrend: data.aiTrend as AiTrend,
      aiImpactProbability: Math.max(0, Math.min(100, impactProbability)),
      stockImpactAnalysis: data.stockImpactAnalysis,
      sector: data.sector,
      importance: data.importance as NewsImportance,
      sentiment: data.sentiment as NewsSentiment,
      aiTranslatedSummary: data.aiTranslatedSummary,
      fromFallback: false,
      confidence: Math.max(0, Math.min(1, confidence)),
    };
  }
}

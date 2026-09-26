import { Injectable, Logger } from '@nestjs/common';
import { AiManagerService } from './ai-manager.service';
import type {
  AiTrend,
  NewsEnrichmentResult,
  NewsImportance,
  NewsSentiment,
} from './ai-news.types';
import {
  buildNewsClassificationPrompt,
  buildNewsClassificationSystemPrompt,
  scanForbiddenAdvisoryLanguage,
  type NewsClassificationInput,
  type RawNewsClassification,
} from './news-classifier.prompt';

/** Bulk system job: cheapest tier. The concrete model comes from AI_MODEL_FAST. */
export const NEWS_CLASSIFIER_MODEL_ID = 'claude-fast';

const VALID_TRENDS: AiTrend[] = ['UP', 'DOWN', 'SIDEWAY'];
const VALID_IMPORTANCE: NewsImportance[] = ['HIGH', 'MEDIUM', 'LOW'];
const VALID_SENTIMENT: NewsSentiment[] = ['BULLISH', 'BEARISH', 'NEUTRAL'];

/**
 * Thrown for anything that makes a classifier response unsafe/unusable to persist:
 * missing/wrong-typed fields, an enum value outside the contract, or forbidden
 * advisory language slipping past the neutrality mandate. Callers treat this the
 * same as a network/provider failure — fall back to the existing enrichment chain.
 */
export class NewsClassificationValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NewsClassificationValidationError';
  }
}

export type NewsClassificationResult = NewsEnrichmentResult & {
  confidence: number;
};

/**
 * Chunk A — first-pass news enrichment on the Claude FAST tier (originally built for
 * Gemini; the provider plan changed, the output contract did not). Ports News_AI_(Gemini)'s V.5
 * neutrality mandate + anti-inducement scan (see news-classifier.prompt.ts)
 * but answers directly in the app's existing NewsEnrichmentResult contract plus a
 * confidence score, rather than the module's own dual-impact schema — see that
 * file's header comment for why.
 *
 * Goes through AiManagerService like every other AI-layer call — never calls the
 * provider API directly. Always a single attempt against exactly the "claude-fast" tier
 * (preferredOnly, system-paid): the caller (NewsEnrichmentService) is responsible for
 * falling back to the legacy enrichment prompt on any failure.
 */
@Injectable()
export class NewsClassifierService {
  private readonly logger = new Logger(NewsClassifierService.name);

  constructor(private readonly manager: AiManagerService) {}

  async classify(
    input: NewsClassificationInput,
  ): Promise<NewsClassificationResult> {
    const result =
      await this.manager.executeSystemAiRequest<RawNewsClassification>({
        modelId: NEWS_CLASSIFIER_MODEL_ID,
        preferredOnly: true,
        prompt: buildNewsClassificationPrompt(input),
        systemPrompt: buildNewsClassificationSystemPrompt(input.language),
        // Classification wants the same label for the same article, not creativity.
        temperature: 0,
        maxOutputTokens: 1000,
        // aiTranslatedSummary is deliberately not checked: it is Thai by design
        expectedLanguage: input.language,
        languageProbe: (data) => [data?.aiSummary, data?.stockImpactAnalysis],
      });

    const normalized = this.validateAndNormalize(result.data);
    this.logger.debug(
      `classified via ${result.model}: importance=${normalized.importance} confidence=${normalized.confidence}`,
    );
    return normalized;
  }

  private validateAndNormalize(
    data: RawNewsClassification,
  ): NewsClassificationResult {
    if (!data || typeof data !== 'object') {
      throw new NewsClassificationValidationError(
        'Classification response was not an object',
      );
    }

    if (typeof data.aiSummary !== 'string' || !data.aiSummary.trim()) {
      throw new NewsClassificationValidationError('aiSummary missing or empty');
    }
    if (
      typeof data.stockImpactAnalysis !== 'string' ||
      !data.stockImpactAnalysis.trim()
    ) {
      throw new NewsClassificationValidationError(
        'stockImpactAnalysis missing or empty',
      );
    }
    if (typeof data.sector !== 'string' || !data.sector.trim()) {
      throw new NewsClassificationValidationError('sector missing or empty');
    }
    if (!VALID_TRENDS.includes(data.aiTrend as AiTrend)) {
      throw new NewsClassificationValidationError(
        `aiTrend "${String(data.aiTrend)}" is not one of ${VALID_TRENDS.join('/')}`,
      );
    }
    if (!VALID_IMPORTANCE.includes(data.importance as NewsImportance)) {
      throw new NewsClassificationValidationError(
        `importance "${String(data.importance)}" is not one of ${VALID_IMPORTANCE.join('/')}`,
      );
    }
    if (!VALID_SENTIMENT.includes(data.sentiment as NewsSentiment)) {
      throw new NewsClassificationValidationError(
        `sentiment "${String(data.sentiment)}" is not one of ${VALID_SENTIMENT.join('/')}`,
      );
    }

    const impactProbability = Number(data.aiImpactProbability);
    if (!Number.isFinite(impactProbability)) {
      throw new NewsClassificationValidationError(
        'aiImpactProbability is not a finite number',
      );
    }

    const confidence = Number(data.confidence);
    if (!Number.isFinite(confidence)) {
      throw new NewsClassificationValidationError(
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
      throw new NewsClassificationValidationError(
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

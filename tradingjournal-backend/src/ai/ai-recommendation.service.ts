import {
  Injectable,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AiManagerService } from './ai-manager.service';
import type { StockRecommendation } from './ai-feature.types';

@Injectable()
export class AiRecommendationService {
  constructor(private readonly manager: AiManagerService) {}

  async getGrowthRecommendations(userId: number) {
    const modelId = this.defaultModel();

    const result = await this.manager.executeAiRequest<
      StockRecommendation[] | Record<string, unknown>
    >({
      userId,
      modelId,
      systemPrompt:
        'You are a quantitative growth-stock analyst. Return a valid JSON array only. Do not invent live prices or precise current metrics.',
      prompt: `Recommend 4-5 publicly traded growth companies across diverse sectors.
Return ONLY a JSON array with:
[{
  "symbol":"string",
  "name":"string",
  "sector":"string",
  "reasoning":{
    "growth":"string",
    "profit":"string",
    "customerBase":"string",
    "liquidity":"string"
  },
  "aiSummary":"string"
}]
State uncertainty when current data is unavailable. Do not guarantee returns.`,
      maxOutputTokens: 1800,
    });

    const rows = this.extractArray(result.data);
    if (!rows.length) {
      throw new InternalServerErrorException(
        'AI returned no stock recommendations',
      );
    }

    return {
      data: rows,
      model: result.model,
      creditsCharged: result.creditsCharged,
      creditsRemaining: result.creditsRemaining,
    };
  }

  private extractArray(data: unknown): StockRecommendation[] {
    if (Array.isArray(data)) return data as StockRecommendation[];
    if (data && typeof data === 'object') {
      const nested = Object.values(data as Record<string, unknown>).find(
        Array.isArray,
      );
      if (Array.isArray(nested)) return nested as StockRecommendation[];
    }
    return [];
  }

  private defaultModel(): string {
    const models = this.manager.listAvailableModels();
    const selected =
      models.find((model) => model.id === 'gemini-2.5-flash') ??
      models.find((model) => model.id === 'groq-llama3') ??
      models[0];

    if (!selected) {
      throw new ServiceUnavailableException(
        'No AI provider is configured on this server.',
      );
    }
    return selected.id;
  }
}

import {
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { AiManagerService } from './ai-manager.service';
import type {
  PortfolioRiskAnalysis,
  PortfolioRiskHolding,
} from './ai-feature.types';

@Injectable()
export class AiRiskService {
  constructor(private readonly manager: AiManagerService) {}

  async analyze(
    userId: number,
    holdings: PortfolioRiskHolding[],
    modelId: string,
  ) {
    const normalized = this.normalizeWeights(holdings);

    const result =
      await this.manager.executeAiRequest<PortfolioRiskAnalysis>({
        userId,
        modelId,
        systemPrompt:
          'You are a portfolio risk analyst. Return valid JSON only and rely only on supplied data.',
        prompt: JSON.stringify({
          task: 'Assess portfolio risk',
          requiredShape: {
            riskLevel: 'Low|Moderate|Aggressive',
            riskScore: 'number 0-100',
            analysisSummary: 'string',
            keyRiskFactors: ['string'],
          },
          rules: {
            highBeta: '>1.2',
            highDebtToEquity: '>1.0',
            highPe: '>30',
            concentration: 'large portfolio weights',
          },
          holdings: normalized,
        }),
        maxOutputTokens: 1200,
      });

    const data = result.data;
    if (
      !data?.riskLevel ||
      typeof data.riskScore !== 'number' ||
      !data.analysisSummary ||
      !Array.isArray(data.keyRiskFactors)
    ) {
      throw new InternalServerErrorException(
        'AI returned an unusable risk analysis',
      );
    }

    data.riskScore = Math.max(0, Math.min(100, data.riskScore));

    return {
      data,
      holdingsData: normalized,
      model: result.model,
      creditsCharged: result.creditsCharged,
      creditsRemaining: result.creditsRemaining,
    };
  }

  private normalizeWeights(holdings: PortfolioRiskHolding[]) {
    const explicitTotal = holdings.reduce(
      (sum, item) => sum + Number(item.weight ?? 0),
      0,
    );
    const quantityTotal = holdings.reduce(
      (sum, item) => sum + Math.max(0, Number(item.quantity ?? 0)),
      0,
    );

    return holdings.map((item) => ({
      ...item,
      symbol: item.symbol.trim().toUpperCase(),
      weight:
        item.weight != null
          ? Number(item.weight)
          : explicitTotal > 0
            ? 0
            : quantityTotal > 0
              ? Number(item.quantity) / quantityTotal
              : 0,
      beta: item.beta ?? null,
      debtToEquity: item.debtToEquity ?? null,
      peRatio: item.peRatio ?? null,
      currentPrice: item.currentPrice ?? 0,
    }));
  }
}

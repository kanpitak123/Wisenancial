import {
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { AiManagerService } from './ai-manager.service';
import {
  investmentGuardrail,
  outputLanguageRule,
  resolveOutputLanguage,
} from './ai-prompt.shared';
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
    requestedLanguage?: string,
  ) {
    const normalized = this.normalizeWeights(holdings);
    const outputLanguage = resolveOutputLanguage(requestedLanguage);

    const result =
      await this.manager.executeAiRequest<PortfolioRiskAnalysis>({
        userId,
        modelId,
        systemPrompt: [
          'You are a portfolio risk analyst. Rely only on supplied data.',
          outputLanguageRule(outputLanguage),
          investmentGuardrail(),
          // กันหลอน: ก่อนหน้านี้ทุกฟิลด์ปัจจัยพื้นฐานเป็น null เสมอ (หน้าบ้านไม่เคยส่งมา)
          // โมเดลจึงเดาค่าจากชื่อหุ้นในความจำเก่าแล้วอ้างว่าประเมินตามกติกาที่ให้ไป
          'A null field means the data is unavailable — never infer, recall, or estimate it from your own knowledge of the company.',
          'When a field is null, exclude that holding from that rule and state the gap in analysisSummary instead of guessing.',
          'Return valid JSON only.',
        ].join('\n'),
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
            // เดิมเขียนว่า "large portfolio weights" ปล่อยให้โมเดลตีความเองว่าเท่าไหร่ถึงเรียกว่าใหญ่
            concentration: 'single holding weight >25%',
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

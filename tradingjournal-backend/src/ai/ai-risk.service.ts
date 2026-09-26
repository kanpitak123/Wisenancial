import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { AiManagerService } from './ai-manager.service';
import {
  concisenessRule,
  investmentGuardrail,
  numberQuotingRule,
  outputLanguageRule,
  resolveOutputLanguage,
  withLanguage,
} from './ai-prompt.shared';
import { labelsFor } from './review-labels';
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
    requestedLanguage?: string,
  ) {
    const normalized = this.normalizeWeights(holdings);
    const outputLanguage = resolveOutputLanguage(requestedLanguage);

    // weight ในหน้าบ้านเป็นเศษส่วน (0.6) แต่ข้อความต้องพูดเป็นเปอร์เซ็นต์ — คำนวณให้ตรงนี้
    // เพื่อให้ตัวเลขที่โมเดลอ้างมีอยู่ใน payload จริง (ตัวตรวจ groundedIn เทียบกับก้อนนี้)
    const promptHoldings = normalized.map((holding) => ({
      ...holding,
      weightPercent: Math.round(holding.weight * 10000) / 100,
    }));

    const payload = withLanguage(
      {
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
        holdings: promptHoldings,
        fieldGuide: {
          weightPercent: "holding's share of the portfolio, in percent",
          weight: 'the same share as a fraction of 1',
          peRatio: 'price/earnings ratio, in times',
          beta: 'sensitivity to the market, a plain ratio',
          debtToEquity:
            'total debt divided by equity, a plain ratio (not a percent)',
        },
        labels: labelsFor(
          [
            'weightPercent',
            'weight',
            'quantity',
            'currentPrice',
            'peRatio',
            'beta',
            'debtToEquity',
          ],
          outputLanguage,
        ),
      },
      outputLanguage,
    );

    const result = await this.manager.executeAiRequest<PortfolioRiskAnalysis>({
      userId,
      feature: 'risk_analysis',
      systemPrompt: [
        'You are a portfolio risk analyst. Rely only on supplied data.',
        outputLanguageRule(outputLanguage),
        investmentGuardrail(),
        numberQuotingRule(['holdings', 'rules']),
        concisenessRule(),
        // กันหลอน: ก่อนหน้านี้ทุกฟิลด์ปัจจัยพื้นฐานเป็น null เสมอ (หน้าบ้านไม่เคยส่งมา)
        // โมเดลจึงเดาค่าจากชื่อหุ้นในความจำเก่าแล้วอ้างว่าประเมินตามกติกาที่ให้ไป
        'A null field means the data is unavailable — never infer, recall, or estimate it from your own knowledge of the company.',
        'When a field is null, exclude that holding from that rule and state the gap in analysisSummary instead of guessing.',
        'Return valid JSON only.',
      ].join('\n'),
      prompt: JSON.stringify(payload),
      maxOutputTokens: 1600,
      expectedLanguage: outputLanguage,
      groundedIn: payload,
      rejectKeyNames: true,
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

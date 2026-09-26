import { AiCompatibilityController } from './ai-compatibility.controller';
import { AiEducationService } from './ai-education.service';
import { AiRiskService } from './ai-risk.service';
import { AiService } from './ai.service';

/**
 * Every user-paid AI call names its feature, and the feature alone fixes price and tier.
 * No caller passes a model any more.
 */

function fake(data: unknown) {
  const executeAiRequest = jest.fn().mockResolvedValue({
    data,
    model: 'claude-fast',
    creditsCharged: 5,
    creditsRemaining: 95,
  });
  const executeSystemAiRequest = jest.fn();

  return {
    executeAiRequest,
    executeSystemAiRequest,
    manager: { executeAiRequest, executeSystemAiRequest },
  };
}

const requestOf = (mock: jest.Mock) =>
  (mock.mock.calls[0] as [Record<string, unknown>])[0];

function aiService(manager: unknown, portfolioType = 'INVESTOR') {
  return new AiService(
    {
      portfolios: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ portfolio_type: portfolioType }),
      },
    } as never,
    manager as never,
    { analyze: jest.fn().mockReturnValue('rule insight') } as never,
    { overview: jest.fn().mockResolvedValue({}) } as never,
    { getHoldings: jest.fn().mockResolvedValue([]) } as never,
  );
}

describe('user-paid AI calls name their feature', () => {
  it('chart insight with an explicit AI click (useAi: true) -> chart_insight', async () => {
    const { manager, executeAiRequest } = fake({ insight: 'ok' });

    await aiService(manager).analyzeChart(1, {
      portfolioType: 'TRADER',
      chartType: 'x',
      data: {},
      useAi: true,
    });

    const request = requestOf(executeAiRequest);
    expect(request.feature).toBe('chart_insight');
    expect(request).not.toHaveProperty('modelId');
  });

  it.each([
    ['no flag at all', {}],
    ['useAi: false', { useAi: false }],
    ['a stale client sending modelId', { modelId: 'groq-llama3' }],
    ['a stale client sending useRuleBased: false', { useRuleBased: false }],
    [
      'a stale client sending modelId and useRuleBased: false',
      { modelId: 'claude-fast', useRuleBased: false },
    ],
  ])(
    'chart insight is the free rule-based one for %s, and never reaches the manager',
    async (_name, flags) => {
      const { manager, executeAiRequest } = fake({ insight: 'ok' });

      const result = await aiService(manager).analyzeChart(1, {
        portfolioType: 'TRADER',
        chartType: 'x',
        data: {},
        ...flags,
      });

      expect(result).toEqual({ insight: 'rule insight', source: 'RULE_BASED' });
      expect(executeAiRequest).not.toHaveBeenCalled();
    },
  );

  it.each(['TRADER', 'INVESTOR'])(
    'portfolio review (%s) -> portfolio_review',
    async (type) => {
      const { manager, executeAiRequest } = fake({ summary: 'ok' });

      await aiService(manager, type).reviewPortfolio(1, 5);

      expect(requestOf(executeAiRequest).feature).toBe('portfolio_review');
    },
  );

  it('risk analysis -> risk_analysis', async () => {
    const { manager, executeAiRequest } = fake({
      riskLevel: 'Moderate',
      riskScore: 50,
      analysisSummary: 'ok',
      keyRiskFactors: ['a'],
    });

    await new AiRiskService(manager as never).analyze(1, [
      { symbol: 'AAPL', quantity: 1, weight: 1 },
    ]);

    expect(requestOf(executeAiRequest).feature).toBe('risk_analysis');
  });

  it('quiz -> education_quiz', async () => {
    const question = {
      question: 'q',
      options: ['a', 'b', 'c', 'd'],
      correctAnswer: 0,
      explanation: 'e',
    };
    const { manager, executeAiRequest } = fake({
      questions: [question, question],
    });

    await new AiEducationService(manager as never).generateQuiz(1, 'T', 'D');

    expect(requestOf(executeAiRequest).feature).toBe('education_quiz');
  });

  it('user news enrichment -> news_enrich', async () => {
    const { manager, executeAiRequest } = fake({ aiSummary: 's' });

    await aiService(manager).enrichUserNewsArticle(1, 'Headline', 'Summary');

    expect(requestOf(executeAiRequest).feature).toBe('news_enrich');
  });

  it('legacy /ai-advisor/analyze -> portfolio_review (same price as the review it duplicates)', async () => {
    const { manager, executeAiRequest } = fake({});
    const controller = new AiCompatibilityController(
      manager as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await controller.analyzeLegacyPortfolio(
      { user: { userId: 1 } },
      { holdings: [] },
    );

    expect(requestOf(executeAiRequest).feature).toBe('portfolio_review');
  });
});

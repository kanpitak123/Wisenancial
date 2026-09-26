import { AiRiskService } from './ai-risk.service';
import { AiService } from './ai.service';
import { assessKeyNameLeak } from './ai-key-leak';
import { assessNumericGrounding } from './ai-grounding';

/**
 * Risk Analysis and Chart Insight get the same output guards as Portfolio Review: figures
 * must come from the payload, and key names must not leak into the prose.
 */

interface Sent {
  prompt: string;
  systemPrompt: string;
  groundedIn: unknown;
  rejectKeyNames?: boolean;
  expectedLanguage?: string;
  languageProbe?: (data: never) => unknown;
}

const RISK_ANSWER = {
  riskLevel: 'Moderate',
  riskScore: 55,
  analysisSummary: 'ok',
  keyRiskFactors: ['a'],
};

function riskService() {
  const executeAiRequest = jest.fn().mockResolvedValue({
    data: RISK_ANSWER,
    model: 'claude-fast',
    creditsCharged: 1,
    creditsRemaining: 9,
  });

  return {
    executeAiRequest,
    service: new AiRiskService({ executeAiRequest } as never),
  };
}

const HOLDINGS = [
  {
    symbol: 'AAPL',
    quantity: 6,
    weight: 0.6,
    peRatio: 36.1,
    beta: 1.09,
    debtToEquity: 0.784,
    currentPrice: 314.67,
  },
  {
    symbol: 'MSFT',
    quantity: 4,
    weight: 0.4,
    peRatio: 30.2,
    beta: 0.9,
    debtToEquity: 0.291,
    currentPrice: 516.17,
  },
];

describe('Risk Analysis — grounded numbers', () => {
  it('sends weights as percent, with labels and a field guide', async () => {
    const { service, executeAiRequest } = riskService();

    await service.analyze(1, HOLDINGS, 'claude-fast', 'th');

    const sent = (executeAiRequest.mock.calls[0] as [Sent])[0];
    const payload = JSON.parse(sent.prompt) as {
      holdings: Array<Record<string, number | string>>;
      labels: Record<string, string>;
      fieldGuide: Record<string, string>;
    };

    expect(payload.holdings[0]).toMatchObject({
      symbol: 'AAPL',
      weightPercent: 60,
    });
    expect(payload.holdings[1]).toMatchObject({
      symbol: 'MSFT',
      weightPercent: 40,
    });
    expect(payload.labels.debtToEquity).toBe('หนี้สินต่อส่วนทุน (D/E)');
    expect(payload.fieldGuide.debtToEquity).toMatch(/not a percent/);
  });

  it('asks the manager to check figures and key names against exactly what was sent', async () => {
    const { service, executeAiRequest } = riskService();

    await service.analyze(1, HOLDINGS, 'claude-fast', 'en');

    const sent = (executeAiRequest.mock.calls[0] as [Sent])[0];

    expect(sent.groundedIn).toEqual(JSON.parse(sent.prompt));
    expect(sent.rejectKeyNames).toBe(true);
    expect(sent.systemPrompt).toContain('Never calculate, estimate, convert');
    expect(sent.systemPrompt).toContain('Never write a key name');
  });

  it('a normal risk write-up is grounded; an invented or summed figure is not', async () => {
    const { service, executeAiRequest } = riskService();
    await service.analyze(1, HOLDINGS, 'claude-fast', 'en');
    const { groundedIn } = (executeAiRequest.mock.calls[0] as [Sent])[0];

    const good = {
      analysisSummary:
        'AAPL is 60% of the portfolio, above the 25% concentration line, with beta 1.09 and a P/E of 36.1.',
    };
    const bad = {
      analysisSummary:
        'The two positions together are 100% of the portfolio, and 45% of value is at risk.',
    };

    expect(assessNumericGrounding(good, groundedIn).ok).toBe(true);
    expect(assessNumericGrounding(bad, groundedIn).ok).toBe(false);
    expect(assessKeyNameLeak(good, groundedIn).ok).toBe(true);
    expect(
      assessKeyNameLeak(
        {
          analysisSummary:
            'The debtToEquity of AAPL is on the high side for this portfolio.',
        },
        groundedIn,
      ).ok,
    ).toBe(false);
  });

  it('the holdings returned to the caller are unchanged (fractions stay fractions)', async () => {
    const { service } = riskService();

    const result = await service.analyze(1, HOLDINGS, 'claude-fast', 'th');

    expect(result.holdingsData[0]?.weight).toBe(0.6);
    expect(result.holdingsData[0]).not.toHaveProperty('weightPercent');
  });
});

describe('Chart Insight — grounded numbers', () => {
  function chartService() {
    const executeAiRequest = jest.fn().mockResolvedValue({
      data: { insight: 'ok' },
      model: 'claude-fast',
      creditsCharged: 1,
      creditsRemaining: 9,
    });

    return {
      executeAiRequest,
      service: new AiService(
        {} as never,
        { executeAiRequest } as never,
        {} as never,
        {} as never,
        {} as never,
      ),
    };
  }

  it('checks figures and key names against the chart data it sent', async () => {
    const { service, executeAiRequest } = chartService();

    await service.analyzeChart(1, {
      portfolioType: 'TRADER',
      chartType: 'win_rate',
      data: { winRate: 61.5, trades: 40 },
      modelId: 'claude-fast',
      outputLanguage: 'en',
    });

    const sent = (executeAiRequest.mock.calls[0] as [Sent])[0];

    expect(sent.groundedIn).toEqual(JSON.parse(sent.prompt));
    expect(sent.rejectKeyNames).toBe(true);
    expect(sent.systemPrompt).toContain(
      'quote figures only from "data" and "extraContext"',
    );

    expect(
      assessNumericGrounding(
        { insight: 'The win rate is 61.5% across the period shown.' },
        sent.groundedIn,
      ).ok,
    ).toBe(true);
    expect(
      assessNumericGrounding(
        { insight: 'That is 12.3% better than the average trader.' },
        sent.groundedIn,
      ).ok,
    ).toBe(false);
    expect(
      assessKeyNameLeak(
        { insight: 'The winRate value shows a solid edge over these trades.' },
        sent.groundedIn,
      ).ok,
    ).toBe(false);
  });
});

import { AiService } from './ai.service';
import { assessNumericGrounding } from './ai-grounding';

/**
 * Portfolio Review sends pre-computed, labelled metrics and asks the manager to check the
 * answer's figures against exactly what was sent.
 */

const INVESTOR_OVERVIEW = {
  portfolio: { currency: 'USD' },
  summary: {
    current_value: 22874.76,
    cash: 17020,
    invested_cost: 1700,
    holdings_value: 5854.76,
    realized_pnl: -1280,
    unrealized_pnl: 4154.76,
    dividend_income: 0,
    total_pnl: 2874.76,
    total_pnl_percent: 14.3738,
    contributed_capital: 20000,
    open_holdings: 1,
    closed_sales: 5,
  },
  holdings: [{ symbol: 'MSFT' }],
  recent_activity: [{ id: 38, description: 'Buy AAPL 5 shares' }],
};

const HOLDINGS = [
  {
    symbol: 'MSFT',
    remaining_shares: 5,
    average_cost: 50,
    cost_basis: 250,
    current_price: 516.17,
    market_value: 2580.85,
    unrealized_pnl: 2330.85,
    unrealized_pnl_percent: 932.34,
    currency: 'USD',
  },
];

function makeService(portfolioType: 'INVESTOR' | 'TRADER') {
  const executeAiRequest = jest.fn().mockResolvedValue({
    data: { summary: 'ok' },
    model: 'claude-fast',
    creditsCharged: 1,
    creditsRemaining: 9,
  });

  const service = new AiService(
    {
      portfolios: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ portfolio_type: portfolioType }),
      },
    } as never,
    { executeAiRequest } as never,
    {} as never,
    {
      overview: jest.fn().mockResolvedValue(
        portfolioType === 'INVESTOR'
          ? INVESTOR_OVERVIEW
          : {
              portfolio: { currency: 'USD' },
              summary: { total_pnl: 500, total_pnl_percent: 5, win_rate: 60 },
            },
      ),
    } as never,
    { getHoldings: jest.fn().mockResolvedValue(HOLDINGS) } as never,
  );

  return { service, executeAiRequest };
}

type Sent = {
  prompt: string;
  systemPrompt: string;
  groundedIn: unknown;
};

describe('AiService.reviewPortfolio — labelled metrics and grounding', () => {
  it('INVESTOR: sends labelled metrics, not the raw overview', async () => {
    const { service, executeAiRequest } = makeService('INVESTOR');

    await service.reviewPortfolio(1, 17, undefined, undefined, 'th');

    const sent = (executeAiRequest.mock.calls[0] as [Sent])[0];
    const payload = JSON.parse(sent.prompt) as Record<string, unknown>;

    expect(payload.metrics).toMatchObject({
      unrealizedProfitLoss_USD: 4154.76,
      realizedProfitLoss_USD: -1280,
      totalProfitLoss_USD: 2874.76,
      totalReturn_percent: 14.37,
    });
    expect(payload).toHaveProperty('glossary');
    expect(payload).toHaveProperty('holdingFields');
    // the raw shapes that caused the confusion are gone
    expect(payload).not.toHaveProperty('analytics');
    expect(sent.prompt).not.toContain('recent_activity');
    expect(sent.prompt).not.toContain('unrealized_pnl_percent');
    expect(sent.prompt).not.toContain('total_pnl');
  });

  it.each(['th', 'en'] as const)(
    'INVESTOR: carries the %s label glossary and asks for the key-name check',
    async (language) => {
      const { service, executeAiRequest } = makeService('INVESTOR');

      await service.reviewPortfolio(1, 17, undefined, undefined, language);

      const sent = (
        executeAiRequest.mock.calls[0] as [Sent & { rejectKeyNames?: boolean }]
      )[0];
      const payload = JSON.parse(sent.prompt) as {
        labels: Record<string, string>;
      };

      expect(payload.labels.unrealizedProfitLoss_USD).toBe(
        language === 'th' ? 'กำไร/ขาดทุนที่ยังไม่รับรู้' : 'unrealized P&L',
      );
      expect(payload.labels.totalReturn_percent).toBe(
        language === 'th' ? 'ผลตอบแทนรวม' : 'total return',
      );
      expect(sent.rejectKeyNames).toBe(true);
      expect(sent.systemPrompt).toContain('"labels"');
    },
  );

  it('INVESTOR: system prompt tells the model to quote, never compute', async () => {
    const { service, executeAiRequest } = makeService('INVESTOR');

    await service.reviewPortfolio(1, 17);

    const sent = (executeAiRequest.mock.calls[0] as [Sent])[0];

    expect(sent.systemPrompt).toContain('Never calculate, estimate, convert');
    expect(sent.systemPrompt).toContain('unrealized profit/loss');
    expect(sent.systemPrompt).toContain('total profit/loss');
    expect(sent.systemPrompt).toContain('Never write a key name');
  });

  it.each(['INVESTOR', 'TRADER'] as const)(
    '%s: the grounding source is exactly the payload the model saw',
    async (type) => {
      const { service, executeAiRequest } = makeService(type);

      await service.reviewPortfolio(1, 17);

      const sent = (executeAiRequest.mock.calls[0] as [Sent])[0];

      expect(sent.groundedIn).toEqual(JSON.parse(sent.prompt));
    },
  );

  it('INVESTOR: the review that started this (MSFT 932%, total 2,874.76, unrealized 4,154.76) is grounded', async () => {
    const { service, executeAiRequest } = makeService('INVESTOR');

    await service.reviewPortfolio(1, 17);

    const sent = (executeAiRequest.mock.calls[0] as [Sent])[0];
    const answer = {
      summary:
        'Total profit/loss is 2,874.76 USD, of which 4,154.76 is unrealized and -1,280 is realized; MSFT is up 932.34% on cost.',
    };

    expect(assessNumericGrounding(answer, sent.groundedIn).ok).toBe(true);
    // a figure the payload does not contain is caught
    expect(
      assessNumericGrounding(
        { summary: 'MSFT doubled again, +1,864%.' },
        sent.groundedIn,
      ).ok,
    ).toBe(false);
  });

  it('TRADER: sends labelled metrics with units', async () => {
    const { service, executeAiRequest } = makeService('TRADER');

    await service.reviewPortfolio(1, 15);

    const sent = (executeAiRequest.mock.calls[0] as [Sent])[0];
    const payload = JSON.parse(sent.prompt) as {
      metrics: Record<string, number>;
    };

    expect(payload.metrics).toMatchObject({
      netProfitLoss_USD: 500,
      returnOnInitialBalance_percent: 5,
      winRate_percent: 60,
    });
    expect(sent.systemPrompt).toContain('Never calculate, estimate, convert');
  });
});

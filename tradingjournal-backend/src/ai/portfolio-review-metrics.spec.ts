import {
  buildInvestorReviewMetrics,
  buildTraderReviewMetrics,
} from './portfolio-review-metrics';

/**
 * Built from the real qa@ "QA Stock Main" overview that produced "MSFT return 932%" and
 * "total profit 2,874.76" next to "unrealized profit 4,154.76".
 */
const OVERVIEW = {
  portfolio: {
    id: 17,
    name: 'QA Stock Main',
    type: 'INVESTOR',
    currency: 'USD',
  },
  summary: {
    current_value: 22874.760000000002,
    cash: 17020,
    invested_cost: 1700,
    holdings_value: 5854.76,
    realized_pnl: -1280,
    unrealized_pnl: 4154.76,
    dividend_income: 0,
    total_pnl: 2874.76,
    total_pnl_percent: 14.373800000000012,
    contributed_capital: 20000,
    investment_gain: 2874.760000000002,
    open_holdings: 3,
    closed_sales: 5,
  },
  recent_activity: [
    { id: 38, amount: '-750', description: 'Buy AAPL 5 shares' },
  ],
};

const HOLDINGS = [
  {
    symbol: 'AAPL',
    name: null,
    remaining_shares: 3,
    average_cost: 150,
    cost_basis: 450,
    current_price: 341.07,
    market_value: 1023.21,
    unrealized_pnl: 573.21,
    unrealized_pnl_percent: 127.38,
    currency: 'USD',
  },
  {
    symbol: 'MSFT',
    name: null,
    remaining_shares: 5,
    average_cost: 50,
    cost_basis: 250,
    current_price: 516.17,
    market_value: 2580.85,
    unrealized_pnl: 2330.85,
    unrealized_pnl_percent: 932.34,
    currency: 'USD',
  },
  {
    symbol: 'NVDA',
    name: null,
    remaining_shares: 10,
    average_cost: 100,
    cost_basis: 1000,
    current_price: 225.07,
    market_value: 2250.7,
    unrealized_pnl: 1250.7,
    unrealized_pnl_percent: 125.07,
    currency: 'USD',
  },
];

describe('buildInvestorReviewMetrics', () => {
  const built = buildInvestorReviewMetrics(OVERVIEW, HOLDINGS);

  it('puts the unit in every key and rounds once to 2 decimals', () => {
    expect(built.metrics).toMatchObject({
      portfolioValue_USD: 22874.76,
      cash_USD: 17020,
      unrealizedProfitLoss_USD: 4154.76,
      realizedProfitLoss_USD: -1280,
      totalProfitLoss_USD: 2874.76,
      totalReturn_percent: 14.37,
      openHoldings_count: 3,
      closedSales_count: 5,
    });
    for (const key of Object.keys(built.metrics)) {
      expect(key).toMatch(/_(USD|percent|count)$/);
    }
  });

  it('keeps unrealized, realized and total profit apart, each with a definition', () => {
    const { glossary } = built;

    expect(glossary.unrealizedProfitLoss_USD).toMatch(/^Unrealized/);
    expect(glossary.unrealizedProfitLoss_USD).toMatch(/still held/);
    expect(glossary.realizedProfitLoss_USD).toMatch(/^Realized/);
    expect(glossary.totalProfitLoss_USD).toMatch(/^Total/);
    expect(glossary.totalProfitLoss_USD).toMatch(
      /realized \+ unrealized \+ dividends/,
    );
    // the ambiguity that confused the review: total (2,874.76) is not the unrealized figure
    expect(built.metrics.totalProfitLoss_USD).not.toBe(
      built.metrics.unrealizedProfitLoss_USD,
    );
    // every metric has a definition
    expect(Object.keys(glossary).sort()).toEqual(
      Object.keys(built.metrics).sort(),
    );
  });

  it('labels the per-holding percent, so 932.34 is read as +932.34% on cost', () => {
    const msft = built.holdings.find((row) => row.symbol === 'MSFT');

    expect(msft).toMatchObject({
      averageCostPerShare_USD: 50,
      currentPrice_USD: 516.17,
      unrealizedReturn_percent: 932.34,
    });
    expect(built.holdingFields.unrealizedReturn_percent).toMatch(
      /932\.34 means \+932\.34%/,
    );
  });

  it('precomputes each holding weight from market value', () => {
    const weights = built.holdings.map((row) => row.weightInHoldings_percent);

    // 2580.85 / 5854.76 = 44.08%
    expect(weights).toEqual([17.48, 44.08, 38.44]);
  });

  it('drops the noise the raw payload carried (activity feed, duplicate holdings)', () => {
    const json = JSON.stringify(built);

    expect(json).not.toContain('recent_activity');
    expect(json).not.toContain('Buy AAPL');
    expect(json).not.toContain('investment_gain');
    expect(built.holdings).toHaveLength(3);
  });

  it('skips a missing metric instead of inventing a 0', () => {
    const partial = buildInvestorReviewMetrics({ summary: { cash: 100 } }, []);

    // the holdings count falls back to the number of holdings rows supplied (none here)
    expect(partial.metrics).toEqual({ cash_USD: 100, openHoldings_count: 0 });
    expect(partial.holdings).toEqual([]);
  });

  it('uses the portfolio currency in the keys', () => {
    const thb = buildInvestorReviewMetrics(
      { portfolio: { currency: 'THB' }, summary: { cash: 100 } },
      [],
    );

    expect(thb.currency).toBe('THB');
    expect(thb.metrics).toEqual({ cash_THB: 100, openHoldings_count: 0 });
  });
});

describe('buildTraderReviewMetrics', () => {
  it('labels trader figures with units', () => {
    const built = buildTraderReviewMetrics({
      portfolio: { currency: 'USD' },
      summary: {
        current_value: 10500,
        initial_balance: 10000,
        total_pnl: 500,
        total_pnl_percent: 5,
        total_trades: 20,
        wins: 12,
        losses: 8,
        breakeven: 0,
        win_rate: 60,
        profit_factor: 1.8523,
        average_pnl: 25,
      },
    });

    expect(built.metrics).toMatchObject({
      netProfitLoss_USD: 500,
      returnOnInitialBalance_percent: 5,
      winRate_percent: 60,
      profitFactor_ratio: 1.85,
      averageProfitLossPerTrade_USD: 25,
      totalTrades_count: 20,
    });
    expect(Object.keys(built.glossary).sort()).toEqual(
      Object.keys(built.metrics).sort(),
    );
  });

  it('omits an undefined profit factor (no losing trades)', () => {
    const built = buildTraderReviewMetrics({
      summary: { profit_factor: null, total_trades: 3 },
    });

    expect(built.metrics).toEqual({ totalTrades_count: 3 });
  });
});

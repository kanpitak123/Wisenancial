/**
 * Pre-computed, labelled metrics for the Portfolio Review prompt.
 *
 * The review used to receive the raw analytics overview and the raw holdings rows. Their
 * fields are not self-explanatory: `total_pnl` (realized + unrealized + dividends) sat next
 * to `unrealized_pnl`, and `unrealized_pnl_percent` is a percent (932.34) while
 * `total_pnl_percent` is a different percent on a different base. The model then described
 * "total profit 2,874.76" in one sentence and "unrealized profit 4,154.76" in another, with
 * nothing telling the reader those are different things.
 *
 * Here every number gets a unit in its key (`_USD`, `_percent`, `_count`, `_shares`) and a
 * one-line definition in `glossary`, is rounded once to 2 decimals, and is computed on our
 * side. The model quotes; it does not calculate.
 */

type Row = Record<string, unknown>;

export interface ReviewMetricBlock {
  /** Every value is a finite number, rounded to 2 decimals, with its unit in the key. */
  metrics: Record<string, number>;
  /** Plain-language definition of each metric key. */
  glossary: Record<string, string>;
}

export interface InvestorReviewMetrics extends ReviewMetricBlock {
  currency: string;
  holdings: Array<Record<string, string | number | null>>;
  /** Plain-language definition of each per-holding key. */
  holdingFields: Record<string, string>;
}

const round2 = (value: number): number => Math.round(value * 100) / 100;

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function asRow(value: unknown): Row {
  return value && typeof value === 'object' ? (value as Row) : {};
}

/** Adds `key` only when the source value is a real number, so a gap is a gap, not a 0. */
function put(
  block: ReviewMetricBlock,
  key: string,
  description: string,
  value: unknown,
): void {
  const parsed = num(value);
  if (parsed === null) return;

  block.metrics[key] = round2(parsed);
  block.glossary[key] = description;
}

export function buildInvestorReviewMetrics(
  analytics: unknown,
  holdings: readonly unknown[],
): InvestorReviewMetrics {
  const overview = asRow(analytics);
  const summary = asRow(overview.summary);
  const rows = holdings.map(asRow);

  const currency =
    (typeof asRow(overview.portfolio).currency === 'string'
      ? (asRow(overview.portfolio).currency as string)
      : null) ??
    (typeof rows[0]?.currency === 'string' ? rows[0].currency : null) ??
    'USD';
  const c = currency;

  const block: ReviewMetricBlock = { metrics: {}, glossary: {} };

  put(
    block,
    `portfolioValue_${c}`,
    'Total portfolio value: cash plus the market value of the shares currently held.',
    summary.current_value,
  );
  put(block, `cash_${c}`, 'Cash balance.', summary.cash);
  put(
    block,
    `holdingsMarketValue_${c}`,
    'Market value of the shares currently held.',
    summary.holdings_value,
  );
  put(
    block,
    `holdingsCostBasis_${c}`,
    'Amount originally paid for the shares currently held.',
    summary.invested_cost,
  );
  put(
    block,
    `contributedCapital_${c}`,
    'Money the investor put in: initial balance plus deposits minus withdrawals.',
    summary.contributed_capital,
  );
  put(
    block,
    `unrealizedProfitLoss_${c}`,
    'UNREALIZED profit/loss: paper gain on shares still held (market value minus cost basis). Not yet sold, so not locked in.',
    summary.unrealized_pnl,
  );
  put(
    block,
    `realizedProfitLoss_${c}`,
    'REALIZED profit/loss from completed sales, already locked in. Negative means sold shares lost money overall.',
    summary.realized_pnl,
  );
  put(
    block,
    `dividendIncome_${c}`,
    'Dividend income received.',
    summary.dividend_income,
  );
  put(
    block,
    `totalProfitLoss_${c}`,
    'TOTAL profit/loss since inception = realized + unrealized + dividends. Differs from the unrealized figure whenever realized results or dividends are not zero.',
    summary.total_pnl,
  );
  put(
    block,
    'totalReturn_percent',
    'Total return on contributed capital: total profit/loss divided by contributed capital, in percent.',
    summary.total_pnl_percent,
  );
  put(
    block,
    'openHoldings_count',
    'Number of different stocks currently held.',
    summary.open_holdings ?? rows.length,
  );
  put(
    block,
    'closedSales_count',
    'Number of completed sales.',
    summary.closed_sales,
  );

  const holdingsValue = rows.reduce(
    (sum, row) => sum + (num(row.market_value) ?? 0),
    0,
  );

  const perHolding = rows.map((row) => {
    const marketValue = num(row.market_value);
    const weight =
      marketValue !== null && holdingsValue > 0
        ? round2((marketValue / holdingsValue) * 100)
        : null;
    const round = (value: unknown) => {
      const parsed = num(value);
      return parsed === null ? null : round2(parsed);
    };

    return {
      symbol: typeof row.symbol === 'string' ? row.symbol : null,
      sharesHeld_shares: round(row.remaining_shares),
      [`averageCostPerShare_${c}`]: round(row.average_cost),
      [`currentPrice_${c}`]: round(row.current_price),
      [`costBasis_${c}`]: round(row.cost_basis),
      [`marketValue_${c}`]: round(row.market_value),
      [`unrealizedProfitLoss_${c}`]: round(row.unrealized_pnl),
      unrealizedReturn_percent: round(row.unrealized_pnl_percent),
      weightInHoldings_percent: weight,
    };
  });

  return {
    currency: c,
    ...block,
    holdings: perHolding,
    holdingFields: {
      sharesHeld_shares: 'Number of shares currently held.',
      [`averageCostPerShare_${c}`]: 'Average price paid per share.',
      [`currentPrice_${c}`]: 'Latest market price per share.',
      [`costBasis_${c}`]: 'Amount originally paid for the shares held.',
      [`marketValue_${c}`]: 'Current market value of the shares held.',
      [`unrealizedProfitLoss_${c}`]:
        'Unrealized profit/loss on this holding (market value minus cost basis).',
      unrealizedReturn_percent:
        'Unrealized profit/loss divided by cost basis, in percent (932.34 means +932.34%).',
      weightInHoldings_percent:
        "This holding's share of the total market value of all holdings, in percent.",
    },
  };
}

export function buildTraderReviewMetrics(
  analytics: unknown,
): ReviewMetricBlock & { currency: string } {
  const overview = asRow(analytics);
  const summary = asRow(overview.summary);
  const currency =
    typeof asRow(overview.portfolio).currency === 'string'
      ? (asRow(overview.portfolio).currency as string)
      : 'USD';
  const c = currency;

  const block: ReviewMetricBlock = { metrics: {}, glossary: {} };

  put(
    block,
    `currentBalance_${c}`,
    'Current account balance.',
    summary.current_value,
  );
  put(
    block,
    `initialBalance_${c}`,
    'Balance the account started with.',
    summary.initial_balance,
  );
  put(
    block,
    `netProfitLoss_${c}`,
    'Net profit/loss of all closed trades in the period.',
    summary.total_pnl,
  );
  put(
    block,
    'returnOnInitialBalance_percent',
    'Net profit/loss divided by the initial balance, in percent.',
    summary.total_pnl_percent,
  );
  put(
    block,
    'totalTrades_count',
    'Number of closed trades.',
    summary.total_trades,
  );
  put(block, 'wins_count', 'Number of winning trades.', summary.wins);
  put(block, 'losses_count', 'Number of losing trades.', summary.losses);
  put(
    block,
    'breakeven_count',
    'Number of breakeven trades.',
    summary.breakeven,
  );
  put(
    block,
    'winRate_percent',
    'Winning trades divided by all closed trades, in percent.',
    summary.win_rate,
  );
  put(
    block,
    'profitFactor_ratio',
    'Gross profit divided by gross loss (above 1 means profits exceed losses).',
    summary.profit_factor,
  );
  put(
    block,
    `averageProfitLossPerTrade_${c}`,
    'Average profit/loss per closed trade.',
    summary.average_pnl,
  );

  return { currency: c, ...block };
}

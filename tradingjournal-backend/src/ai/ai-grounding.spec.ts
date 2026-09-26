import {
  assessNumericGrounding,
  collectPayloadNumbers,
  extractFigures,
} from './ai-grounding';

const payload = {
  metrics: {
    portfolioValue_USD: 22874.76,
    unrealizedProfitLoss_USD: 4154.76,
    realizedProfitLoss_USD: -1280,
    totalProfitLoss_USD: 2874.76,
    totalReturn_percent: 14.37,
    openHoldings_count: 3,
  },
  holdings: [
    {
      symbol: 'MSFT',
      unrealizedReturn_percent: 932.34,
      weightInHoldings_percent: 44.08,
    },
  ],
};

const figures = (text: string) => extractFigures(text).map((f) => f.literal);

describe('extractFigures', () => {
  it('finds percent, money and separated/decimal numbers', () => {
    expect(
      figures('MSFT returned 932.34% and total profit was 2,874.76'),
    ).toEqual(['932.34', '2,874.76']);
    expect(figures('cash of $17020 and 5,854 USD')).toEqual(['17020', '5,854']);
  });

  it('ignores counts, years and labels', () => {
    expect(figures('3 holdings across 2 sectors')).toEqual([]);
    expect(figures('since 2026, in Q3 and on MT5')).toEqual([]);
    expect(figures('score 72/100')).toEqual([]);
  });

  it('counts a plain integer of 1,000 or more, and any % even when small', () => {
    expect(figures('lost 1280 overall')).toEqual(['1280']);
    expect(figures('up 12%')).toEqual(['12']);
  });

  it('works in Thai text', () => {
    expect(figures('กำไรรวม 2,874.76 ดอลลาร์ หรือ 14.37%')).toEqual([
      '2,874.76',
      '14.37',
    ]);
  });
});

describe('collectPayloadNumbers', () => {
  it('collects numbers, numeric strings and absolute values from anywhere', () => {
    const numbers = collectPayloadNumbers({
      a: -1280,
      nested: [{ b: '750' }, { c: 'Buy AAPL 5 shares' }],
    });

    expect(numbers).toEqual(expect.arrayContaining([1280, 750, 5]));
  });
});

describe('assessNumericGrounding', () => {
  it('accepts figures quoted from the payload (the real qa@ review numbers)', () => {
    const answer = {
      summary:
        'Total profit/loss since inception is 2,874.76 USD (14.37% on contributed capital), of which unrealized profit is 4,154.76 and realized is -1,280.',
      strengths: ['MSFT is up 932.34% on cost and is 44.08% of holdings.'],
    };

    expect(assessNumericGrounding(answer, payload).ok).toBe(true);
  });

  it('accepts rounding to the precision the answer used', () => {
    const answer = {
      summary:
        'MSFT is up about 932% and the portfolio is worth roughly 22,875 USD.',
    };

    expect(assessNumericGrounding(answer, payload).ok).toBe(true);
  });

  it('accepts a loss quoted without its sign', () => {
    expect(
      assessNumericGrounding(
        { summary: 'Realized loss of 1,280.00 USD.' },
        payload,
      ).ok,
    ).toBe(true);
  });

  it('rejects a figure that is not in the payload', () => {
    const verdict = assessNumericGrounding(
      { summary: 'The portfolio gained 15.5% this year.' },
      payload,
    );

    expect(verdict.ok).toBe(false);
    expect(verdict.ungrounded).toEqual(['15.5']);
  });

  it('rejects a recomputed figure even when the parts are in the payload', () => {
    // 4,154.76 + 2,874.76 = 7,029.52: the model added two payload numbers
    const verdict = assessNumericGrounding(
      { summary: 'Combined that is 7,029.52 USD.' },
      payload,
    );

    expect(verdict.ok).toBe(false);
    expect(verdict.ungrounded).toEqual(['7,029.52']);
  });

  it('rejects a percent that was converted from a ratio', () => {
    expect(
      assessNumericGrounding(
        { summary: 'Weight is 0.4408% of holdings.' },
        payload,
      ).ok,
    ).toBe(false);
  });

  it('is not fooled by a rounding that is too coarse to be the same number', () => {
    // 4,154.76 written as 4,200.00 is a different number, not a rounding of it
    expect(
      assessNumericGrounding(
        { summary: 'Unrealized profit is 4,200.00.' },
        payload,
      ).ok,
    ).toBe(false);
  });

  it('looks inside arrays and nested objects of the answer', () => {
    const verdict = assessNumericGrounding(
      {
        strengths: ['fine'],
        deeper: { note: 'A 99.5% win rate is impressive.' },
      },
      payload,
    );

    expect(verdict.ok).toBe(false);
  });

  it('passes an answer with no figures at all', () => {
    expect(
      assessNumericGrounding(
        { summary: 'The portfolio is concentrated in three large-cap stocks.' },
        payload,
      ).ok,
    ).toBe(true);
  });
});

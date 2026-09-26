import { assessKeyNameLeak } from './ai-key-leak';
import { buildInvestorReviewMetrics } from './portfolio-review-metrics';
import { labelFor } from './review-labels';

const payload = buildInvestorReviewMetrics(
  {
    portfolio: { currency: 'USD' },
    summary: {
      current_value: 22874.76,
      unrealized_pnl: 4154.76,
      realized_pnl: -1280,
      total_pnl: 2874.76,
      total_pnl_percent: 14.37,
    },
  },
  [{ symbol: 'MSFT', market_value: 2580.85, currency: 'USD' }],
  'th',
);

describe('assessKeyNameLeak', () => {
  it('accepts clean Thai prose with the plain-language labels', () => {
    const answer = {
      summary:
        'กำไร/ขาดทุนรวม 2,874.76 ดอลลาร์ ประกอบด้วยกำไร/ขาดทุนที่ยังไม่รับรู้ 4,154.76 และกำไร/ขาดทุนที่รับรู้แล้ว -1,280 ส่วน MSFT มี P/E สูง',
    };

    expect(assessKeyNameLeak(answer, payload).ok).toBe(true);
  });

  it.each([
    [
      'ALL-CAPS emphasis (the reported bug)',
      'ผลตอบแทน UNREALIZED ของพอร์ตนี้สูงมากเมื่อเทียบกับต้นทุน',
      'UNREALIZED',
    ],
    [
      'ALL-CAPS TOTAL',
      'กำไร TOTAL ของพอร์ตนี้อยู่ที่ 2,874.76 ดอลลาร์ตั้งแต่เริ่มต้น',
      'TOTAL',
    ],
    [
      'ALL-CAPS REALIZED',
      'ส่วนที่ REALIZED แล้วเป็นผลขาดทุนจากการขายหุ้นหลายรายการ',
      'REALIZED',
    ],
    [
      'underscore key',
      'ค่า totalProfitLoss_USD ของพอร์ตนี้เป็นบวกและสูงกว่าเงินทุนที่ใส่เข้ามา',
      'totalProfitLoss_USD',
    ],
    [
      'snake_case field',
      'ตัวเลข total_pnl_percent แสดงผลตอบแทนที่ดีเมื่อเทียบกับเงินทุนเริ่มต้น',
      'total_pnl_percent',
    ],
    [
      'camelCase key from the payload',
      'พอร์ตมี unrealizedProfitLoss สูงกว่ากำไรที่รับรู้แล้วมากในตอนนี้',
      'unrealizedProfitLoss',
    ],
  ])('rejects %s', (_name, text, token) => {
    const verdict = assessKeyNameLeak({ summary: text }, payload);

    expect(verdict.ok).toBe(false);
    expect(verdict.found).toContain(token);
  });

  it('allows tickers and enums the payload itself contains', () => {
    const answer = {
      summary:
        'MSFT มีน้ำหนักสูงที่สุดในพอร์ตหุ้น และควรติดตามความเสี่ยงจากการกระจุกตัวต่อไป',
    };

    expect(assessKeyNameLeak(answer, payload).ok).toBe(true);
  });

  it('allows currency codes and known abbreviations', () => {
    const answer = {
      summary:
        'มูลค่าพอร์ต 22,874.76 USD และหุ้นบางตัวจดทะเบียนใน NASDAQ ซึ่งมีความผันผวนสูงกว่าตลาดโดยรวม',
    };

    expect(assessKeyNameLeak(answer, payload).ok).toBe(true);
  });

  it('ignores short values such as enums and labels', () => {
    expect(
      assessKeyNameLeak({ riskProfile: 'MODERATE', symbol: 'AAPL' }, payload)
        .ok,
    ).toBe(true);
  });

  it('looks inside arrays and nested objects', () => {
    const verdict = assessKeyNameLeak(
      {
        strengths: ['fine sentence about diversification here'],
        deeper: { note: 'The UNREALIZED gain is large across holdings.' },
      },
      payload,
    );

    expect(verdict.ok).toBe(false);
  });
});

describe('review labels', () => {
  it('th: the four labels the product wants', () => {
    expect(labelFor('unrealizedProfitLoss_USD', 'th')).toBe(
      'กำไร/ขาดทุนที่ยังไม่รับรู้',
    );
    expect(labelFor('realizedProfitLoss_USD', 'th')).toBe(
      'กำไร/ขาดทุนที่รับรู้แล้ว',
    );
    expect(labelFor('totalProfitLoss_USD', 'th')).toBe('กำไร/ขาดทุนรวม');
    expect(labelFor('totalReturn_percent', 'th')).toBe('ผลตอบแทนรวม');
  });

  it('en: unrealized / realized / total P&L and total return', () => {
    expect(labelFor('unrealizedProfitLoss_USD', 'en')).toBe('unrealized P&L');
    expect(labelFor('realizedProfitLoss_USD', 'en')).toBe('realized P&L');
    expect(labelFor('totalProfitLoss_USD', 'en')).toBe('total P&L');
    expect(labelFor('totalReturn_percent', 'en')).toBe('total return');
  });

  it('the payload carries the labels for exactly the metrics it sends, per locale', () => {
    for (const language of ['th', 'en'] as const) {
      const built = buildInvestorReviewMetrics(
        { summary: { unrealized_pnl: 1, total_pnl_percent: 2 } },
        [{ symbol: 'A', market_value: 1 }],
        language,
      );

      expect(Object.keys(built.labels).sort()).toEqual(
        Object.keys(built.metrics).sort(),
      );
      expect(built.labels.unrealizedProfitLoss_USD).toBe(
        labelFor('unrealizedProfitLoss_USD', language),
      );
      expect(Object.keys(built.holdingLabels).sort()).toEqual(
        Object.keys(built.holdingFields).sort(),
      );
    }
  });

  it('every label is plain words: no underscore, camelCase or ALL-CAPS', () => {
    const built = buildInvestorReviewMetrics(
      {
        summary: {
          current_value: 1,
          cash: 1,
          invested_cost: 1,
          holdings_value: 1,
          realized_pnl: 1,
          unrealized_pnl: 1,
          dividend_income: 1,
          total_pnl: 1,
          total_pnl_percent: 1,
          contributed_capital: 1,
          open_holdings: 1,
          closed_sales: 1,
        },
      },
      [{ symbol: 'A', market_value: 1 }],
      'en',
    );

    for (const label of [
      ...Object.values(built.labels),
      ...Object.values(built.holdingLabels),
    ]) {
      expect(label).not.toMatch(/_|[a-z][A-Z]|\b[A-Z]{4,}\b/);
    }
  });
});

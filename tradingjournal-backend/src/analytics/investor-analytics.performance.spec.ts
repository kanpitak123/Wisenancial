import { InvestorAnalyticsService } from './investor-analytics.service';

/**
 * กราฟ "การเติบโต" ของพอร์ตหุ้น
 *
 * ของเดิมเดินเฉพาะ cash ledger — ซื้อหุ้นแล้วเงินสดลด เส้นกราฟก็ดิ่งลงทั้งที่แค่ย้ายเงิน
 * จากเงินสดไปเป็นหุ้น พอร์ตที่มีกำไร unrealized จึงเห็นกราฟแบนหรือลดลง
 * เทสนี้ล็อกไว้ว่าค่าที่คืนต้องเป็น total equity = เงินสด + มูลค่าตลาดของหุ้นที่ถืออยู่
 */

const PORTFOLIO = {
  id: 1,
  user_id: 9,
  portfolio_type: 'INVESTOR',
  initial_balance: 10_000,
  current_balance: 5_000,
};

interface Deps {
  records?: unknown[];
  purchases?: unknown[];
  sales?: unknown[];
  quotes?: Record<string, number | null>;
}

function buildService({ records = [], purchases = [], sales = [], quotes = {} }: Deps) {
  const prisma = {
    portfolios: { findFirst: jest.fn().mockResolvedValue(PORTFOLIO) },
    stock_purchases: { findMany: jest.fn().mockResolvedValue(purchases) },
    stock_sales: { findMany: jest.fn().mockResolvedValue(sales) },
  };

  const recordsService = { findAll: jest.fn().mockResolvedValue(records) };
  const market = { getQuotes: jest.fn().mockResolvedValue(quotes) };

  const service = new InvestorAnalyticsService(
    prisma as any,
    {} as any,
    recordsService as any,
    market as any,
  );

  return { service, prisma, recordsService, market };
}

const buyRecord = (amount: number, at: string) => ({
  amount,
  occurred_at: new Date(at),
  type: 'BUY',
});

describe('InvestorAnalyticsService.performance', () => {
  it('ซื้อหุ้นแล้วมูลค่ารวมต้องไม่ลดลง — เงินสดที่หายไปกลายเป็นหุ้น', async () => {
    const { service } = buildService({
      // จ่ายเงินสด 3,000 ซื้อ NVDA 30 หุ้น (ต้นทุน 100/หุ้น)
      records: [buyRecord(-3_000, '2026-06-01')],
      purchases: [
        {
          stock_symbol: 'NVDA',
          shares_count: 30,
          total_amount: 3_000,
          purchase_date: new Date('2026-06-01'),
        },
      ],
      quotes: { NVDA: 100 },
    });

    const points = await service.performance(1, 9, 'ALL');
    const last = points[points.length - 1];

    // 10,000 - 3,000 เงินสด + 30 × 100 มูลค่าหุ้น = 10,000 เท่าเดิม
    expect(last.value).toBe(10_000);
  });

  it('ราคาตลาดขึ้น -> กราฟโตตามกำไร unrealized', async () => {
    const { service } = buildService({
      records: [buyRecord(-3_000, '2026-06-01')],
      purchases: [
        {
          stock_symbol: 'NVDA',
          shares_count: 30,
          total_amount: 3_000,
          purchase_date: new Date('2026-06-01'),
        },
      ],
      // ราคาขึ้นจาก 100 เป็น 150
      quotes: { NVDA: 150 },
    });

    const points = await service.performance(1, 9, 'ALL');
    const last = points[points.length - 1];

    // 7,000 เงินสด + 30 × 150 = 11,500
    expect(last.value).toBe(11_500);
  });

  it('ขายหุ้นออก -> จำนวนหุ้นถูกหักออกจากมูลค่ารวม ไม่นับซ้ำกับเงินสดที่ได้', async () => {
    const { service } = buildService({
      records: [
        buyRecord(-3_000, '2026-06-01'),
        // ขาย 10 หุ้นได้เงินสดกลับ 1,500
        { amount: 1_500, occurred_at: new Date('2026-07-01'), type: 'SELL' },
      ],
      purchases: [
        {
          stock_symbol: 'NVDA',
          shares_count: 30,
          total_amount: 3_000,
          purchase_date: new Date('2026-06-01'),
        },
      ],
      sales: [
        {
          stock_symbol: 'NVDA',
          shares_sold: 10,
          sold_date: new Date('2026-07-01'),
        },
      ],
      quotes: { NVDA: 150 },
    });

    const points = await service.performance(1, 9, 'ALL');
    const last = points[points.length - 1];

    // เงินสด 10,000 - 3,000 + 1,500 = 8,500 | หุ้นเหลือ 20 × 150 = 3,000 -> 11,500
    expect(last.value).toBe(11_500);
  });

  it('ดึงราคาตลาดไม่ได้ (null) -> ตีด้วยต้นทุนเฉลี่ย ไม่ใช่ 0', async () => {
    const { service } = buildService({
      records: [buyRecord(-3_000, '2026-06-01')],
      purchases: [
        {
          stock_symbol: 'NVDA',
          shares_count: 30,
          total_amount: 3_000,
          purchase_date: new Date('2026-06-01'),
        },
      ],
      quotes: { NVDA: null },
    });

    const points = await service.performance(1, 9, 'ALL');
    const last = points[points.length - 1];

    // ต้นทุนเฉลี่ย 100/หุ้น -> 7,000 + 3,000 = 10,000 (ไม่ใช่ 7,000)
    expect(last.value).toBe(10_000);
  });

  it('timeframe ตัดช่วง -> จุดตั้งต้นต้องสะท้อนสถานะจริง ไม่ใช่ initial_balance เปล่าๆ', async () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

    const { service } = buildService({
      records: [
        // ก่อนช่วง 1W — ต้องถูก replay เงียบๆ ไม่ปล่อยจุดออกมา
        buyRecord(-3_000, '2020-01-01'),
        { amount: -500, occurred_at: twoDaysAgo, type: 'WITHDRAW' },
      ],
      purchases: [
        {
          stock_symbol: 'NVDA',
          shares_count: 30,
          total_amount: 3_000,
          purchase_date: new Date('2020-01-01'),
        },
      ],
      quotes: { NVDA: 100 },
    });

    const points = await service.performance(1, 9, '1W');

    expect(points[0].event).toBe('START');
    // จุดตั้งต้น: เงินสด 7,000 + หุ้น 3,000 = 10,000 (ไม่ใช่ 10,000 จาก initial_balance เฉยๆ
    // แต่เป็นเพราะ replay ของเก่ามาแล้ว) จากนั้นถอน 500 เหลือ 9,500
    expect(points[0].value).toBe(10_000);
    expect(points[points.length - 1].value).toBe(9_500);
    // record ปี 2020 ต้องไม่โผล่เป็นจุดบนกราฟ
    expect(points).toHaveLength(2);
  });

  it('พอร์ตเปล่า -> คืนจุด START จุดเดียวด้วยยอดตั้งต้น', async () => {
    const { service, market } = buildService({});

    const points = await service.performance(1, 9, 'ALL');

    expect(points).toHaveLength(1);
    expect(points[0].value).toBe(10_000);
    // ไม่มีหุ้นเลย ก็ไม่ต้องยิงขอราคา
    expect(market.getQuotes).not.toHaveBeenCalled();
  });
});

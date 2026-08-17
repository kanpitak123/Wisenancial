import { describe, expect, it } from 'vitest';
import {
  assetClassOf,
  buildActivityCsv,
  buildDividendCsv,
  buildHoldingsCsv,
  buildRealizedPnlCsv,
  escapeCsvValue,
  toCsv,
} from './csv-export';
import type { Dividend } from 'src/types/dividend.types';
import type {
  InvestorActivity,
  InvestorSale,
  StockPurchase,
} from 'src/types/investor-portfolio.types';

function purchase(overrides: Partial<StockPurchase> = {}): StockPurchase {
  return {
    id: 1,
    portfolio_id: 2,
    stock_symbol: 'PTT.BK',
    stock_name: 'PTT Public Company',
    shares_count: 100,
    remaining_shares: 80,
    purchase_price: 35.5,
    total_amount: 3550,
    fees: 5.32,
    currency: 'THB',
    purchase_reason: null,
    expectation: null,
    target_price: 44,
    stop_loss: 30,
    strategy: 'dividend',
    emotion: 'confident',
    notes: null,
    folder_name: 'หุ้นปันผล',
    status: 'OPEN',
    sold_price: null,
    sold_date: null,
    closed_at: null,
    purchase_date: '2026-03-15T10:00:00.000Z',
    created_at: '2026-03-15T10:00:00.000Z',
    updated_at: '2026-03-15T10:00:00.000Z',
    ...overrides,
  };
}

function sale(overrides: Partial<InvestorSale> = {}): InvestorSale {
  return {
    id: 1,
    portfolio_id: 2,
    stock_symbol: 'AAPL',
    shares_count: 10,
    sold_price: 210,
    gross_amount: 2100,
    fees: 3,
    cost_basis: 1800,
    realized_pnl: 297,
    cost_method: 'FIFO',
    sold_date: '2026-05-20T10:00:00.000Z',
    notes: null,
    ...overrides,
  };
}

describe('escapeCsvValue', () => {
  it('ครอบด้วยเครื่องหมายคำพูดเสมอ', () => {
    expect(escapeCsvValue('AAPL')).toBe('"AAPL"');
    expect(escapeCsvValue(123)).toBe('"123"');
  });

  it('null/undefined กลายเป็นช่องว่าง', () => {
    expect(escapeCsvValue(null)).toBe('""');
    expect(escapeCsvValue(undefined)).toBe('""');
  });

  it('escape เครื่องหมายคำพูดซ้อนแบบ RFC 4180', () => {
    expect(escapeCsvValue('เขา"บอก"ว่า')).toBe('"เขา""บอก""ว่า"');
  });

  it('ค่าที่มีคอมมาไม่ทำให้คอลัมน์เพี้ยน', () => {
    const csv = toCsv(['A', 'B'], [['x,y', 'z']]);

    expect(csv).toBe('"A","B"\r\n"x,y","z"');
    expect(csv.split('\r\n')[1]).toBe('"x,y","z"');
  });
});

describe('assetClassOf', () => {
  it('.BK = หุ้นไทย', () => {
    expect(assetClassOf('PTT.BK')).toBe('หุ้นไทย');
    expect(assetClassOf('kbank.bk')).toBe('หุ้นไทย');
  });

  it('อื่นๆ = หุ้นต่างประเทศ', () => {
    expect(assetClassOf('AAPL')).toBe('หุ้นต่างประเทศ');
  });
});

describe('buildHoldingsCsv', () => {
  it('มีหัวตารางครบและหนึ่งบรรทัดต่อหนึ่ง lot', () => {
    const csv = buildHoldingsCsv([purchase(), purchase({ id: 2 })], 'THB');
    const lines = csv.split('\r\n');

    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain('"Symbol"');
    expect(lines[0]).toContain('"Target Price"');
    expect(lines[0]).toContain('"Folder"');
  });

  it('ใส่ค่าที่สำคัญครบถ้วน', () => {
    const csv = buildHoldingsCsv([purchase()], 'THB');
    const row = csv.split('\r\n')[1] ?? '';

    expect(row).toContain('"PTT.BK"');
    expect(row).toContain('"หุ้นไทย"');
    expect(row).toContain('"หุ้นปันผล"');
    expect(row).toContain('"80"'); // remaining_shares ไม่ใช่ shares_count
    expect(row).toContain('"44"');
    expect(row).toContain('"30"');
    expect(row).toContain('"THB"');
    expect(row).toContain('"2026-03-15"');
  });

  it('target/stop เป็น null -> เว้นว่าง ไม่ใช่ 0', () => {
    const csv = buildHoldingsCsv([purchase({ target_price: null, stop_loss: null })], 'THB');
    const row = csv.split('\r\n')[1] ?? '';

    expect(row).toContain('""');
    expect(row).not.toContain('"0"');
  });

  it('ลิสต์ว่าง -> เหลือแค่หัวตาราง', () => {
    expect(buildHoldingsCsv([], 'THB').split('\r\n')).toHaveLength(1);
  });
});

describe('buildRealizedPnlCsv', () => {
  it('มีหัวตารางและข้อมูลกำไรที่รับรู้', () => {
    const csv = buildRealizedPnlCsv([sale()], 'USD');
    const [header, row] = csv.split('\r\n');

    expect(header).toContain('"Realized P/L"');
    expect(header).toContain('"Cost Method"');
    expect(row).toContain('"AAPL"');
    expect(row).toContain('"หุ้นต่างประเทศ"');
    expect(row).toContain('"297"');
    expect(row).toContain('"FIFO"');
    expect(row).toContain('"2026-05-20"');
  });

  it('cost_method ว่าง -> ใช้ FIFO เป็นค่าเริ่มต้น', () => {
    const withoutCostMethod = sale();

    delete withoutCostMethod.cost_method;

    const csv = buildRealizedPnlCsv([withoutCostMethod], 'USD');

    expect(csv.split('\r\n')[1]).toContain('"FIFO"');
  });

  it('ขาดทุน -> ตัวเลขติดลบถูกเก็บไว้', () => {
    const csv = buildRealizedPnlCsv([sale({ realized_pnl: -150.25 })], 'USD');

    expect(csv.split('\r\n')[1]).toContain('"-150.25"');
  });
});

function activity(overrides: Partial<InvestorActivity> = {}): InvestorActivity {
  return {
    id: 11,
    type: 'BUY',
    amount: -3550,
    symbol: 'PTT.BK',
    description: 'ซื้อ PTT.BK 100 หุ้น',
    occurred_at: '2026-03-15T09:30:00.000Z',
    source: 'STOCK_PURCHASE',
    status: 'ACTIVE',
    ...overrides,
  };
}

function dividend(overrides: Partial<Dividend> = {}): Dividend {
  return {
    id: 21,
    user_id: 1,
    portfolio_id: 2,
    symbol: 'PTT.BK',
    name: 'PTT Public Company',
    payment_date: '2026-04-25T00:00:00.000Z',
    shares: 100,
    dividend_per_share: 2.25,
    wht_rate: 0.1,
    gross_amount: 225,
    tax_withheld: 22.5,
    net_amount: 202.5,
    status: 'ACTIVE',
    created_at: null,
    updated_at: null,
    ...overrides,
  };
}

describe('buildActivityCsv', () => {
  it('หนึ่งบรรทัดต่อหนึ่งกิจกรรม พร้อมหัวตาราง', () => {
    const csv = buildActivityCsv([activity(), activity({ id: 12 })], 'THB');
    const lines = csv.split('\r\n');

    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain('"Date"');
    expect(lines[0]).toContain('"Amount"');
  });

  it('เก็บวันที่แบบ date-only และยอดติดลบไว้ครบ', () => {
    const row = buildActivityCsv([activity()], 'THB').split('\r\n')[1] ?? '';

    expect(row).toContain('"2026-03-15"');
    expect(row).toContain('"BUY"');
    expect(row).toContain('"PTT.BK"');
    expect(row).toContain('"-3550"');
    expect(row).toContain('"THB"');
  });

  it('กิจกรรมที่ไม่ผูกกับหุ้น (ฝาก/ถอน) -> ช่อง symbol ว่าง ไม่ใช่ null', () => {
    const row =
      buildActivityCsv([activity({ type: 'DEPOSIT', symbol: null, description: null })], 'THB').split(
        '\r\n',
      )[1] ?? '';

    expect(row).toContain('"DEPOSIT"');
    expect(row).not.toContain('null');
  });

  it('ไม่มีกิจกรรม -> เหลือแต่หัวตาราง', () => {
    expect(buildActivityCsv([], 'THB').split('\r\n')).toHaveLength(1);
  });
});

describe('buildDividendCsv', () => {
  it('มีหัวตารางและยอด gross/tax/net ครบ', () => {
    const csv = buildDividendCsv([dividend()], 'THB');
    const [header, row] = csv.split('\r\n');

    expect(header).toContain('"Net Amount"');
    expect(header).toContain('"Tax Withheld"');
    expect(row).toContain('"PTT.BK"');
    expect(row).toContain('"หุ้นไทย"');
    expect(row).toContain('"225"');
    expect(row).toContain('"22.5"');
    expect(row).toContain('"202.5"');
    expect(row).toContain('"2026-04-25"');
  });

  it('ค่าที่ backend ส่งมาเป็น string ก็แปลงเป็นตัวเลขได้', () => {
    const row =
      buildDividendCsv([dividend({ shares: '100', net_amount: '202.50' })], 'THB').split(
        '\r\n',
      )[1] ?? '';

    expect(row).toContain('"100"');
    expect(row).toContain('"202.5"');
  });

  it('ไม่มีปันผล -> เหลือแต่หัวตาราง', () => {
    expect(buildDividendCsv([], 'THB').split('\r\n')).toHaveLength(1);
  });
});

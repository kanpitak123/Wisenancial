import { DividendsService } from './dividends.service';

/**
 * GET /dividends/portfolio/:id/tax-summary — endpoint ใหม่สำหรับรายงานภาษีเงินปันผล
 *
 * ต่างจาก summary() เดิมตรงที่คืน records[] ออกไปด้วย และใช้ชื่อฟิลด์ camelCase ตาม
 * contract ที่ DividendTaxCard ฝั่ง frontend คาดหวัง
 */

const PORTFOLIO = { id: 3, user_id: 8, portfolio_type: 'INVESTOR', currency: 'THB' };

function buildService(rows: unknown[]) {
  const prisma = {
    portfolios: { findFirst: jest.fn().mockResolvedValue(PORTFOLIO) },
    dividends: { findMany: jest.fn().mockResolvedValue(rows) },
  };

  return { service: new DividendsService(prisma as any), prisma };
}

const dividend = (
  id: number,
  symbol: string,
  paymentDate: string,
  gross: number,
  whtRate = 0.1,
) => ({
  id,
  symbol,
  name: `${symbol} PCL`,
  payment_date: new Date(paymentDate),
  shares: 1_000,
  dividend_per_share: gross / 1_000,
  wht_rate: whtRate,
  gross_amount: gross,
  tax_withheld: gross * whtRate,
  net_amount: gross - gross * whtRate,
});

describe('DividendsService.taxSummary', () => {
  it('รวม gross / ภาษีหัก / สุทธิ และคืนรายการทั้งหมด', async () => {
    const { service } = buildService([
      dividend(1, 'PTT.BK', '2026-03-10', 10_000),
      dividend(2, 'KBANK.BK', '2026-08-05', 5_000),
    ]);

    const result = await service.taxSummary(3, 8, 2026);

    expect(result.year).toBe(2026);
    expect(result.records).toHaveLength(2);
    expect(result.totalGross).toBe(15_000);
    expect(result.totalTaxWithheld).toBe(1_500);
    expect(result.totalNet).toBe(13_500);
  });

  it('แปลงฟิลด์เป็น camelCase และตัดเวลาออกจากวันที่จ่าย', async () => {
    const { service } = buildService([dividend(1, 'PTT.BK', '2026-03-10', 10_000)]);

    const record = (await service.taxSummary(3, 8, 2026)).records[0];

    expect(record).toMatchObject({
      id: 1,
      symbol: 'PTT.BK',
      name: 'PTT.BK PCL',
      paymentDate: '2026-03-10',
      shares: 1_000,
      grossAmount: 10_000,
      whtRate: 0.1,
      taxWithheld: 1_000,
      netAmount: 9_000,
    });
  });

  it('กรองเฉพาะปีที่เลือก (ส่งช่วงวันที่ให้ prisma ไม่ใช่กรองในหน่วยความจำ)', async () => {
    const { service, prisma } = buildService([]);

    await service.taxSummary(3, 8, 2025);

    const where = prisma.dividends.findMany.mock.calls[0][0].where;

    expect(where.payment_date.gte).toEqual(new Date('2025-01-01T00:00:00.000Z'));
    expect(where.payment_date.lt).toEqual(new Date('2026-01-01T00:00:00.000Z'));
    expect(where.status).toBe('ACTIVE');
  });

  it('ไม่ส่งปีมา -> ใช้ปีปัจจุบัน', async () => {
    const { service } = buildService([]);

    const result = await service.taxSummary(3, 8);

    expect(result.year).toBe(new Date().getFullYear());
  });

  it('แยกยอดตามอัตราภาษีหัก ณ ที่จ่าย เรียงจากน้อยไปมาก', async () => {
    const { service } = buildService([
      dividend(1, 'PTT.BK', '2026-03-10', 10_000, 0.1),
      dividend(2, 'AAPL', '2026-04-10', 4_000, 0.15),
      dividend(3, 'KBANK.BK', '2026-05-10', 6_000, 0.1),
    ]);

    const result = await service.taxSummary(3, 8, 2026);

    expect(result.byWhtRate).toEqual([
      { whtRate: 0.1, count: 2, grossAmount: 16_000, taxWithheld: 1_600 },
      { whtRate: 0.15, count: 1, grossAmount: 4_000, taxWithheld: 600 },
    ]);
  });

  it('ไม่มีเงินปันผลในปีนั้น -> ยอดรวมเป็น 0 ไม่ใช่ null และ records ว่าง', async () => {
    const { service } = buildService([]);

    const result = await service.taxSummary(3, 8, 2026);

    expect(result.records).toEqual([]);
    expect(result.totalGross).toBe(0);
    expect(result.totalTaxWithheld).toBe(0);
    expect(result.totalNet).toBe(0);
    expect(result.byWhtRate).toEqual([]);
  });

  it('พอร์ตไม่ใช่ของผู้ใช้ -> โยน NotFound ก่อนแตะข้อมูลเงินปันผล', async () => {
    const { service, prisma } = buildService([]);

    prisma.portfolios.findFirst.mockResolvedValue(null);

    await expect(service.taxSummary(3, 99, 2026)).rejects.toThrow();
    expect(prisma.dividends.findMany).not.toHaveBeenCalled();
  });
});

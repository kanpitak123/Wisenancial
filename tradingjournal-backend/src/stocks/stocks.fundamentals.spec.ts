import { StocksController } from './stocks.controller';
import type { MarketDataService, RiskFundamental } from './market-data.service';
import type { StocksService } from './stocks.service';

/**
 * GET /stocks/fundamentals — P/E + beta หลาย symbol ในคำขอเดียว
 *
 * มีไว้ให้การ์ด AI Risk Analysis เรียกทีเดียวจบ ไม่ต้องวนยิงทีละหุ้น
 * (เดิมไม่มี endpoint แบบนี้เลย หน้าบ้านจึงส่ง beta/P-E เป็น null มาตลอด)
 */
function makeController(found: Map<string, RiskFundamental>) {
  const getRiskFundamentals = jest.fn().mockResolvedValue(found);

  const controller = new StocksController(
    { getRiskFundamentals } as unknown as MarketDataService,
    {} as unknown as StocksService,
  );

  return { controller, getRiskFundamentals };
}

describe('StocksController.getRiskFundamentals', () => {
  it('คืนค่าตามลำดับ symbol ที่ขอมา และ normalize เป็นตัวพิมพ์ใหญ่', async () => {
    const { controller, getRiskFundamentals } = makeController(
      new Map([
        ['AAPL', { peRatio: 36.099, beta: 1.086 }],
        ['PTT.BK', { peRatio: 9.274, beta: 0.322 }],
      ]),
    );

    const result = await controller.getRiskFundamentals('aapl, ptt.bk');

    expect(getRiskFundamentals).toHaveBeenCalledWith(['AAPL', 'PTT.BK']);
    expect(result).toEqual([
      { symbol: 'AAPL', peRatio: 36.099, beta: 1.086 },
      { symbol: 'PTT.BK', peRatio: 9.274, beta: 0.322 },
    ]);
  });

  /**
   * symbol ที่ Yahoo ไม่รู้จักต้อง "อยู่ในผลลัพธ์แต่เป็น null" ไม่ใช่หายไปเฉย ๆ
   * ผู้เรียกจะได้แยกออกว่าไม่มีข้อมูล ต่างจากไม่ได้ขอ
   */
  it('symbol ที่หาไม่เจอ -> อยู่ในผลลัพธ์แต่ค่าเป็น null ทั้งคู่', async () => {
    const { controller } = makeController(
      new Map([['AAPL', { peRatio: 36.099, beta: 1.086 }]]),
    );

    const result = await controller.getRiskFundamentals('AAPL,NOSUCH');

    expect(result).toEqual([
      { symbol: 'AAPL', peRatio: 36.099, beta: 1.086 },
      { symbol: 'NOSUCH', peRatio: null, beta: null },
    ]);
  });

  it('ไม่ส่ง symbols มา -> คืน array ว่าง ไม่ยิง Yahoo เปล่า ๆ', async () => {
    const { controller, getRiskFundamentals } = makeController(new Map());

    await expect(controller.getRiskFundamentals()).resolves.toEqual([]);
    await expect(controller.getRiskFundamentals('  ,  ')).resolves.toEqual([]);

    expect(getRiskFundamentals).not.toHaveBeenCalled();
  });
});

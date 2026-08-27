/**
 * AI Picks — จาก "โมเดลนึกหุ้นเอง" เป็น "โมเดลจัดอันดับจากลิสต์ที่ระบบส่งไป"
 *
 * คุมบั๊ก P1 + P5 จาก ai-prompt-audit.md:
 *   P1 เดิมไม่มีข้อมูลจริงป้อนเข้า prompt เลยแม้แต่ตัวเดียว โมเดลจึงเดาหุ้นจาก
 *      ความจำตอนเทรน แล้วแต่งเหตุผล 4 ด้านขึ้นมาเอง
 *   P5 เดิม user prompt เป็น natural-language template ต่างจากอีก 7 จุดที่ส่ง
 *      JSON.stringify
 *
 * หัวใจของชุดนี้คือ "บอกใน prompt ไม่พอ" — ต้องมีด่านฝั่งเซิร์ฟเวอร์ที่ตัดหุ้นนอก
 * ลิสต์ทิ้งจริง ๆ ด้วย ไม่ใช่เชื่อว่าโมเดลทำตามคำสั่ง
 */
import { ServiceUnavailableException } from '@nestjs/common';
import { AiRecommendationService } from './ai-recommendation.service';
import type { AiManagerService } from './ai-manager.service';
import type {
  GrowthCandidate,
  StocksService,
} from '../stocks/stocks.service';

const GEMINI = {
  id: 'gemini-2.5-flash',
  label: 'Gemini',
  creditsPer1kInput: 5,
  creditsPer1kOutput: 15,
};

function candidate(
  symbol: string,
  overrides: Partial<GrowthCandidate> = {},
): GrowthCandidate {
  return {
    symbol,
    name: `${symbol} Public Company`,
    sector: 'Technology',
    exchange: symbol.endsWith('.BK') ? 'SET' : 'NASDAQ',
    asOf: '2026-06-30',
    metrics: {
      revenueGrowthYoY: 0.474,
      netMargin: 0.125,
      peRatio: 41.2,
      currentPrice: 123.4,
      avgDailyVolume3M: 12_000_000,
    },
    ...overrides,
  };
}

const CANDIDATES = [
  candidate('DELTA.BK'),
  candidate('PTT.BK'),
  candidate('NVDA'),
  candidate('AAPL'),
  candidate('MSFT'),
  candidate('AMD'),
];

function reply(symbol: string, extra: Record<string, unknown> = {}) {
  return {
    symbol,
    reasoning: {
      growth: 'g',
      profit: 'p',
      customerBase: 'c',
      liquidity: 'l',
    },
    aiSummary: 's',
    ...extra,
  };
}

function makeService(
  data: unknown,
  candidates: GrowthCandidate[] = CANDIDATES,
) {
  const executeAiRequest = jest.fn().mockResolvedValue({
    data,
    model: 'gemini-2.5-flash',
    creditsCharged: 1,
    creditsRemaining: 9,
  });

  const manager = {
    listAvailableModels: () => [GEMINI],
    executeAiRequest,
  } as unknown as AiManagerService;

  const stocks = {
    getGrowthCandidates: jest.fn().mockResolvedValue(candidates),
  } as unknown as StocksService;

  return {
    service: new AiRecommendationService(manager, stocks),
    executeAiRequest,
  };
}

/** payload ที่ถูกส่งเข้า LLM จริง */
function sentPayload(executeAiRequest: jest.Mock) {
  return executeAiRequest.mock.calls[0][0];
}

describe('AiRecommendationService — candidate list ของจริง', () => {
  it('ส่ง candidate พร้อมตัวเลขจริงเข้า prompt เป็น JSON ไม่ใช่ template ข้อความ', async () => {
    const { service, executeAiRequest } = makeService([reply('NVDA')]);

    await service.getGrowthRecommendations(1);

    const { prompt } = sentPayload(executeAiRequest);
    const parsed = JSON.parse(prompt);

    expect(parsed.candidates).toHaveLength(6);
    expect(parsed.candidates[0]).toMatchObject({
      symbol: 'DELTA.BK',
      asOf: '2026-06-30',
      metrics: {
        revenueGrowthYoY: 0.474,
        netMargin: 0.125,
        currentPrice: 123.4,
      },
    });
  });

  /**
   * ถ้าด่านนี้หลุด ผู้ใช้จะได้หุ้นที่โมเดลนึกขึ้นเองกลับไป — ซึ่งคือบั๊กเดิมทุกประการ
   * เพียงแต่ซ่อนอยู่หลัง candidate list ที่ดูเหมือนแก้แล้ว
   */
  it('โมเดลตอบหุ้นนอกลิสต์ -> ตัดทิ้ง ไม่ส่งต่อให้ผู้ใช้', async () => {
    const { service } = makeService([
      reply('TSLA'), // ไม่ได้อยู่ใน candidates
      reply('NVDA'),
      reply('GOOGL'), // ไม่ได้อยู่ใน candidates
    ]);

    const result = await service.getGrowthRecommendations(1);

    expect(result.data.map((r) => r.symbol)).toEqual(['NVDA']);
  });

  it('โมเดลตอบนอกลิสต์ทั้งหมด -> โยน error ไม่เสิร์ฟของที่ตรวจสอบไม่ได้', async () => {
    const { service } = makeService([reply('TSLA'), reply('META')]);

    await expect(
      service.getGrowthRecommendations(1),
    ).rejects.toThrow('AI returned no stock recommendations');
  });

  it('ตัวเลข/ชื่อ เอาจากเซิร์ฟเวอร์เสมอ ต่อให้โมเดลตอบมาผิด', async () => {
    const { service } = makeService([
      reply('NVDA', {
        name: 'Nvidia (ราคา 9999 บาท)',
        sector: 'Mining',
        asOf: '1999-01-01',
        metrics: { currentPrice: 9999, peRatio: 1 },
      }),
    ]);

    const [row] = (await service.getGrowthRecommendations(1)).data;

    expect(row.name).toBe('NVDA Public Company');
    expect(row.sector).toBe('Technology');
    expect(row.asOf).toBe('2026-06-30');
    expect(row.metrics.currentPrice).toBe(123.4);
    expect(row.metrics.peRatio).toBe(41.2);
    // ส่วนที่เป็นงานของโมเดลจริง ๆ ยังถูกเก็บไว้
    expect(row.aiSummary).toBe('s');
  });

  it('ตอบ symbol เดิมซ้ำ -> เก็บอันเดียว ไม่ให้ลิสต์บวม', async () => {
    const { service } = makeService([
      reply('NVDA'),
      reply('nvda'),
      reply('AAPL'),
    ]);

    const result = await service.getGrowthRecommendations(1);

    expect(result.data.map((r) => r.symbol)).toEqual(['NVDA', 'AAPL']);
  });

  /**
   * ข้อมูลตลาดไม่พอ = ต้องบอกว่าใช้ไม่ได้ ห้ามถอยกลับไปโหมดเดิมที่ให้โมเดลนึกเอง
   * และต้องไม่ยิง LLM เลย ไม่งั้นผู้ใช้เสียเครดิตไปกับคำตอบที่ตั้งใจจะทิ้งอยู่แล้ว
   */
  it('candidate น้อยเกินไป -> แจ้ง error โดยไม่เรียก LLM และไม่คิดเงินผู้ใช้', async () => {
    const { service, executeAiRequest } = makeService(
      [reply('NVDA')],
      [candidate('NVDA'), candidate('AAPL')],
    );

    await expect(
      service.getGrowthRecommendations(1),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    expect(executeAiRequest).not.toHaveBeenCalled();
  });

  it('system prompt ปิดทางตอบนอกลิสต์ และบอกหน่วยของตัวเลขให้ชัด', async () => {
    const { service, executeAiRequest } = makeService([reply('NVDA')]);

    await service.getGrowthRecommendations(1);

    const { systemPrompt } = sentPayload(executeAiRequest);

    expect(systemPrompt).toContain(
      'Never return, name, or compare against a symbol that is not in that list',
    );
    // 0.474 ที่ส่งไปคือ +47.4% ถ้าโมเดลอ่านเป็น 0.47% คำอธิบายจะผิดทั้งหมด
    expect(systemPrompt).toContain('fractions, not percentages');
    expect(systemPrompt).toContain(
      'A null metric means the data is unavailable',
    );
  });

  /**
   * การ์ดหนึ่งใบมีช่องเหตุผล 4 ช่องเท่า ๆ กัน ถ้าโมเดลเข้าใจว่า ~40 คำเป็นโควตา
   * ของทั้ง reasoning มันจะเทไปที่ growth ช่องเดียวแล้วอีกสามช่องเหลือห้วน ๆ
   * ผู้ใช้เห็นเป็นการ์ดที่ข้อมูลขาด ทั้งที่จริงคือถูกจัดสรรผิด
   */
  it('คุมความยาวแยกรายช่อง ไม่ให้เทโควตาลงช่องแรกช่องเดียว', async () => {
    const { service, executeAiRequest } = makeService([reply('NVDA')]);

    await service.getGrowthRecommendations(1);

    const { systemPrompt, maxOutputTokens } = sentPayload(executeAiRequest);

    expect(systemPrompt).toContain('applies to every field on its own');
    expect(systemPrompt).toContain(
      'Each of the four reasoning sub-fields gets its own budget',
    );
    // 5 หุ้น × (4 ช่อง + สรุป) = 25 ฟิลด์ข้อความ และ gemini หัก thinking token
    // จากเพดานเดียวกันนี้ — จุดนี้ต้องสูงกว่าจุดอื่นเสมอ
    expect(maxOutputTokens).toBeGreaterThanOrEqual(2400);
  });
});

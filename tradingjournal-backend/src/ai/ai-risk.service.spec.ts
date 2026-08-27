import { AiRiskService } from './ai-risk.service';
import type { AiManagerService } from './ai-manager.service';
import type { PortfolioRiskHolding } from './ai-feature.types';

/**
 * ชุดนี้คุมบั๊ก P2 จาก ai-prompt-audit.md
 *
 * prompt ตั้งกติกาความเสี่ยงไว้ด้วย beta/P-E/D-E มาตั้งแต่ต้น แต่หน้าบ้านส่งมาแค่
 * symbol/quantity/weight/currentPrice ทำให้ normalizeWeights() เซ็ตทุกฟิลด์เป็น null
 * ทุกครั้ง โมเดลจึงตัดสินจากค่าที่ไม่มีจริง (และมีแนวโน้มเดาจากความจำเก่า)
 *
 * ตอนนี้ P/E กับ beta ถูกส่งมาจริงแล้ว ส่วน D/E ยังเป็น null โดยตั้งใจ
 */

function makeService() {
  const executeAiRequest = jest.fn().mockResolvedValue({
    data: {
      riskLevel: 'Moderate',
      riskScore: 55,
      analysisSummary: 'ok',
      keyRiskFactors: ['a'],
    },
    model: 'groq-llama3',
    creditsCharged: 1,
    creditsRemaining: 9,
  });

  const manager = { executeAiRequest } as unknown as AiManagerService;

  return { service: new AiRiskService(manager), executeAiRequest };
}

/** holdings ที่ถูกส่งเข้า prompt จริง (หลัง normalizeWeights) */
function promptHoldings(executeAiRequest: jest.Mock) {
  return JSON.parse(executeAiRequest.mock.calls[0][0].prompt).holdings;
}

describe('AiRiskService — ปัจจัยพื้นฐานที่ส่งเข้า prompt', () => {
  it('มี peRatio/beta จริงครบ -> ส่งต่อเข้า prompt ตามค่าจริง ไม่ถูกกลืนเป็น null', async () => {
    const { service, executeAiRequest } = makeService();

    const holdings: PortfolioRiskHolding[] = [
      {
        symbol: 'aapl',
        quantity: 10,
        weight: 0.6,
        currentPrice: 314.67,
        peRatio: 36.099,
        beta: 1.086,
        debtToEquity: null,
      },
      {
        symbol: 'PTT.BK',
        quantity: 100,
        weight: 0.4,
        currentPrice: 31.5,
        peRatio: 9.274,
        beta: 0.322,
        debtToEquity: null,
      },
    ];

    await service.analyze(1, holdings, 'groq-llama3');

    const sent = promptHoldings(executeAiRequest);

    expect(sent[0]).toMatchObject({
      symbol: 'AAPL',
      peRatio: 36.099,
      beta: 1.086,
    });
    expect(sent[1]).toMatchObject({
      symbol: 'PTT.BK',
      peRatio: 9.274,
      beta: 0.322,
    });
  });

  it('บาง symbol หา fundamentals ไม่เจอ -> เป็น null ไม่ crash และตัวอื่นยังมีค่าครบ', async () => {
    const { service, executeAiRequest } = makeService();

    const holdings: PortfolioRiskHolding[] = [
      {
        symbol: 'AAPL',
        quantity: 10,
        weight: 0.5,
        peRatio: 36.099,
        beta: 1.086,
      },
      // หุ้นที่ Yahoo ไม่รู้จัก — หน้าบ้านส่ง null มาแทนที่จะแต่งตัวเลข
      { symbol: 'NOSUCH', quantity: 10, weight: 0.5 },
    ];

    await expect(
      service.analyze(1, holdings, 'groq-llama3'),
    ).resolves.toBeDefined();

    const sent = promptHoldings(executeAiRequest);

    expect(sent[0]).toMatchObject({ peRatio: 36.099, beta: 1.086 });
    expect(sent[1]).toMatchObject({
      symbol: 'NOSUCH',
      peRatio: null,
      beta: null,
    });
  });

  it('debtToEquity ยังเป็น null เสมอ และ prompt สั่งห้ามเดาค่าที่เป็น null', async () => {
    const { service, executeAiRequest } = makeService();

    await service.analyze(
      1,
      [{ symbol: 'AAPL', quantity: 1, weight: 1, peRatio: 36.1, beta: 1.09 }],
      'groq-llama3',
    );

    const sent = promptHoldings(executeAiRequest);
    expect(sent[0].debtToEquity).toBeNull();

    // ถ้าบรรทัดกันหลอนหลุดหายไป โมเดลจะกลับไปเดา D/E จากชื่อหุ้นเหมือนเดิม
    const { systemPrompt } = executeAiRequest.mock.calls[0][0];
    expect(systemPrompt).toContain('never infer, recall, or estimate it');
    expect(systemPrompt).toContain('state the gap in analysisSummary');
  });

  it('เกณฑ์ concentration เป็นตัวเลขจริง ไม่ใช่คำกว้าง ๆ ให้โมเดลตีความเอง', async () => {
    const { service, executeAiRequest } = makeService();

    await service.analyze(1, [{ symbol: 'AAPL', quantity: 1 }], 'groq-llama3');

    const { rules } = JSON.parse(executeAiRequest.mock.calls[0][0].prompt);
    expect(rules.concentration).toBe('single holding weight >25%');
  });
});

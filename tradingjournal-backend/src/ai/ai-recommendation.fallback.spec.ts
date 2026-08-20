import {
  HttpException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AiRecommendationService } from './ai-recommendation.service';
import type { AiManagerService } from './ai-manager.service';

/**
 * AI Picks (GET /ai/recommendations/growth) ไม่รับ modelId — เซิร์ฟเวอร์เลือกให้
 * ของเดิมเลือก gemini-2.5-flash แล้วจบตรงนั้น พอ gemini ชน rate limit ทั้งฟีเจอร์
 * ตายทันที และข้อความ error บอกให้ "ลองโมเดลอื่น" ทั้งที่หน้านั้นเลือกโมเดลไม่ได้เลย
 *
 * ชุดนี้คุมว่า:
 *   - ถอยไปตัวสำรองได้เมื่อโมเดลแรกให้บริการไม่ได้
 *   - ถอยได้เฉพาะตัวที่ไม่แพงกว่า (กฎของ ai-manager.service.ts:191 เรื่องคิดเงินเกิน)
 *   - ไม่ถอยเมื่อ error ไม่ใช่เรื่องของโมเดล (เครดิตไม่พอ ลองตัวอื่นก็ตายเหมือนกัน)
 */

const GEMINI = {
  id: 'gemini-2.5-flash',
  label: 'Gemini',
  creditsPer1kInput: 5,
  creditsPer1kOutput: 15,
};
const GROQ = {
  id: 'groq-llama3',
  label: 'Groq',
  creditsPer1kInput: 1,
  creditsPer1kOutput: 1,
};
const CLAUDE = {
  id: 'claude-sonnet-5',
  label: 'Claude',
  creditsPer1kInput: 60,
  creditsPer1kOutput: 300,
};

const PICKS = [
  {
    symbol: 'TSLA',
    name: 'Tesla, Inc.',
    sector: 'Automotive',
    reasoning: {
      growth: 'g',
      profit: 'p',
      customerBase: 'c',
      liquidity: 'l',
    },
    aiSummary: 's',
  },
];

const providerUnavailable = (modelId: string) =>
  new ServiceUnavailableException({
    statusCode: 503,
    error: 'AI_PROVIDER_UNAVAILABLE',
    message: `Model "${modelId}" hit its rate limit.`,
    model: modelId,
    failureKind: 'rate-limit',
  });

const insufficientCredits = () =>
  new HttpException(
    { error: 'INSUFFICIENT_AI_CREDITS' },
    402,
  );

/** manager ปลอมที่บันทึกลำดับโมเดลที่ถูกเรียกไว้ใน calls */
function makeService(
  models: Array<typeof GEMINI>,
  behaviour: Record<string, unknown> = {},
) {
  const calls: string[] = [];

  const manager = {
    listAvailableModels: () => models,
    executeAiRequest: jest.fn(
      ({ modelId }: { modelId: string }) => {
        calls.push(modelId);

        const failure = behaviour[modelId];
        if (failure) {
          return Promise.reject(failure);
        }

        return Promise.resolve({
          data: PICKS,
          model: modelId,
          usage: {
            inputTokens: 10,
            outputTokens: 20,
          },
          creditsCharged: 1,
          creditsRemaining: 99,
        });
      },
    ),
  } as unknown as AiManagerService;

  return {
    service: new AiRecommendationService(manager),
    calls,
    manager,
  };
}

describe('AiRecommendationService — เลือกและถอยโมเดล', () => {
  it('โมเดลแรกใช้ได้ -> ไม่ถอย และบอกว่าไม่ได้ถูกสลับ', async () => {
    const { service, calls } = makeService([
      GEMINI,
      GROQ,
    ]);

    const result =
      await service.getGrowthRecommendations(1);

    expect(calls).toEqual(['gemini-2.5-flash']);
    expect(result.model).toBe('gemini-2.5-flash');
    expect(result.fallbackFrom).toBeNull();
    expect(result.data).toHaveLength(1);
  });

  it('โมเดลแรกชน rate limit -> ถอยไปตัวที่ถูกกว่าแล้วไปต่อได้', async () => {
    const { service, calls } = makeService(
      [GEMINI, GROQ],
      {
        'gemini-2.5-flash': providerUnavailable(
          'gemini-2.5-flash',
        ),
      },
    );

    const result =
      await service.getGrowthRecommendations(1);

    expect(calls).toEqual([
      'gemini-2.5-flash',
      'groq-llama3',
    ]);
    expect(result.model).toBe('groq-llama3');
    // ผู้ใช้ควรมีทางรู้ว่าคำตอบไม่ได้มาจากโมเดลที่ตั้งใจไว้
    expect(result.fallbackFrom).toBe(
      'gemini-2.5-flash',
    );
  });

  it('เครดิตไม่พอ -> ไม่ถอยไปตัวอื่น เพราะลองกี่ตัวก็ตายเหมือนกัน', async () => {
    const { service, calls } = makeService(
      [GEMINI, GROQ],
      {
        'gemini-2.5-flash': insufficientCredits(),
      },
    );

    await expect(
      service.getGrowthRecommendations(1),
    ).rejects.toBeInstanceOf(HttpException);

    expect(calls).toEqual(['gemini-2.5-flash']);
  });

  it('ตัวสำรองแพงกว่าตัวแรก -> ไม่ถอยไปหา จะได้ไม่คิดเงินผู้ใช้เกิน', async () => {
    // เหลือแค่ groq (1/1) กับ claude (60/300) — groq เป็นตัวแรกที่เจอในลำดับ
    const { service, calls } = makeService(
      [GROQ, CLAUDE],
      {
        'groq-llama3':
          providerUnavailable('groq-llama3'),
      },
    );

    await expect(
      service.getGrowthRecommendations(1),
    ).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );

    expect(calls).toEqual(['groq-llama3']);
  });

  it('ทุกตัวใน chain ล่ม -> โยน error ของตัวสุดท้ายออกไป ไม่กลืนเงียบ', async () => {
    const { service, calls } = makeService(
      [GEMINI, GROQ],
      {
        'gemini-2.5-flash': providerUnavailable(
          'gemini-2.5-flash',
        ),
        'groq-llama3':
          providerUnavailable('groq-llama3'),
      },
    );

    await expect(
      service.getGrowthRecommendations(1),
    ).rejects.toMatchObject({
      response: { model: 'groq-llama3' },
    });

    expect(calls).toEqual([
      'gemini-2.5-flash',
      'groq-llama3',
    ]);
  });

  it('ไม่มี provider ที่ตั้งค่าไว้เลย -> บอกให้ชัด ไม่ใช่ crash แปลกๆ', async () => {
    const { service } = makeService([]);

    await expect(
      service.getGrowthRecommendations(1),
    ).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});

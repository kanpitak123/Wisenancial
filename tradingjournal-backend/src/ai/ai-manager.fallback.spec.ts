import { ServiceUnavailableException } from '@nestjs/common';
import { AiManagerService } from './ai-manager.service';
import { classifyAiFailure } from './ai-retry';
import type { IAiProvider } from './providers/ai-provider.interface';

/**
 * Groq free tier มี TPM 6000 ชนเพดานแล้วตอบ 429 — ของเดิม executeSystemAiRequest
 * เรียก provider เดียวจบ ล้มทั้งงาน ทั้งที่ .env มี key ของอีก 3 เจ้าพร้อมใช้
 *
 * ชุดนี้คุมว่า chain groq -> gemini -> openai -> anthropic ทำงานถูก และที่สำคัญกว่า
 * คือ "ไม่วนต่อ" เมื่อ error เป็นชนิดที่ลองเจ้าอื่นก็ได้ผลเดิม
 */

type ProviderId = 'groq' | 'gemini' | 'openai' | 'anthropic';

const httpError = (status: number, message = `HTTP ${status}`) =>
  Object.assign(new Error(message), { status });

/** provider ปลอมที่บันทึกลำดับการถูกเรียกไว้ใน calls */
function fakeProvider(
  id: ProviderId,
  behaviour: { fails?: unknown; configured?: boolean } = {},
  calls: string[] = [],
): IAiProvider {
  return {
    id,
    isConfigured: () => behaviour.configured !== false,
    generateJsonResponse: jest.fn(() => {
      calls.push(id);

      if (behaviour.fails) {
        return Promise.reject(behaviour.fails);
      }

      return Promise.resolve({
        data: { servedBy: id } as never,
        usage: { inputTokens: 10, outputTokens: 20 },
      });
    }),
  } as IAiProvider;
}

function makeManager(
  behaviours: Partial<Record<ProviderId, { fails?: unknown; configured?: boolean }>>,
) {
  const calls: string[] = [];
  const provider = (id: ProviderId) =>
    fakeProvider(id, behaviours[id] ?? {}, calls);

  const manager = new AiManagerService(
    {} as never,
    provider('groq') as never,
    provider('gemini') as never,
    provider('openai') as never,
    provider('anthropic') as never,
  );

  // เทสไม่ได้สนใจ log — ปิดเสียงไว้ไม่ให้รกผลรัน
  jest.spyOn(manager['logger'], 'warn').mockImplementation(() => undefined);
  jest.spyOn(manager['logger'], 'error').mockImplementation(() => undefined);
  jest.spyOn(manager['logger'], 'log').mockImplementation(() => undefined);

  return { manager, calls };
}

const systemRequest = { prompt: 'summarise this headline' };

describe('classifyAiFailure', () => {
  it('429 = rate-limit (ลองเจ้าอื่นได้)', () => {
    expect(classifyAiFailure(httpError(429))).toBe('rate-limit');
  });

  it('5xx = upstream-error (ลองเจ้าอื่นได้)', () => {
    expect(classifyAiFailure(httpError(503))).toBe('upstream-error');
    expect(classifyAiFailure(httpError(500))).toBe('upstream-error');
  });

  it('timeout / network = network (ลองเจ้าอื่นได้)', () => {
    expect(classifyAiFailure(Object.assign(new Error('x'), { code: 'ETIMEDOUT' }))).toBe(
      'network',
    );
    expect(classifyAiFailure(Object.assign(new Error('x'), { name: 'AbortError' }))).toBe(
      'network',
    );
    expect(classifyAiFailure(new Error('Request timed out after 30000ms'))).toBe('network');
  });

  it('4xx อื่นๆ = permanent (ลองเจ้าอื่นก็ได้ผลเดิม)', () => {
    expect(classifyAiFailure(httpError(400))).toBe('permanent');
    expect(classifyAiFailure(httpError(404))).toBe('permanent');
    expect(classifyAiFailure(httpError(422))).toBe('permanent');
  });

  it('401/403 = permanent โดยตั้งใจ — key ผิดต้องเห็นเสียงดัง ไม่ใช่ไปเผาเจ้าที่แพงกว่า', () => {
    expect(classifyAiFailure(httpError(401))).toBe('permanent');
    expect(classifyAiFailure(httpError(403))).toBe('permanent');
  });

  it('อ่านสถานะจาก response.status ได้ด้วย (SDK บางตัววางไว้ตรงนั้น)', () => {
    expect(classifyAiFailure({ response: { status: 429 } })).toBe('rate-limit');
  });

  it('ข้อความ rate limit ที่ไม่มีสถานะแนบมา ก็จับได้', () => {
    expect(classifyAiFailure(new Error('Rate limit reached for model'))).toBe('rate-limit');
    expect(classifyAiFailure(new Error('quota exceeded'))).toBe('rate-limit');
  });

  it('ของที่ไม่ใช่ object -> permanent ไม่ throw', () => {
    expect(classifyAiFailure('boom')).toBe('permanent');
    expect(classifyAiFailure(null)).toBe('permanent');
  });
});

describe('executeSystemAiRequest — provider chain', () => {
  beforeEach(() => jest.clearAllMocks());

  it('groq สำเร็จ -> ไม่แตะเจ้าอื่นเลย', async () => {
    const { manager, calls } = makeManager({});

    const result = await manager.executeSystemAiRequest(systemRequest);

    expect(result.model).toBe('groq-llama3');
    expect(calls).toEqual(['groq']);
  });

  it('groq 429 -> เลื่อนไป gemini แล้วได้ผลลัพธ์', async () => {
    const { manager, calls } = makeManager({ groq: { fails: httpError(429) } });

    const result = await manager.executeSystemAiRequest(systemRequest);

    expect(result.model).toBe('gemini-2.5-flash');
    expect(result.data).toEqual({ servedBy: 'gemini' });
    expect(calls).toEqual(['groq', 'gemini']);
  });

  it('groq 429 + gemini 503 + openai timeout -> ตกถึง anthropic', async () => {
    const { manager, calls } = makeManager({
      groq: { fails: httpError(429) },
      gemini: { fails: httpError(503) },
      openai: { fails: Object.assign(new Error('socket'), { code: 'ETIMEDOUT' }) },
    });

    const result = await manager.executeSystemAiRequest(systemRequest);

    expect(result.model).toBe('claude-sonnet-5');
    expect(calls).toEqual(['groq', 'gemini', 'openai', 'anthropic']);
  });

  it('ล้มทุกเจ้า -> ServiceUnavailable และบอกว่าลองอะไรไปบ้าง', async () => {
    const { manager, calls } = makeManager({
      groq: { fails: httpError(429) },
      gemini: { fails: httpError(429) },
      openai: { fails: httpError(502) },
      anthropic: { fails: httpError(429) },
    });

    await expect(manager.executeSystemAiRequest(systemRequest)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );

    expect(calls).toEqual(['groq', 'gemini', 'openai', 'anthropic']);

    await expect(manager.executeSystemAiRequest(systemRequest)).rejects.toThrow(
      /groq-llama3\(rate-limit\)/,
    );
  });

  it('400 bad request -> หยุดทันที ไม่วนต่อ', async () => {
    const { manager, calls } = makeManager({ groq: { fails: httpError(400, 'bad prompt') } });

    await expect(manager.executeSystemAiRequest(systemRequest)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );

    // ต้องเรียกแค่ groq เจ้าเดียว
    expect(calls).toEqual(['groq']);
  });

  it('เจอ permanent กลางทาง -> หยุดตรงนั้น ไม่ไล่จนจบ chain', async () => {
    const { manager, calls } = makeManager({
      groq: { fails: httpError(429) },
      gemini: { fails: httpError(400, 'unsupported schema') },
    });

    await expect(manager.executeSystemAiRequest(systemRequest)).rejects.toThrow(
      /unsupported schema/,
    );

    expect(calls).toEqual(['groq', 'gemini']);
  });

  it('provider ที่ไม่มี key ถูกข้าม ไม่เสีย attempt ไปเปล่าๆ', async () => {
    const { manager, calls } = makeManager({
      groq: { configured: false },
      gemini: { fails: httpError(429) },
    });

    const result = await manager.executeSystemAiRequest(systemRequest);

    expect(calls).toEqual(['gemini', 'openai']);
    expect(result.model).toBe('gpt-4o');
  });

  it('ไม่มี provider ไหนตั้งค่าไว้เลย -> ServiceUnavailable ทันที', async () => {
    const { manager, calls } = makeManager({
      groq: { configured: false },
      gemini: { configured: false },
      openai: { configured: false },
      anthropic: { configured: false },
    });

    await expect(manager.executeSystemAiRequest(systemRequest)).rejects.toThrow(
      /No AI provider is configured/,
    );

    expect(calls).toEqual([]);
  });

  it('ระบุ modelId มา -> เริ่มจากตัวนั้น แล้วค่อยไล่ chain ที่เหลือ', async () => {
    const { manager, calls } = makeManager({ openai: { fails: httpError(429) } });

    const result = await manager.executeSystemAiRequest({
      ...systemRequest,
      modelId: 'gpt-4o',
    });

    expect(calls).toEqual(['openai', 'groq']);
    expect(result.model).toBe('groq-llama3');
  });

  it('ไม่เรียก provider ตัวเดิมซ้ำสองครั้งใน chain เดียว', async () => {
    const { manager, calls } = makeManager({
      groq: { fails: httpError(429) },
      gemini: { fails: httpError(429) },
      openai: { fails: httpError(429) },
      anthropic: { fails: httpError(429) },
    });

    await expect(
      manager.executeSystemAiRequest({ ...systemRequest, modelId: 'groq-llama3' }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    expect(calls).toEqual(['groq', 'gemini', 'openai', 'anthropic']);
  });
});

describe('executeAiRequest — ฝั่งผู้ใช้ ต้องไม่ fallback ข้าม provider', () => {
  const prismaWithBalance = (balance: number) =>
    ({
      users: { findUnique: jest.fn().mockResolvedValue({ ai_token_balance: balance }) },
      ai_usage_logs: { create: jest.fn().mockResolvedValue({}) },
    }) as never;

  function makeUserManager(fails: unknown) {
    const calls: string[] = [];
    const provider = (id: ProviderId) =>
      fakeProvider(id, id === 'groq' ? { fails } : {}, calls);

    const manager = new AiManagerService(
      prismaWithBalance(500),
      provider('groq') as never,
      provider('gemini') as never,
      provider('openai') as never,
      provider('anthropic') as never,
    );

    jest.spyOn(manager['logger'], 'error').mockImplementation(() => undefined);

    return { manager, calls };
  }

  const userRequest = {
    userId: 1,
    modelId: 'groq-llama3',
    prompt: 'analyse my portfolio',
  };

  it('model ที่เลือกล้ม -> ไม่ไปเรียกเจ้าอื่นแทน (เรตเครดิตต่างกันถึง 300 เท่า)', async () => {
    const { manager, calls } = makeUserManager(httpError(429));

    await expect(manager.executeAiRequest(userRequest)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );

    // ต้องไม่มี gemini/openai/anthropic โผล่มา
    expect(calls).toEqual(['groq']);
  });

  it('error บอกได้ว่าเลือกรุ่นไหนแทนได้', async () => {
    const { manager } = makeUserManager(httpError(429));

    const error = await manager
      .executeAiRequest(userRequest)
      .catch((caught: ServiceUnavailableException) => caught);

    const body = (error as ServiceUnavailableException).getResponse() as {
      error: string;
      message: string;
      failureKind: string;
      availableModels: string[];
    };

    expect(body.error).toBe('AI_PROVIDER_UNAVAILABLE');
    expect(body.failureKind).toBe('rate-limit');
    expect(body.availableModels).toEqual([
      'gemini-2.5-flash',
      'gpt-4o',
      'claude-sonnet-5',
    ]);
    expect(body.message).toContain('rate limit');
    expect(body.message).toContain('gemini-2.5-flash');
  });

  it('เครดิตไม่พอ -> ไม่ยิง provider เลย', async () => {
    const calls: string[] = [];
    const provider = (id: ProviderId) => fakeProvider(id, {}, calls);

    const manager = new AiManagerService(
      prismaWithBalance(1),
      provider('groq') as never,
      provider('gemini') as never,
      provider('openai') as never,
      provider('anthropic') as never,
    );

    await expect(manager.executeAiRequest(userRequest)).rejects.toBeDefined();
    expect(calls).toEqual([]);
  });
});

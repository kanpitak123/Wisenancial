import { AiEducationService } from './ai-education.service';
import type { AiManagerService } from './ai-manager.service';

/**
 * quiz เป็นจุดเดียวใน 8 จุดที่ "ไม่" ใส่ investmentGuardrail() โดยตั้งใจ —
 * มันสร้างคำถามจากเนื้อบทเรียน ไม่ได้วิเคราะห์หุ้นหรือพอร์ตของใคร การห้ามพูดคำว่า
 * buy/sell จะกันไม่ให้ออกข้อสอบเรื่องคำสั่งซื้อขายซึ่งเป็นเนื้อหาการเงินปกติ
 *
 * ล็อกไว้เป็นเทสเพราะถ้าใครมาไล่ใส่ guardrail ให้ครบทุกจุดในอนาคต จะได้เห็นว่า
 * การเว้นจุดนี้เป็นการตัดสินใจ ไม่ใช่ตกหล่น
 */
function makeService() {
  const executeAiRequest = jest.fn().mockResolvedValue({
    data: {
      questions: [
        {
          question: 'q1',
          options: ['a', 'b', 'c', 'd'],
          correctAnswer: 0,
          explanation: 'e',
        },
        {
          question: 'q2',
          options: ['a', 'b', 'c', 'd'],
          correctAnswer: 1,
          explanation: 'e',
        },
      ],
    },
    model: 'groq-llama3',
    creditsCharged: 1,
    creditsRemaining: 9,
  });

  const manager = {
    listAvailableModels: () => [
      {
        id: 'groq-llama3',
        label: 'Groq',
        creditsPer1kInput: 1,
        creditsPer1kOutput: 1,
      },
    ],
    executeAiRequest,
  } as unknown as AiManagerService;

  return {
    service: new AiEducationService(manager),
    executeAiRequest,
  };
}

describe('AiEducationService — system prompt', () => {
  it('ไม่ใส่ guardrail ห้ามพูดคำว่า buy/sell เพราะเป็นเนื้อหาบทเรียน ไม่ใช่คำแนะนำลงทุน', async () => {
    const { service, executeAiRequest } = makeService();

    await service.generateQuiz(1, 'Order types', 'Market vs limit orders');

    expect(executeAiRequest.mock.calls[0][0].systemPrompt).not.toContain(
      'Never use words like',
    );
  });

  it('ยังบังคับภาษาตามนโยบายกลางเหมือนจุดอื่น', async () => {
    const { service, executeAiRequest } = makeService();

    await service.generateQuiz(1, 'Order types', 'Market vs limit', 'en');

    expect(executeAiRequest.mock.calls[0][0].systemPrompt).toContain(
      'Output language: English',
    );
  });

  /**
   * quiz ไม่ได้รับ investmentGuardrail (เทสด้านบนล็อกไว้) แต่ conciseness เป็นคนละ
   * เรื่องกัน — explanation เป็นฟรีเท็กซ์ที่ยาวเกินได้จริง จึงต้องมีบรรทัดคุมความยาว
   */
  it('มีบรรทัดคุมความยาว ถึงจะไม่มี guardrail เรื่องคำแนะนำลงทุนก็ตาม', async () => {
    const { service, executeAiRequest } = makeService();

    await service.generateQuiz(1, 'Order types', 'Market vs limit orders');

    expect(executeAiRequest.mock.calls[0][0].systemPrompt).toContain(
      'about 40 words at most',
    );
  });
});

import {
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  AiManagerService,
  type AiModelOption,
} from './ai-manager.service';
import type { StockRecommendation } from './ai-feature.types';

/**
 * ลำดับโมเดลของ AI Picks เรียงจากที่อยากได้ก่อน
 *
 * ผู้ใช้เลือกโมเดลเองไม่ได้บนหน้านี้ (GET /ai/recommendations/growth ไม่รับ modelId)
 * ฝั่งเซิร์ฟเวอร์จึงต้องเลือกให้ และต้องมีตัวสำรองด้วย ไม่งั้นตัวแรกล่มทีเดียว
 * ทั้งฟีเจอร์ตายทันทีโดยผู้ใช้ทำอะไรไม่ได้เลย
 */
const GROWTH_MODEL_PREFERENCE = [
  'gemini-2.5-flash',
  'groq-llama3',
] as const;

@Injectable()
export class AiRecommendationService {
  private readonly logger = new Logger(
    AiRecommendationService.name,
  );

  constructor(
    private readonly manager: AiManagerService,
  ) {}

  async getGrowthRecommendations(userId: number) {
    const chain = this.modelChain();
    const [preferred] = chain;

    let result: Awaited<
      ReturnType<
        AiManagerService['executeAiRequest']
      >
    > | null = null;
    let servedBy = preferred;

    for (const [index, model] of chain.entries()) {
      try {
        result =
          await this.manager.executeAiRequest<
            | StockRecommendation[]
            | Record<string, unknown>
          >({
            userId,
            modelId: model.id,
            systemPrompt:
              'You are a quantitative growth-stock analyst. Return a valid JSON array only. Do not invent live prices or precise current metrics.',
            prompt: `Recommend 4-5 publicly traded growth companies across diverse sectors.
Return ONLY a JSON array with:
[{
  "symbol":"string",
  "name":"string",
  "sector":"string",
  "reasoning":{
    "growth":"string",
    "profit":"string",
    "customerBase":"string",
    "liquidity":"string"
  },
  "aiSummary":"string"
}]
State uncertainty when current data is unavailable. Do not guarantee returns.`,
            maxOutputTokens: 1800,
          });
        servedBy = model;
        break;
      } catch (error) {
        const isLast = index === chain.length - 1;

        if (isLast || !this.canRetryOnAnotherModel(error)) {
          throw error;
        }

        this.logger.warn(
          `growth recommendations: "${model.id}" ใช้ไม่ได้ ถอยไป "${chain[index + 1]?.id}" (ถูกกว่าหรือเท่าเดิม)`,
        );
      }
    }

    if (!result) {
      throw new ServiceUnavailableException(
        'No AI provider could serve growth recommendations.',
      );
    }

    const rows = this.extractArray(result.data);
    if (!rows.length) {
      throw new InternalServerErrorException(
        'AI returned no stock recommendations',
      );
    }

    return {
      data: rows,
      model: result.model,
      creditsCharged: result.creditsCharged,
      creditsRemaining: result.creditsRemaining,
      /**
       * บอกว่าถูกสลับโมเดลให้หรือเปล่า — null คือได้ตัวที่ตั้งใจไว้ตั้งแต่แรก
       * หน้าบ้านยังไม่ได้ใช้ฟิลด์นี้ แต่ผู้ใช้ควรมีทางรู้ว่าคำตอบมาจากโมเดลไหน
       */
      fallbackFrom:
        servedBy.id === preferred.id
          ? null
          : preferred.id,
    };
  }

  private extractArray(
    data: unknown,
  ): StockRecommendation[] {
    if (Array.isArray(data))
      return data as StockRecommendation[];
    if (data && typeof data === 'object') {
      const nested = Object.values(
        data as Record<string, unknown>,
      ).find(Array.isArray);
      if (Array.isArray(nested))
        return nested as StockRecommendation[];
    }
    return [];
  }

  /**
   * ถอยได้เฉพาะตอนที่ "โมเดลนั้นให้บริการไม่ได้" เท่านั้น
   *
   * เครดิตไม่พอ / ข้อมูลที่ส่งไปผิด ไม่ใช่เรื่องของโมเดล ลองตัวอื่นก็ตายเหมือนกัน
   * แถมยังหลอกผู้ใช้ให้รอนานกว่าเดิมโดยเปล่าประโยชน์
   */
  private canRetryOnAnotherModel(
    error: unknown,
  ): boolean {
    if (
      !(error instanceof ServiceUnavailableException)
    ) {
      return false;
    }

    const body = error.getResponse();

    return (
      typeof body === 'object' &&
      body !== null &&
      (body as { error?: string }).error ===
        'AI_PROVIDER_UNAVAILABLE'
    );
  }

  /**
   * รายการโมเดลที่ยอมให้ไล่ลองตามลำดับ
   *
   * ตัวสำรองต้อง "ไม่แพงกว่า" ตัวแรกเท่านั้น — ai-manager ตั้งใจไม่ fallback ข้าม
   * provider ให้อัตโนมัติ เพราะเรตเครดิตต่างกันได้ถึง 300 เท่า การสลับเงียบๆ ไป
   * ตัวแพงกว่าคือคิดเงินผู้ใช้เกินที่เขาควรจ่าย กฎนั้นกันการถอย "ขึ้น" ไม่ได้ห้าม
   * ถอย "ลง" — gemini (5/15) ไป groq (1/1) ถูกลง ผู้ใช้ไม่มีทางเสียเพิ่ม
   */
  private modelChain(): AiModelOption[] {
    const available =
      this.manager.listAvailableModels();
    const ranked = GROWTH_MODEL_PREFERENCE.map(
      (id) =>
        available.find(
          (model) => model.id === id,
        ),
    ).filter(
      (model): model is AiModelOption =>
        model !== undefined,
    );

    const chain = ranked.length
      ? ranked
      : available.slice(0, 1);
    const [preferred] = chain;

    if (!preferred) {
      throw new ServiceUnavailableException(
        'No AI provider is configured on this server.',
      );
    }

    return [
      preferred,
      ...chain
        .slice(1)
        .filter(
          (model) =>
            this.rateOf(model) <=
            this.rateOf(preferred),
        ),
    ];
  }

  /** เทียบราคาแบบหยาบๆ พอให้รู้ว่าตัวไหนแพงกว่ากัน ไม่ได้ใช้คิดเงินจริง */
  private rateOf(model: AiModelOption): number {
    return (
      model.creditsPer1kInput +
      model.creditsPer1kOutput
    );
  }
}

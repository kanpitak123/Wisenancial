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
import {
  concisenessRule,
  investmentGuardrail,
  outputLanguageRule,
  resolveOutputLanguage,
  screeningOnlyGuardrail,
} from './ai-prompt.shared';
import {
  StocksService,
  type GrowthCandidate,
} from '../stocks/stocks.service';
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

/**
 * ต้องมี candidate อย่างน้อยเท่านี้ถึงจะเรียกว่า "คัดเลือก" ได้
 *
 * ฟีเจอร์ขอ 4-5 ตัว ถ้ารายชื่อที่ส่งเข้าไปเหลือน้อยกว่านี้ โมเดลก็แค่ลอกทั้งลิสต์
 * กลับมา ไม่ได้เลือกอะไรเลย — แจ้งว่าใช้ไม่ได้ตรง ๆ ดีกว่าเสิร์ฟผลที่ไร้ความหมาย
 * และห้ามถอยกลับไปให้โมเดลนึกหุ้นเองเด็ดขาด นั่นคือบั๊กที่เฟสนี้มาแก้พอดี
 */
const MIN_GROWTH_CANDIDATES = 5;

@Injectable()
export class AiRecommendationService {
  private readonly logger = new Logger(
    AiRecommendationService.name,
  );

  constructor(
    private readonly manager: AiManagerService,
    private readonly stocks: StocksService,
  ) {}

  async getGrowthRecommendations(
    userId: number,
    requestedLanguage?: string,
  ) {
    const chain = this.modelChain();
    const [preferred] = chain;
    const outputLanguage = resolveOutputLanguage(requestedLanguage);

    const candidates =
      await this.stocks.getGrowthCandidates();

    if (candidates.length < MIN_GROWTH_CANDIDATES) {
      throw new ServiceUnavailableException({
        statusCode: 503,
        error: 'GROWTH_CANDIDATES_UNAVAILABLE',
        message:
          'Not enough live market data to build a candidate list right now. Please try again shortly.',
      });
    }

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
            systemPrompt: [
              'You are a quantitative growth-stock screener for Thai retail investors.',
              outputLanguageRule(outputLanguage),
              investmentGuardrail(),
              screeningOnlyGuardrail(),
              concisenessRule(),
              // schema ที่นี่ซ้อนลึกที่สุดในระบบ (5 หุ้น × reasoning 4 ช่อง + สรุป)
              // ถ้าโมเดลอ่านโควตาเป็นของทั้ง reasoning มันจะเทไปที่ growth ช่องเดียว
              // แล้วอีกสามช่องเหลือประโยคเดียวห้วน ๆ — การ์ดดูเหมือนข้อมูลขาด
              'Each of the four reasoning sub-fields gets its own budget: give growth, profit, customerBase and liquidity comparable weight instead of spending it all on the first one.',
              'Only reason about the stocks listed in "candidates". Never return, name, or compare against a symbol that is not in that list, even if you know of a better one.',
              'Use only the numbers in candidates[].metrics. A null metric means the data is unavailable — say so plainly instead of recalling or estimating it from your own knowledge.',
              'revenueGrowthYoY and netMargin are fractions, not percentages (0.32 means +32%). Convert them for the reader.',
              'reasoning.growth and reasoning.profit must each cite a specific number from that candidate\'s metrics. reasoning.liquidity must refer to avgDailyVolume3M. If the metrics do not support a field (for example customerBase), state that the supplied data does not cover it rather than inventing detail.',
              'Return a valid JSON array only, matching exactly:',
              '[{"symbol":"string — must be one of candidates[].symbol","reasoning":{"growth":"string","profit":"string","customerBase":"string","liquidity":"string"},"aiSummary":"string"}]',
            ].join('\n'),
            prompt: JSON.stringify({
              task: 'Rank the 4-5 strongest growth candidates from the list below and explain each one using only the metrics given.',
              candidates,
            }),
            /**
             * สูงสุดในระบบเพราะ output ก้อนใหญ่สุด: 5 หุ้น × (reasoning 4 ช่อง +
             * aiSummary) = 25 ฟิลด์ข้อความในคำตอบเดียว
             *
             * แถมโมเดลตัวแรกคือ gemini ซึ่งหัก thinking token จากเพดานเดียวกันนี้
             * (ดู gemini.provider.ts) เพดานที่พอดีเป๊ะจึงกลายเป็นไม่พอเงียบ ๆ
             */
            maxOutputTokens: 2400,
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

    const rows = this.reconcile(
      this.extractArray(result.data),
      candidates,
    );
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

  private extractArray(data: unknown): unknown[] {
    if (Array.isArray(data)) return data;
    if (data && typeof data === 'object') {
      const nested = Object.values(
        data as Record<string, unknown>,
      ).find(Array.isArray);
      if (Array.isArray(nested)) return nested;
    }
    return [];
  }

  /**
   * ยอมรับเฉพาะหุ้นที่อยู่ใน candidate list ที่ส่งไปเท่านั้น
   *
   * บอกใน prompt ว่า "ห้ามตอบนอกลิสต์" ไม่ใช่การรับประกัน — ถ้าโมเดลยังหลุดไป
   * แนะนำหุ้นที่เราไม่ได้ส่งไปให้ แปลว่ามันกลับไปใช้ความจำเก่าอีกแล้ว ตัวนั้นจึงต้อง
   * ถูกตัดทิ้ง ไม่ใช่ส่งต่อให้ผู้ใช้เพราะ "ก็ดูสมเหตุสมผลดี"
   *
   * ตัวเลขและชื่อทั้งหมดเขียนทับด้วยของจากเซิร์ฟเวอร์ ไม่ได้เอาตามที่โมเดลตอบ —
   * โมเดลพิมพ์ราคาผิดหลักเดียวก็กลายเป็นข้อมูลผิดที่ผู้ใช้เอาไปตัดสินใจได้เลย
   */
  private reconcile(
    rows: unknown[],
    candidates: GrowthCandidate[],
  ): StockRecommendation[] {
    const bySymbol = new Map(
      candidates.map((candidate) => [
        candidate.symbol.toUpperCase(),
        candidate,
      ]),
    );

    const text = (value: unknown): string =>
      typeof value === 'string' ? value.trim() : '';

    const kept: StockRecommendation[] = [];
    const dropped: string[] = [];
    const seen = new Set<string>();

    for (const row of rows) {
      const raw = (row ?? {}) as {
        symbol?: unknown;
        reasoning?: Record<string, unknown>;
        aiSummary?: unknown;
      };
      const symbol = text(raw.symbol).toUpperCase();
      const candidate = bySymbol.get(symbol);

      if (!candidate) {
        dropped.push(symbol || '(ไม่มี symbol)');
        continue;
      }
      // ตอบตัวเดิมซ้ำก็ไม่ได้เพิ่มอะไรให้ผู้ใช้ เก็บอันแรกพอ
      if (seen.has(symbol)) continue;
      seen.add(symbol);

      const reasoning = (raw.reasoning ?? {}) as Record<
        string,
        unknown
      >;

      kept.push({
        symbol: candidate.symbol,
        name: candidate.name,
        sector: candidate.sector,
        asOf: candidate.asOf,
        metrics: candidate.metrics,
        reasoning: {
          growth: text(reasoning.growth),
          profit: text(reasoning.profit),
          customerBase: text(reasoning.customerBase),
          liquidity: text(reasoning.liquidity),
        },
        aiSummary: text(raw.aiSummary),
      });
    }

    if (dropped.length) {
      this.logger.warn(
        `AI Picks: ตัดหุ้นที่ไม่ได้อยู่ใน candidate list ออก ${dropped.length} ตัว [${dropped.join(', ')}]`,
      );
    }

    return kept;
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

import {
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AiManagerService } from './ai-manager.service';
import {
  concisenessRule,
  investmentGuardrail,
  outputLanguageRule,
  withLanguage,
  resolveOutputLanguage,
  screeningOnlyGuardrail,
} from './ai-prompt.shared';
import { StocksService, type GrowthCandidate } from '../stocks/stocks.service';
import type { StockRecommendation } from './ai-feature.types';

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
  private readonly logger = new Logger(AiRecommendationService.name);

  constructor(
    private readonly manager: AiManagerService,
    private readonly stocks: StocksService,
  ) {}

  async getGrowthRecommendations(userId: number, requestedLanguage?: string) {
    const outputLanguage = resolveOutputLanguage(requestedLanguage);

    const candidates = await this.stocks.getGrowthCandidates();

    if (candidates.length < MIN_GROWTH_CANDIDATES) {
      throw new ServiceUnavailableException({
        statusCode: 503,
        error: 'GROWTH_CANDIDATES_UNAVAILABLE',
        message:
          'Not enough live market data to build a candidate list right now. Please try again shortly.',
      });
    }

    const result = await this.manager.executeAiRequest<
      StockRecommendation[] | Record<string, unknown>
    >({
      userId,
      feature: 'ai_picks',
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
        "reasoning.growth and reasoning.profit must each cite a specific number from that candidate's metrics. reasoning.liquidity must refer to avgDailyVolume3M. If the metrics do not support a field (for example customerBase), state that the supplied data does not cover it rather than inventing detail.",
        'Return a valid JSON array only, matching exactly:',
        '[{"symbol":"string — must be one of candidates[].symbol","reasoning":{"growth":"string","profit":"string","customerBase":"string","liquidity":"string"},"aiSummary":"string"}]',
      ].join('\n'),
      prompt: JSON.stringify(
        withLanguage(
          {
            task: 'Rank the 4-5 strongest growth candidates from the list below and explain each one using only the metrics given.',
            candidates,
          },
          outputLanguage,
        ),
      ),
      expectedLanguage: outputLanguage,
      /**
       * สูงสุดในระบบเพราะ output ก้อนใหญ่สุด: 5 หุ้น × (reasoning 4 ช่อง +
       * aiSummary) = 25 ฟิลด์ข้อความในคำตอบเดียว
       *
       * เพดานนี้ยังเผื่อไว้สำหรับ provider ที่หัก thinking token จากเพดานเดียวกัน
       * (ดู gemini.provider.ts — ตอนนี้ปิดไว้) เผื่อเปิดกลับมาโดยไม่ต้องมาแก้ตรงนี้อีก
       */
      maxOutputTokens: 2400,
    });

    const rows = this.reconcile(this.extractArray(result.data), candidates);
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
    };
  }

  private extractArray(data: unknown): unknown[] {
    if (Array.isArray(data)) return data;
    if (data && typeof data === 'object') {
      const nested = Object.values(data as Record<string, unknown>).find(
        Array.isArray,
      );
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

      const reasoning = raw.reasoning ?? {};

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
}

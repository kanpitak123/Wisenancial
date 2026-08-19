import type { AiProviderId } from '../ai.models';

export interface AiTokenUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
}

export interface AiJsonResult<T> {
  readonly data: T;
  readonly usage: AiTokenUsage;
}

export interface AiGenerateOptions {
  /** Provider-native model string, taken from AiModelPricing.upstreamModel. */
  readonly upstreamModel: string;
  readonly prompt: string;
  readonly systemPrompt?: string;
  readonly temperature?: number;
  readonly maxOutputTokens?: number;
}

/**
 * Every LLM vendor is reduced to this one method. The manager routes by
 * provider id and never imports a vendor SDK directly.
 */
export interface IAiProvider {
  readonly id: AiProviderId;

  /** False when the API key is absent; the manager refuses the model instead of billing for a failure. */
  isConfigured(): boolean;

  generateJsonResponse<T>(options: AiGenerateOptions): Promise<AiJsonResult<T>>;
}

export const DEFAULT_TEMPERATURE = 0.3;
// เดิม 2048 — ทำให้คำตอบยาวๆ (โดยเฉพาะ JSON ที่มี field เยอะ) ถูกตัดกลางคันบ่อย
// จน parseJsonResponse หา { หรือ } ปิดไม่เจอ แล้วโดนจัดเป็น "permanent" (ดูหมายเหตุ
// AiResponseParseError ด้านล่าง) เพิ่มเพดานให้มีที่ไปต่อจนจบ JSON ก่อนโดนตัด
export const DEFAULT_MAX_OUTPUT_TOKENS = 4096;
export const AI_REQUEST_TIMEOUT_MS = 30_000;

/** Rough token count, used only when a provider omits usage metadata. ~4 chars/token. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * โยนออกมาตอน parseJsonResponse หา JSON ที่ใช้ได้ในคำตอบไม่เจอเลย — ส่วนใหญ่เกิด
 * จากคำตอบถูกตัดกลางคัน (ชน maxOutputTokens ก่อนโมเดลพิมพ์ปิด JSON ครบ) ไม่ใช่ว่า
 * prompt หรือ request ผิดจริง — จึงแยก type ออกมาให้ ai-retry.ts classifyAiFailure
 * จัดเป็น 'upstream-error' (ลองเจ้าอื่นต่อได้) แทนที่จะตกไปเป็น 'permanent' เหมือน
 * Error ทั่วไปที่ไม่มี type ชัดเจน แล้วทำให้ fallback chain หยุดทั้งที่ยังลองเจ้าอื่นได้อยู่
 */
export class AiResponseParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiResponseParseError';
  }
}

/**
 * Models sometimes wrap JSON in ```json fences or prose despite json-mode.
 * Strip fences, try a direct parse, then fall back to the outermost
 * {...} or [...] span embedded in the surrounding text.
 */
export function parseJsonResponse<T>(raw: string): T {
  // Prefer the content of a fenced block if one exists; otherwise strip a
  // leading/trailing fence and use the whole response.
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const cleaned = (fenced?.[1] ?? raw)
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();

  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // Fall through: prose around the JSON — extract the outermost span below.
  }

  const objStart = cleaned.indexOf('{');
  const arrStart = cleaned.indexOf('[');
  let start = -1;
  let end = -1;
  if (objStart !== -1 && (arrStart === -1 || objStart < arrStart)) {
    start = objStart;
    end = cleaned.lastIndexOf('}');
  } else if (arrStart !== -1) {
    start = arrStart;
    end = cleaned.lastIndexOf(']');
  }

  if (start !== -1 && end > start) {
    try {
      return JSON.parse(cleaned.slice(start, end + 1)) as T;
    } catch {
      // Fall through to the generic error below.
    }
  }

  throw new AiResponseParseError('LLM response contained no JSON object');
}

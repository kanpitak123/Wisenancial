import { Logger } from '@nestjs/common';

/**
 * ตรวจว่าคีย์ที่ตั้งไว้ "หน้าตาเป็นของ provider นั้นจริง" ก่อนจะนับว่าใช้งานได้
 *
 * ที่ต้องมีเพราะเคยเกิดขึ้นจริง: ช่อง ANTHROPIC_API_KEY ถูกใส่คีย์ของ Groq
 * (ขึ้นต้น gsk_) ไว้ ตัว isConfigured() เดิมดูแค่ว่า "มีค่าไหม" จึงตอบว่าใช้ได้
 * ผลคือโมเดล Claude โผล่ในตัวเลือกให้ผู้ใช้กด แล้วพังทุกครั้ง 100% โดยไม่มีอะไร
 * บอกว่าทำไม และตอน fallback ข้าม provider ก็เสียจังหวะไปหนึ่งช็อตกับ provider
 * ที่ไม่มีทางสำเร็จ
 *
 * "มีค่า" ไม่พอ ต้อง "มีค่าที่หน้าตาถูกต้อง"
 */
export interface ApiKeyFormat {
  /** ชื่อ env เอาไว้บอกในล็อกว่าต้องไปแก้ตรงไหน */
  envName: string;
  /** คำนำหน้าที่ผู้ให้บริการใช้จริง */
  prefix: string;
  /**
   * คำนำหน้าที่ต้องไม่ใช่ — มีไว้สำหรับกรณี prefix ซ้อนกัน
   * (คีย์ Anthropic คือ `sk-ant-` ซึ่งขึ้นต้นด้วย `sk-` ของ OpenAI ด้วย
   * ถ้าไม่กันไว้ คีย์ Anthropic ที่วางผิดช่องจะผ่านการตรวจของ OpenAI)
   */
  notPrefix?: string[];
  /** สั้นกว่านี้คือคีย์ไม่ครบ (โดนตัดตอนก๊อป/วางทับไม่หมด) */
  minLength: number;
}

export const API_KEY_FORMATS = {
  groq: {
    envName: 'GROQ_API_KEY',
    prefix: 'gsk_',
    minLength: 40,
  },
  openai: {
    envName: 'OPENAI_API_KEY',
    prefix: 'sk-',
    notPrefix: ['sk-ant-'],
    minLength: 40,
  },
  anthropic: {
    envName: 'ANTHROPIC_API_KEY',
    prefix: 'sk-ant-',
    minLength: 40,
  },
  gemini: {
    // คีย์ของ Google Cloud/AI Studio ขึ้นต้น AIza แล้วตามด้วยอีก 35 ตัว
    envName: 'GEMINI_API_KEY',
    prefix: 'AIza',
    minLength: 35,
  },
} as const satisfies Record<string, ApiKeyFormat>;

export function matchesApiKeyFormat(
  rawKey: string | undefined | null,
  format: ApiKeyFormat,
): boolean {
  const key = rawKey?.trim();

  if (!key || key.length < format.minLength) return false;
  if (!key.startsWith(format.prefix)) return false;

  return !format.notPrefix?.some((prefix) => key.startsWith(prefix));
}

/**
 * คืนคีย์เมื่อรูปแบบถูกต้องเท่านั้น ไม่ถูกต้อง = คืน undefined เหมือนไม่ได้ตั้ง
 *
 * แยกข้อความล็อกสองแบบโดยตั้งใจ — "ไม่ได้ตั้ง" กับ "ตั้งไว้แต่ผิดรูปแบบ" เป็นคนละ
 * ปัญหาและแก้คนละวิธี อันหลังคือกรณีที่คนตั้งค่าเชื่อว่าทำถูกแล้ว จึงต้องบอกให้ชัด
 * ว่าคาดหวังอะไร ไม่ใช่เงียบไปเฉย ๆ
 *
 * ไม่พิมพ์ตัวคีย์ลงล็อกแม้แต่บางส่วน — บอกความยาวกับสิ่งที่คาดหวังก็พอวินิจฉัยได้แล้ว
 */
export function resolveApiKey(
  rawKey: string | undefined,
  format: ApiKeyFormat,
  logger: Logger,
): string | undefined {
  const key = rawKey?.trim();

  if (!key) {
    logger.warn(`${format.envName} not set; these models are unavailable`);
    return undefined;
  }

  if (!matchesApiKeyFormat(key, format)) {
    logger.error(
      `${format.envName} is set but does not look like a key for this provider ` +
        `(expected a "${format.prefix}…" value of at least ${format.minLength} characters, got ${key.length}). ` +
        `Treating it as unset so these models stay out of the picker instead of failing on every request.`,
    );
    return undefined;
  }

  return key;
}

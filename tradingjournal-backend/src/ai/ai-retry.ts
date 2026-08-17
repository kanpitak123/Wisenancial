/**
 * แยกว่า error จาก provider ควรลองเจ้าถัดไปหรือควรหยุดทันที
 *
 * แยกออกมาจาก AiManagerService เพื่อให้เทสได้โดยไม่ต้องประกอบ Nest module
 * และเพราะ SDK แต่ละเจ้าวางรหัสสถานะไว้คนละที่ (groq/openai/anthropic ใช้ .status,
 * บางตัวใส่ไว้ใน .response.status, ส่วน error ระดับ network ไม่มีสถานะเลยมีแต่ .code)
 */

export type AiFailureKind =
  | 'rate-limit'
  | 'upstream-error'
  | 'network'
  | 'permanent';

interface ErrorLike {
  status?: unknown;
  statusCode?: unknown;
  code?: unknown;
  name?: unknown;
  message?: unknown;
  response?: { status?: unknown };
}

/** รหัสของ Node/undici ที่แปลว่าไปไม่ถึงปลายทาง — ลองเจ้าอื่นแล้วมีโอกาสผ่าน */
const NETWORK_ERROR_CODES = new Set([
  'ETIMEDOUT',
  'ESOCKETTIMEDOUT',
  'ECONNRESET',
  'ECONNREFUSED',
  'ECONNABORTED',
  'EPIPE',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ENOTFOUND',
  'EAI_AGAIN',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_SOCKET',
]);

const TIMEOUT_ERROR_NAMES = new Set([
  'AbortError',
  'TimeoutError',
  'APIConnectionTimeoutError',
  'APIConnectionError',
]);

function toNumber(value: unknown): number | undefined {
  const parsed = typeof value === 'string' ? Number(value) : value;

  return typeof parsed === 'number' && Number.isFinite(parsed)
    ? parsed
    : undefined;
}

function statusOf(error: ErrorLike): number | undefined {
  return (
    toNumber(error.status) ??
    toNumber(error.statusCode) ??
    toNumber(error.response?.status)
  );
}

/**
 * จัดประเภทความล้มเหลว
 *
 *   rate-limit     429 — เจ้านี้เต็มโควตา เจ้าอื่นอาจว่าง
 *   upstream-error 5xx — ฝั่งผู้ให้บริการล่ม
 *   network        timeout / DNS / connection reset — ไปไม่ถึงปลายทาง
 *   permanent      ที่เหลือ (4xx อื่นๆ, prompt ผิด, JSON พัง) — ลองเจ้าอื่นก็ได้ผลเดิม
 *
 * 401/403 ถูกจัดเป็น permanent โดยตั้งใจ: key ผิดคือปัญหา config ที่ต้องเห็นเสียงดัง
 * ไม่ใช่ปล่อยให้เงียบแล้วไปเผา provider ที่แพงกว่าแทนทุกครั้ง
 */
export function classifyAiFailure(error: unknown): AiFailureKind {
  if (error === null || typeof error !== 'object') {
    return 'permanent';
  }

  const candidate = error as ErrorLike;
  const status = statusOf(candidate);

  if (status === 429) {
    return 'rate-limit';
  }

  if (status !== undefined && status >= 500 && status <= 599) {
    return 'upstream-error';
  }

  // 4xx อื่นๆ = คำขอเองมีปัญหา ไม่ต้องเสียเวลาวนต่อ
  if (status !== undefined && status >= 400 && status < 500) {
    return 'permanent';
  }

  const code = typeof candidate.code === 'string' ? candidate.code : '';
  const name = typeof candidate.name === 'string' ? candidate.name : '';

  if (NETWORK_ERROR_CODES.has(code) || TIMEOUT_ERROR_NAMES.has(name)) {
    return 'network';
  }

  const message =
    typeof candidate.message === 'string'
      ? candidate.message.toLowerCase()
      : '';

  if (
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('socket hang up')
  ) {
    return 'network';
  }

  // ข้อความ rate limit ที่ SDK ไม่ได้แนบสถานะมาด้วย
  if (
    message.includes('rate limit') ||
    message.includes('too many requests') ||
    message.includes('quota exceeded')
  ) {
    return 'rate-limit';
  }

  return 'permanent';
}

/** เลื่อนไป provider ถัดไปได้ไหม */
export function isRetryableAiFailure(error: unknown): boolean {
  return classifyAiFailure(error) !== 'permanent';
}

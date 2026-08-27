/**
 * ผลปลายทางของการตรวจรูปแบบคีย์: provider ที่คีย์ผิดต้องรายงานว่า "ยังไม่ได้ตั้งค่า"
 *
 * `AiManagerService.listAvailableModels()` กรองตัวเลือกโมเดลด้วย isConfigured()
 * ดังนั้นถ้าตัวนี้ตอบ true ทั้งที่คีย์ใช้ไม่ได้ ผู้ใช้จะเห็นโมเดลที่กดแล้วพังทุกครั้ง
 * และ fallback chain ฝั่งระบบก็จะเสียจังหวะไปหนึ่งช็อตกับ provider ที่ไม่มีทางสำเร็จ
 */
import { Logger } from '@nestjs/common';
import { AnthropicProvider } from './anthropic.provider';
import { GeminiProvider } from './gemini.provider';
import { GroqProvider } from './groq.provider';
import { OpenAiProvider } from './openai.provider';

const GROQ_KEY = 'gsk_' + 'a'.repeat(52);
const ANTHROPIC_KEY = 'sk-ant-api03-' + 'a'.repeat(95);
const OPENAI_KEY = 'sk-proj-' + 'a'.repeat(60);
const GEMINI_KEY = 'AIza' + 'a'.repeat(35);

const ENV_KEYS = [
  'GROQ_API_KEY',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'GEMINI_API_KEY',
] as const;

const original: Record<string, string | undefined> = {};

beforeAll(() => {
  for (const key of ENV_KEYS) original[key] = process.env[key];
  // ปิดล็อกของ Nest ทั้งหมด — เทสชุดนี้จงใจสร้าง error log ทุกเคส ถ้าไม่ปิด
  // ผลรัน jest จะเต็มไปด้วยข้อความที่ดูเหมือนอะไรพัง (console.* ปิดไม่ได้
  // เพราะ Logger เขียนลง process.stdout เอง)
  Logger.overrideLogger(false);
});

afterEach(() => {
  for (const key of ENV_KEYS) delete process.env[key];
});

afterAll(() => {
  for (const key of ENV_KEYS) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
  Logger.overrideLogger(console);
  jest.restoreAllMocks();
});

describe('isConfigured() — คีย์ถูกต้อง', () => {
  it('ทั้ง 4 provider รายงานว่าพร้อมใช้งาน', () => {
    process.env.GROQ_API_KEY = GROQ_KEY;
    process.env.OPENAI_API_KEY = OPENAI_KEY;
    process.env.ANTHROPIC_API_KEY = ANTHROPIC_KEY;
    process.env.GEMINI_API_KEY = GEMINI_KEY;

    expect(new GroqProvider().isConfigured()).toBe(true);
    expect(new OpenAiProvider().isConfigured()).toBe(true);
    expect(new AnthropicProvider().isConfigured()).toBe(true);
    expect(new GeminiProvider().isConfigured()).toBe(true);
  });
});

describe('isConfigured() — คีย์ผิด provider', () => {
  /** เคสที่เจอจริงใน .env — คีย์ Groq นั่งอยู่ในช่อง Anthropic */
  it('ANTHROPIC_API_KEY เป็นคีย์ Groq -> Claude ไม่พร้อมใช้งาน', () => {
    process.env.ANTHROPIC_API_KEY = GROQ_KEY;

    expect(new AnthropicProvider().isConfigured()).toBe(false);
  });

  it('OPENAI_API_KEY เป็นคีย์ Anthropic -> OpenAI ไม่พร้อมใช้งาน (แม้ขึ้นต้น sk- เหมือนกัน)', () => {
    process.env.OPENAI_API_KEY = ANTHROPIC_KEY;

    expect(new OpenAiProvider().isConfigured()).toBe(false);
  });

  it('GROQ_API_KEY เป็นคีย์ Gemini -> Groq ไม่พร้อมใช้งาน', () => {
    process.env.GROQ_API_KEY = GEMINI_KEY;

    expect(new GroqProvider().isConfigured()).toBe(false);
  });

  it('GEMINI_API_KEY เป็นคีย์ OpenAI -> Gemini ไม่พร้อมใช้งาน', () => {
    process.env.GEMINI_API_KEY = OPENAI_KEY;

    expect(new GeminiProvider().isConfigured()).toBe(false);
  });
});

describe('isConfigured() — ไม่ได้ตั้งค่า (พฤติกรรมเดิมต้องไม่เปลี่ยน)', () => {
  it('ไม่ได้ตั้ง env เลย -> ทุกตัวไม่พร้อมใช้งาน', () => {
    expect(new GroqProvider().isConfigured()).toBe(false);
    expect(new OpenAiProvider().isConfigured()).toBe(false);
    expect(new AnthropicProvider().isConfigured()).toBe(false);
    expect(new GeminiProvider().isConfigured()).toBe(false);
  });

  it('ตั้งเป็นค่าว่าง/ช่องว่างล้วน -> ไม่พร้อมใช้งาน', () => {
    process.env.GROQ_API_KEY = '   ';

    expect(new GroqProvider().isConfigured()).toBe(false);
  });
});

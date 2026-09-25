/**
 * WebSocket ต้องใช้กติกา CORS ชุดเดียวกับ HTTP
 *
 * main.ts บังคับให้ตั้ง CORS_ORIGINS บน production และไม่ยอมรับ '*' (เพราะเปิด
 * credentials อยู่ เบราว์เซอร์จะบล็อกเงียบ ๆ) แต่ @WebSocketGateway ทั้งสองตัว
 * hardcode `origin: '*'` ไว้ในโค้ด จึงข้ามกติกานั้นไปทั้งหมด
 */
import { GATEWAY_OPTIONS } from '@nestjs/websockets/constants';
import { ChatGateway } from '../chat/chat.gateway';
import { NewsGateway } from '../news/news.gateway';
import {
  assertCorsOriginsValid,
  resolveCorsOrigins,
} from './cors-origins.util';

const ENV_KEYS = ['CORS_ORIGINS', 'FRONTEND_URL', 'NODE_ENV'] as const;
const original: Record<string, string | undefined> = {};

beforeAll(() => {
  for (const key of ENV_KEYS) original[key] = process.env[key];
});

afterEach(() => {
  for (const key of ENV_KEYS) delete process.env[key];
});

afterAll(() => {
  for (const key of ENV_KEYS) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
});

describe('resolveCorsOrigins', () => {
  it('แยกด้วย comma และตัดช่องว่างให้', () => {
    process.env.CORS_ORIGINS =
      ' https://wisenancial.app , https://www.wisenancial.app ';

    expect(resolveCorsOrigins()).toEqual([
      'https://wisenancial.app',
      'https://www.wisenancial.app',
    ]);
  });

  it('ไม่มี CORS_ORIGINS -> ถอยไปใช้ FRONTEND_URL', () => {
    process.env.FRONTEND_URL = 'https://wisenancial.app';

    expect(resolveCorsOrigins()).toEqual(['https://wisenancial.app']);
  });

  it('dev ที่ไม่ได้ตั้งอะไรเลย -> ถอยไป localhost:9000', () => {
    expect(resolveCorsOrigins()).toEqual(['http://localhost:9000']);
  });

  /**
   * ถ้าหลุดมาถึงตรงนี้แปลว่า assert ตอน boot ไม่ทำงาน — ตัดทิ้งดีกว่าส่ง '*'
   * ต่อให้ gateway ซึ่งเท่ากับเปิดให้ทุก origin
   */
  it("มี '*' ปนมา -> ถูกตัดออก ไม่ส่งต่อให้ gateway", () => {
    process.env.CORS_ORIGINS = 'https://wisenancial.app,*';

    expect(resolveCorsOrigins()).toEqual(['https://wisenancial.app']);
  });

  it('production ที่ไม่ได้ตั้งอะไรเลย -> รายการว่าง ไม่ถอยไป localhost', () => {
    process.env.NODE_ENV = 'production';

    expect(resolveCorsOrigins()).toEqual([]);
  });
});

describe('assertCorsOriginsValid', () => {
  it('production ที่ไม่ได้ตั้ง -> โยน error ตั้งแต่ boot', () => {
    process.env.NODE_ENV = 'production';

    expect(() => assertCorsOriginsValid()).toThrow(/must be set in production/);
  });

  it("ตั้ง '*' -> โยน error เพราะใช้คู่กับ credentials ไม่ได้", () => {
    process.env.CORS_ORIGINS = '*';

    expect(() => assertCorsOriginsValid()).toThrow(/cannot contain "\*"/);
  });

  it('ตั้งถูกต้อง -> คืนรายการเดียวกับ resolveCorsOrigins', () => {
    process.env.NODE_ENV = 'production';
    process.env.CORS_ORIGINS = 'https://wisenancial.app';

    expect(assertCorsOriginsValid()).toEqual(resolveCorsOrigins());
  });
});

/**
 * ตัวที่ปฏิเสธ origin จริง ๆ คือ engine.io ตอน handshake ไม่ใช่โค้ดเรา — สิ่งที่
 * ทดสอบได้และเป็นต้นเหตุของบั๊กคือ "gateway ถูกตั้งค่าด้วยรายการ origin ที่จำกัด
 * ไม่ใช่ '*'" ซึ่งอ่านจาก metadata ของ decorator ได้ตรง ๆ
 */
describe('WebSocket gateway ต้องไม่เปิดรับทุก origin', () => {
  const gateways = [
    ['NewsGateway', NewsGateway],
    ['ChatGateway', ChatGateway],
  ] as const;

  it.each(gateways)('%s ไม่ได้ตั้ง origin เป็น "*"', (_name, gateway) => {
    const options = Reflect.getMetadata(GATEWAY_OPTIONS, gateway) as {
      cors?: { origin?: unknown; credentials?: boolean };
    };

    const origin = options?.cors?.origin;

    expect(origin).not.toBe('*');
    expect(Array.isArray(origin)).toBe(true);
    expect(origin as string[]).not.toContain('*');
  });

  it.each(gateways)('%s เปิด credentials เหมือนฝั่ง HTTP', (_name, gateway) => {
    const options = Reflect.getMetadata(GATEWAY_OPTIONS, gateway) as {
      cors?: { credentials?: boolean };
    };

    expect(options?.cors?.credentials).toBe(true);
  });
});

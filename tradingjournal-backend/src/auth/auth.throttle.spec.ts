/**
 * /auth/login ต้องมีเพดานของตัวเองที่เข้มกว่าเพดานรวมของทั้งระบบ
 *
 * ThrottlerGuard ระดับ global คุมทุก endpoint ที่ 120 ครั้ง/นาที ซึ่งหลวมโดยตั้งใจ
 * เพราะหน้า Dashboard ยิงหลาย endpoint พร้อมกัน — แต่เพดานเดียวกันนั้นแปลว่าเดา
 * รหัสผ่านได้ 120 ครั้ง/นาที/IP ด้วย
 *
 * เทสนี้ยิงผ่าน guard จริง (ThrottlerGuard + ThrottlerStorage ของจริง) ไม่ได้ mock
 * ตัวนับ — ถ้าใครถอด @Throttle ออกจาก controller เทสนี้ต้องแดง
 */
import { ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  ThrottlerGuard,
  ThrottlerModule,
  ThrottlerException,
} from '@nestjs/throttler';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AUTH_THROTTLE } from './constants/auth.constants';
import { RefreshTokenService } from './refresh-token.service';
import { JwtAuthGuard } from './jwt-auth.guard';

/** เพดานรวมของระบบ ตั้งให้ห่างจากเพดาน auth ชัด ๆ จะได้รู้ว่าอันไหนทำงาน */
const GLOBAL_LIMIT = 120;

const login = jest.fn().mockResolvedValue({
  access_token: 'a',
  refresh_token: 'r',
  user: { id: 1 },
});

/** ปลอม response ของ express เท่าที่ controller ใช้ (แค่ตั้ง cookie) */
function fakeResponse() {
  return { cookie: jest.fn(), clearCookie: jest.fn() };
}

async function buildApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: GLOBAL_LIMIT }])],
    controllers: [AuthController],
    providers: [
      { provide: AuthService, useValue: { login } },
      {
        provide: RefreshTokenService,
        useValue: { ttlSeconds: 60 },
      },
      // ของจริงผูกเป็น APP_GUARD ใน app.module — ที่นี่ provide เป็น class ตรง ๆ
      // เพื่อให้ดึงตัว guard ออกมาเรียกเองได้ ตัวที่ทดสอบคือ guard + metadata ของ
      // @Throttle บน controller ซึ่งเป็นตัวเดียวกันทั้งสองทาง
      ThrottlerGuard,
    ],
  })
    // JwtAuthGuard ถูก inject ผ่าน @UseGuards บน /auth/me เท่านั้น ไม่เกี่ยวกับ
    // เทสนี้ แต่ต้อง provide ให้ DI ผ่าน
    .overrideGuard(JwtAuthGuard)
    .useValue({ canActivate: () => true })
    .compile();

  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
}

/**
 * ยิงผ่าน guard ตรง ๆ แทนการเปิดพอร์ตจริง — supertest ไม่ได้ติดตั้งในโปรเจกต์นี้
 * (ของเดิม test/app.e2e-spec.ts เคยพึ่ง supertest แบบนี้แล้ว compile ไม่ผ่าน ไม่มี npm
 * script ไหนเรียกใช้จริงด้วย จึงลบทิ้งไปแล้วแทนที่จะติดตั้ง dependency ใหม่)
 */
async function callLogin(
  app: INestApplication,
  ip: string,
): Promise<'ok' | 'throttled'> {
  const guard = app.get(ThrottlerGuard);
  const controller = app.get(AuthController);

  const request = {
    ip,
    ips: [],
    method: 'POST',
    url: '/auth/login',
    headers: {},
    body: {},
  };
  const response = fakeResponse();

  const context = {
    getClass: () => AuthController,
    // อ้างอิง method เพื่อให้ guard อ่าน decorator metadata เท่านั้น ไม่เคยเรียกเอง
    // eslint-disable-next-line @typescript-eslint/unbound-method
    getHandler: () => controller.login,
    getType: () => 'http',
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({ header: jest.fn(), ...response }),
    }),
  } as unknown as ExecutionContext;

  try {
    await guard.canActivate(context);
  } catch (error) {
    if (error instanceof ThrottlerException) return 'throttled';
    throw error;
  }

  return 'ok';
}

describe('/auth/login rate limit', () => {
  let app: INestApplication;

  beforeEach(async () => {
    jest.clearAllMocks();
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('เพดาน auth ต้องเข้มกว่าเพดานรวมของระบบอย่างมีนัยสำคัญ', () => {
    expect(AUTH_THROTTLE.limit).toBeLessThan(GLOBAL_LIMIT / 4);
    expect(AUTH_THROTTLE.limit).toBeGreaterThan(0);
  });

  it('ยิงถึงเพดานยังผ่าน แต่เกินไป 1 ครั้งถูกบล็อก', async () => {
    const results: string[] = [];

    for (let i = 0; i < AUTH_THROTTLE.limit; i++) {
      results.push(await callLogin(app, '203.0.113.10'));
    }

    expect(results.every((r) => r === 'ok')).toBe(true);
    expect(await callLogin(app, '203.0.113.10')).toBe('throttled');
  });

  it('ยิงเกินเพดานรัว ๆ -> โดนบล็อกก่อนถึง 120 ครั้งของเพดานรวม', async () => {
    let blocked = 0;

    for (let i = 0; i < 40; i++) {
      if ((await callLogin(app, '203.0.113.11')) === 'throttled') blocked++;
    }

    expect(blocked).toBe(40 - AUTH_THROTTLE.limit);
  });

  /** นับแยกราย IP ไม่งั้นคนหนึ่งยิงรัวแล้วล็อกคนทั้งระบบออกจากการล็อกอิน */
  it('IP อื่นไม่ได้รับผลจากคนที่โดนบล็อก', async () => {
    for (let i = 0; i <= AUTH_THROTTLE.limit; i++) {
      await callLogin(app, '203.0.113.12');
    }

    expect(await callLogin(app, '198.51.100.7')).toBe('ok');
  });
});
